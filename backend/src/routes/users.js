/**
 * DNJ Exchange — Users Router
 */
const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/users — Crear o actualizar usuario
router.post('/', async (req, res) => {
  const { uuid, name, phone, parish } = req.body;

  if (!uuid || !name || !phone || !parish) {
    return res.status(400).json({ error: 'Todos los campos son requeridos: uuid, name, phone, parish' });
  }
  if (typeof uuid !== 'string' || uuid.length < 10) {
    return res.status(400).json({ error: 'UUID inválido' });
  }

  try {
    const result = await db.query(
      `INSERT INTO users (uuid, name, phone, parish, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (uuid) DO UPDATE
         SET name = EXCLUDED.name,
             phone = EXCLUDED.phone,
             parish = EXCLUDED.parish,
             updated_at = NOW()
       RETURNING *`,
      [uuid, name.trim(), phone.trim(), parish.trim()]
    );
    return res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error('[Users] Error en POST /users:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/users/:uuid — Obtener usuario con sus solicitudes y matches
router.get('/:uuid', async (req, res) => {
  const { uuid } = req.params;

  try {
    // 1. Obtener usuario
    const userResult = await db.query(
      'SELECT * FROM users WHERE uuid = $1',
      [uuid]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const user = userResult.rows[0];

    // 2. Obtener solicitudes propias (sin importar cuántos matches tengan)
    const requestsResult = await db.query(
      `SELECT id, user_uuid, offers, wants, status, created_at, updated_at
       FROM requests
       WHERE user_uuid = $1
       ORDER BY created_at DESC`,
      [uuid]
    );

    // 3. Para cada solicitud propia, obtener sus matches
    const requests = [];
    for (const row of requestsResult.rows) {
      const matchStatuses = row.status === 'completed' ? ['completed'] : ['pending', 'confirmed'];
      const matchesResult = await db.query(
        `SELECT
          m.id AS match_id,
          m.zones_a_gives, m.zones_b_gives,
          m.status AS match_status, m.expires_at,
          m.request_a_id, m.request_b_id,
          other_req.id AS other_req_id,
          other_u.uuid AS other_uuid,
          other_u.name AS other_name,
          other_u.phone AS other_phone
         FROM matches m
         JOIN requests other_req ON other_req.id = CASE
           WHEN m.request_a_id = $1 THEN m.request_b_id
           ELSE m.request_a_id
         END
         JOIN users other_u ON other_u.uuid = other_req.user_uuid
         WHERE (m.request_a_id = $1 OR m.request_b_id = $1)
           AND m.status = ANY($2)
         ORDER BY m.created_at DESC`,
        [row.id, matchStatuses]
      );

      const matches = matchesResult.rows.map(m => {
        const isA = m.request_a_id === row.id;
        return {
          id: m.match_id,
          status: m.match_status,
          expires_at: m.expires_at,
          zones_i_give:    isA ? m.zones_a_gives : m.zones_b_gives,
          zones_i_receive: isA ? m.zones_b_gives : m.zones_a_gives,
          other_request_id: isA ? m.request_b_id : m.request_a_id,
          other_user: {
            uuid:  m.other_uuid,
            name:  m.other_name,
            phone: m.other_phone,
          },
        };
      });

      requests.push({
        id:         row.id,
        user_uuid:  row.user_uuid,
        offers:     row.offers,
        wants:      row.wants,
        status:     row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        matches,           // ← ARRAY de matches (puede tener 0, 1 o muchos)
        // Backwards compat alias (primer match, o null)
        match: matches.length > 0 ? matches[0] : null,
      });
    }

    // 4. Solicitudes de TODOS los otros usuarios activos (searching)
    //    para la pestaña "Todos" — se incluyen aunque ya tengan matches
    const allSearchingResult = await db.query(
      `SELECT
        r.id, r.offers, r.wants, r.created_at, r.status,
        u.name AS user_name, u.parish AS user_parish,
        -- Contar cuántos matches activos tiene esta solicitud con el usuario actual
        (SELECT COUNT(*) FROM matches m
         WHERE (m.request_a_id = r.id OR m.request_b_id = r.id)
           AND m.status IN ('pending','confirmed')
           AND (
             EXISTS (SELECT 1 FROM requests my_req
                     WHERE my_req.user_uuid = $1
                       AND (m.request_a_id = my_req.id OR m.request_b_id = my_req.id))
           )
        ) AS my_match_count
       FROM requests r
       JOIN users u ON u.uuid = r.user_uuid
       WHERE r.status = 'searching' AND r.user_uuid != $1
       ORDER BY r.created_at DESC`,
      [uuid]
    );

    return res.json({ user, requests, all_searching: allSearchingResult.rows });
  } catch (err) {
    console.error('[Users] Error en GET /users/:uuid:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
