/**
 * DNJ Exchange — Users Route Handler
 *
 * POST /api/users        — crear o actualizar usuario
 * GET  /api/users/:uuid  — obtener usuario con solicitudes y matches
 */

import { query, queryOne, run, serializeArray, parseArray } from '../db.js';
import { runMatcher } from '../services/matcher.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// POST /api/users
// ---------------------------------------------------------------------------

async function createUser(request, DB) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { uuid, name, phone, parish } = body;
  if (!uuid || !name || !phone || !parish) {
    return json({ error: 'Todos los campos son requeridos: uuid, name, phone, parish' }, 400);
  }
  if (typeof uuid !== 'string' || uuid.length < 10) {
    return json({ error: 'UUID inválido' }, 400);
  }

  // D1 doesn't support ON CONFLICT DO UPDATE with RETURNING in one shot,
  // so we use INSERT OR REPLACE (SQLite UPSERT)
  const now = new Date().toISOString();
  await run(DB,
    `INSERT INTO users (uuid, name, phone, parish, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(uuid) DO UPDATE SET
       name       = excluded.name,
       phone      = excluded.phone,
       parish     = excluded.parish,
       updated_at = excluded.updated_at`,
    [uuid, name.trim(), phone.trim(), parish.trim(), now, now]
  );

  const { rows } = await queryOne(DB, 'SELECT * FROM users WHERE uuid = ?', [uuid]);
  return json({ user: rows[0] }, 201);
}

// ---------------------------------------------------------------------------
// GET /api/users/:uuid
// ---------------------------------------------------------------------------

async function getUser(uuid, DB, ctx) {
  // 1. Get user
  const { rows: userRows } = await queryOne(DB, 'SELECT * FROM users WHERE uuid = ?', [uuid]);
  if (!userRows.length) return json({ error: 'Usuario no encontrado' }, 404);
  const user = userRows[0];

  // 2. Get own requests
  const { rows: reqRows } = await query(DB,
    `SELECT id, user_uuid, offers, wants, status, created_at, updated_at
     FROM requests
     WHERE user_uuid = ?
     ORDER BY created_at DESC`,
    [uuid]
  );

  // 3. For each request, load its matches with the other party's info
  const requests = [];
  for (const row of reqRows) {
    // Which statuses to fetch depends on the request's own status
    const matchStatuses = row.status === 'completed' ? ['completed'] : ['pending', 'confirmed'];

    // Fetch matches where this request is A or B
    const { rows: matchRows } = await query(DB,
      `SELECT
         m.id            AS match_id,
         m.zones_a_gives, m.zones_b_gives,
         m.status        AS match_status,
         m.expires_at,
         m.request_a_id, m.request_b_id,
         other_req.id    AS other_req_id,
         other_u.uuid    AS other_uuid,
         other_u.name    AS other_name,
         other_u.phone   AS other_phone
       FROM matches m
       JOIN requests other_req
         ON other_req.id = CASE
              WHEN m.request_a_id = ? THEN m.request_b_id
              ELSE m.request_a_id
            END
       JOIN users other_u ON other_u.uuid = other_req.user_uuid
       WHERE (m.request_a_id = ? OR m.request_b_id = ?)
         AND m.status IN (${matchStatuses.map(() => '?').join(',')})
       ORDER BY m.created_at DESC`,
      [row.id, row.id, row.id, ...matchStatuses]
    );

    const matches = matchRows.map(m => {
      const isA = m.request_a_id === row.id;
      return {
        id: m.match_id,
        status: m.match_status,
        expires_at: m.expires_at,
        zones_i_give:    isA ? parseArray(m.zones_a_gives) : parseArray(m.zones_b_gives),
        zones_i_receive: isA ? parseArray(m.zones_b_gives) : parseArray(m.zones_a_gives),
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
      offers:     parseArray(row.offers),
      wants:      parseArray(row.wants),
      status:     row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      matches,
      match: matches.length > 0 ? matches[0] : null,
    });
  }

  // 4. All other users' searching requests (for "Todos" tab)
  //    Also compute my_match_count in JS (avoids complex subquery in SQLite)
  const { rows: allRows } = await query(DB,
    `SELECT
       r.id, r.offers, r.wants, r.created_at, r.status,
       u.name    AS user_name,
       u.parish  AS user_parish
     FROM requests r
     JOIN users u ON u.uuid = r.user_uuid
     WHERE r.status = 'searching' AND r.user_uuid != ?
     ORDER BY r.created_at DESC`,
    [uuid]
  );

  // Load my request IDs for match-count lookup
  const myReqIds = new Set(reqRows.map(r => r.id));

  // Load all active matches involving any of my requests
  let myMatchPairs = new Set();
  if (myReqIds.size > 0) {
    const { rows: myMatches } = await query(DB,
      `SELECT request_a_id, request_b_id FROM matches
       WHERE status IN ('pending','confirmed')
         AND (${[...myReqIds].map(() => 'request_a_id = ? OR request_b_id = ?').join(' OR ')})`,
      [...myReqIds].flatMap(id => [id, id])
    );
    for (const m of myMatches) {
      myMatchPairs.add(`${m.request_a_id}-${m.request_b_id}`);
    }
  }

  const all_searching = allRows.map(r => {
    // Count how many of my requests have an active match with this request
    let myMatchCount = 0;
    for (const myId of myReqIds) {
      const lo = Math.min(myId, r.id);
      const hi = Math.max(myId, r.id);
      if (myMatchPairs.has(`${lo}-${hi}`)) myMatchCount++;
    }
    return {
      ...r,
      offers: parseArray(r.offers),
      wants:  parseArray(r.wants),
      my_match_count: myMatchCount,
    };
  });

  // Backfill matches for existing searching requests (dashboard polls every 5s).
  if (ctx?.waitUntil) {
    ctx.waitUntil(runMatcher(DB).catch(err => console.error('[Users] Matcher error:', err.message)));
  }

  return json({ user, requests, all_searching });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function handleUsers(request, env, url, ctx) {
  const DB     = env.DB;
  const method = request.method.toUpperCase();
  const parts  = url.pathname.split('/').filter(Boolean); // ['api', 'users', uuid?]
  const uuid   = parts[2];

  if (method === 'POST' && !uuid)  return createUser(request, DB);
  if (method === 'GET'  && uuid)   return getUser(uuid, DB, ctx);

  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
}
