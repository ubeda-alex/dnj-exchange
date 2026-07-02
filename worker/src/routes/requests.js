/**
 * DNJ Exchange — Requests Route Handler
 *
 * POST  /api/requests                       — crear solicitud
 * GET   /api/requests/:id                   — obtener solicitud
 * PATCH /api/requests/:id                   — cancelar / completar solicitud
 * PATCH /api/requests/match/:match_id/complete — completar un match específico
 */

import { query, queryOne, run, serializeArray, parseArray, tx } from '../db.js';
import { runMatcher } from '../services/matcher.js';

const ZONE_REGEX = /^[A-Z]-([1-9]|10)$/;

function validateZones(zones) {
  if (!Array.isArray(zones) || zones.length === 0) return false;
  return zones.every(z => typeof z === 'string' && ZONE_REGEX.test(z));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// POST /api/requests
// ---------------------------------------------------------------------------

async function createRequest(request, DB) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { user_uuid, offers, wants } = body;
  if (!user_uuid) return json({ error: 'user_uuid es requerido' }, 400);
  if (!validateZones(offers)) return json({ error: 'offers debe ser un array no vacío de zonas válidas (ej: A-1)' }, 400);
  if (!validateZones(wants))  return json({ error: 'wants debe ser un array no vacío de zonas válidas (ej: B-3)' }, 400);

  // Verify user exists
  const { rows: userRows } = await queryOne(DB, 'SELECT uuid FROM users WHERE uuid = ?', [user_uuid]);
  if (!userRows.length) return json({ error: 'Usuario no encontrado' }, 404);

  const now = new Date().toISOString();
  const { lastInsertRowid } = await run(DB,
    `INSERT INTO requests (user_uuid, offers, wants, status, created_at, updated_at)
     VALUES (?, ?, ?, 'searching', ?, ?)`,
    [user_uuid, serializeArray(offers), serializeArray(wants), now, now]
  );

  const { rows } = await queryOne(DB, 'SELECT * FROM requests WHERE id = ?', [lastInsertRowid]);
  const newRequest = { ...rows[0], offers: parseArray(rows[0].offers), wants: parseArray(rows[0].wants) };

  console.log(`[Requests] Nueva solicitud #${newRequest.id} de usuario ${user_uuid}`);

  // Workers cancel pending promises once the response is sent unless we
  // await or register with waitUntil — fire-and-forget silently never ran.
  await runMatcher(DB);

  return json({ request: newRequest }, 201);
}

// ---------------------------------------------------------------------------
// GET /api/requests/:id
// ---------------------------------------------------------------------------

async function getRequest(id, DB) {
  const { rows } = await queryOne(DB, 'SELECT * FROM requests WHERE id = ?', [id]);
  if (!rows.length) return json({ error: 'Solicitud no encontrada' }, 404);
  const r = rows[0];
  return json({ request: { ...r, offers: parseArray(r.offers), wants: parseArray(r.wants) } });
}

// ---------------------------------------------------------------------------
// PATCH /api/requests/:id — change status to cancelled or completed
// ---------------------------------------------------------------------------

async function updateRequest(id, request, DB) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { status } = body;
  if (!['completed', 'cancelled'].includes(status)) {
    return json({ error: "status debe ser 'completed' o 'cancelled'" }, 400);
  }

  const { rows } = await queryOne(DB, 'SELECT * FROM requests WHERE id = ?', [id]);
  if (!rows.length) return json({ error: 'Solicitud no encontrada' }, 404);

  const now = new Date().toISOString();
  await tx(DB, async (t) => {
    await t.run(`UPDATE requests SET status = ?, updated_at = ? WHERE id = ?`, [status, now, id]);
    await t.run(
      `UPDATE matches SET status = 'cancelled'
       WHERE (request_a_id = ? OR request_b_id = ?)
         AND status IN ('pending', 'confirmed')`,
      [id, id]
    );
  });

  const { rows: updated } = await queryOne(DB, 'SELECT * FROM requests WHERE id = ?', [id]);
  const r = updated[0];
  return json({ request: { ...r, offers: parseArray(r.offers), wants: parseArray(r.wants) } });
}

// ---------------------------------------------------------------------------
// PATCH /api/requests/match/:match_id/complete
// ---------------------------------------------------------------------------

async function completeMatch(matchId, DB) {
  const { rows: matchRows } = await queryOne(DB, 'SELECT * FROM matches WHERE id = ?', [matchId]);
  if (!matchRows.length) return json({ error: 'Match no encontrado' }, 404);
  const match = matchRows[0];

  const now = new Date().toISOString();
  const reqA = match.request_a_id;
  const reqB = match.request_b_id;

  await tx(DB, async (t) => {
    // Mark this match as completed
    await t.run(`UPDATE matches SET status = 'completed' WHERE id = ?`, [matchId]);
    // Mark both requests as completed
    await t.run(`UPDATE requests SET status = 'completed', updated_at = ? WHERE id = ?`, [now, reqA]);
    await t.run(`UPDATE requests SET status = 'completed', updated_at = ? WHERE id = ?`, [now, reqB]);
    // Cancel all other active matches for both requests
    await t.run(
      `UPDATE matches SET status = 'cancelled'
       WHERE id != ?
         AND (request_a_id = ? OR request_b_id = ? OR request_a_id = ? OR request_b_id = ?)
         AND status IN ('pending', 'confirmed')`,
      [matchId, reqA, reqA, reqB, reqB]
    );
  });

  console.log(`[Requests] Match #${matchId} completado`);
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function handleRequests(request, env, url, _ctx) {
  const DB     = env.DB;
  const method = request.method.toUpperCase();
  const parts  = url.pathname.split('/').filter(Boolean);
  // parts: ['api', 'requests', ...]

  // PATCH /api/requests/match/:match_id/complete
  if (method === 'PATCH' && parts[2] === 'match' && parts[4] === 'complete') {
    const matchId = parseInt(parts[3]);
    if (isNaN(matchId)) return json({ error: 'match_id inválido' }, 400);
    return completeMatch(matchId, DB);
  }

  const id = parseInt(parts[2]);

  if (method === 'POST' && !parts[2])         return createRequest(request, DB);
  if (method === 'GET'  && !isNaN(id))        return getRequest(id, DB);
  if (method === 'PATCH' && !isNaN(id))       return updateRequest(id, request, DB);

  return json({ error: 'Not found' }, 404);
}
