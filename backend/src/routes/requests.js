/**
 * DNJ Exchange — Requests Router
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const matcher = require('../services/matcher');

// Regex para validar el formato de zona: LETRA-NUMERO (ej: A-1, Z-10)
const ZONE_REGEX = /^[A-Z]-([1-9]|10)$/;

function validateZones(zones) {
  if (!Array.isArray(zones) || zones.length === 0) return false;
  return zones.every(z => typeof z === 'string' && ZONE_REGEX.test(z));
}

// POST /api/requests — Crear una nueva solicitud de intercambio
router.post('/', async (req, res) => {
  const { user_uuid, offers, wants } = req.body;

  if (!user_uuid) {
    return res.status(400).json({ error: 'user_uuid es requerido' });
  }
  if (!validateZones(offers)) {
    return res.status(400).json({ error: 'offers debe ser un array no vacío de zonas válidas (ej: A-1)' });
  }
  if (!validateZones(wants)) {
    return res.status(400).json({ error: 'wants debe ser un array no vacío de zonas válidas (ej: B-3)' });
  }

  try {
    const userCheck = await db.query('SELECT uuid FROM users WHERE uuid = $1', [user_uuid]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Error verificando usuario' });
  }

  try {
    const result = await db.query(
      `INSERT INTO requests (user_uuid, offers, wants, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'searching', NOW(), NOW())
       RETURNING *`,
      [user_uuid, offers, wants]
    );
    const newRequest = result.rows[0];
    console.log(`[Requests] Nueva solicitud #${newRequest.id} de usuario ${user_uuid}: ofrece [${offers}], busca [${wants}]`);

    // Ejecutar el matcher en background (no bloquear la respuesta)
    setImmediate(() => matcher.runOnce().catch(console.error));

    return res.status(201).json({ request: newRequest });
  } catch (err) {
    console.error('[Requests] Error en POST /requests:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/requests/:id — Obtener una solicitud por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  try {
    const result = await db.query(
      `SELECT * FROM requests WHERE id = $1`,
      [parseInt(id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    return res.json({ request: result.rows[0] });
  } catch (err) {
    console.error('[Requests] Error en GET /requests/:id:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/requests/:id — Actualizar el estado de una solicitud (completed / cancelled)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  if (!['completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: "status debe ser 'completed' o 'cancelled'" });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      'SELECT * FROM requests WHERE id = $1 FOR UPDATE',
      [parseInt(id)]
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    // Actualizar la solicitud
    const updated = await client.query(
      'UPDATE requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, parseInt(id)]
    );

    // Cancelar todos sus matches activos
    await client.query(
      `UPDATE matches SET status = 'cancelled'
       WHERE (request_a_id = $1 OR request_b_id = $1)
         AND status IN ('pending', 'confirmed')`,
      [parseInt(id)]
    );

    await client.query('COMMIT');
    console.log(`[Requests] Solicitud #${id} actualizada a '${status}'`);

    return res.json({ request: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Requests] Error en PATCH /requests/:id:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// PATCH /api/requests/:match_id/confirm-zone
// Body: { request_id, zones_i_give: ["B-1"], zones_i_receive: ["A-3"] }
// Ahora se pasa el match_id y el request_id del usuario actual
router.patch('/:match_id/confirm-zone', async (req, res) => {
  const { match_id } = req.params;
  const { request_id, zones_i_give, zones_i_receive } = req.body;

  if (isNaN(match_id)) return res.status(400).json({ error: 'match_id inválido' });
  if (isNaN(request_id)) return res.status(400).json({ error: 'request_id es requerido' });
  if (!Array.isArray(zones_i_give) || !Array.isArray(zones_i_receive)) {
    return res.status(400).json({ error: 'zones_i_give y zones_i_receive deben ser arrays' });
  }
  if (zones_i_give.length === 0 || zones_i_receive.length === 0) {
    return res.status(400).json({ error: 'Debes seleccionar al menos una zona para dar y una para recibir' });
  }
  if (zones_i_give.length !== zones_i_receive.length) {
    return res.status(400).json({ error: 'La cantidad de zonas a dar debe ser igual a la cantidad a recibir' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const matchResult = await client.query(
      'SELECT * FROM matches WHERE id = $1 FOR UPDATE',
      [parseInt(match_id)]
    );
    if (matchResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Match no encontrado' });
    }
    const match = matchResult.rows[0];

    if (!['pending', 'confirmed'].includes(match.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Este match ya no está activo' });
    }

    // Determinar si esta solicitud es A o B
    const isA = match.request_a_id === parseInt(request_id);
    if (!isA && match.request_b_id !== parseInt(request_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Esta solicitud no pertenece a este match' });
    }

    const myGiveCandidates = isA ? match.zones_a_gives : match.zones_b_gives;
    const myRecvCandidates = isA ? match.zones_b_gives : match.zones_a_gives;

    for (const zone of zones_i_give) {
      if (!myGiveCandidates.includes(zone)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `La zona '${zone}' no está entre las candidatas: ${myGiveCandidates.join(', ')}` });
      }
    }
    for (const zone of zones_i_receive) {
      if (!myRecvCandidates.includes(zone)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `La zona '${zone}' no está entre las candidatas: ${myRecvCandidates.join(', ')}` });
      }
    }

    const newZonesA = isA ? zones_i_give    : zones_i_receive;
    const newZonesB = isA ? zones_i_receive : zones_i_give;

    await client.query(
      `UPDATE matches SET zones_a_gives = $1, zones_b_gives = $2, status = 'confirmed' WHERE id = $3`,
      [newZonesA, newZonesB, match.id]
    );

    await client.query('COMMIT');
    console.log(`[Requests] Match #${match_id} confirmó zonas`);

    return res.json({ ok: true, zones_i_give, zones_i_receive });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Requests] Error en PATCH confirm-zone:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// PATCH /api/requests/match/:match_id/complete — Completar un match específico
router.patch('/match/:match_id/complete', async (req, res) => {
  const { match_id } = req.params;
  if (isNaN(match_id)) return res.status(400).json({ error: 'match_id inválido' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const matchResult = await client.query(
      'SELECT * FROM matches WHERE id = $1 FOR UPDATE',
      [parseInt(match_id)]
    );
    if (matchResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Match no encontrado' });
    }
    const match = matchResult.rows[0];

    await client.query(
      `UPDATE matches SET status = 'completed' WHERE id = $1`,
      [parseInt(match_id)]
    );

    // Marcar ambas solicitudes como completadas
    await client.query(
      `UPDATE requests SET status = 'completed', updated_at = NOW()
       WHERE id = ANY($1)`,
      [[match.request_a_id, match.request_b_id]]
    );

    // Cancelar todos los demás matches activos para ambas solicitudes involucradas
    await client.query(
      `UPDATE matches SET status = 'cancelled'
       WHERE id != $1
         AND (request_a_id = $2 OR request_b_id = $2 OR request_a_id = $3 OR request_b_id = $3)
         AND status IN ('pending', 'confirmed')`,
      [match.id, match.request_a_id, match.request_b_id]
    );

    await client.query('COMMIT');
    console.log(`[Requests] Match #${match_id} completado`);

    return res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Requests] Error en complete match:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

module.exports = router;
