/**
 * DNJ Exchange — Matcher Service (D1 version)
 *
 * Finds matching request pairs and inserts match rows.
 * Called both from the cron trigger (scheduled()) and immediately after
 * a new request is created.
 *
 * Algorithm (unchanged from the PostgreSQL version):
 *  1. Load all 'searching' requests.
 *  2. For every unique pair (i, j) of different users:
 *       a. Skip if an active match (pending/confirmed) already exists.
 *       b. Compute bilateral zone intersection.
 *       c. If both directions are non-empty → INSERT a new match.
 *  3. Requests remain 'searching' indefinitely (no locking).
 */

import { query, run, parseArray, serializeArray } from '../db.js';

function intersect(a, b) {
  return a.filter(x => b.includes(x));
}

// ---------------------------------------------------------------------------
// Expire old pending matches
// ---------------------------------------------------------------------------

async function expireOldMatches(DB) {
  const now = new Date().toISOString();
  const { rowCount } = await run(DB,
    `UPDATE matches SET status = 'expired'
     WHERE status = 'pending' AND expires_at < ?`,
    [now]
  );
  if (rowCount > 0) console.log(`[Matcher] Expired ${rowCount} match(es)`);
}

// ---------------------------------------------------------------------------
// Main matchmaking pass
// ---------------------------------------------------------------------------

async function runOnce(DB) {
  console.log('[Matcher] runOnce() started');

  const { rows: requests } = await query(DB,
    `SELECT id, user_uuid, offers, wants FROM requests WHERE status = 'searching' ORDER BY created_at ASC`
  );
  console.log(`[Matcher] ${requests.length} searching request(s)`);

  if (requests.length < 2) return;

  // Build set of already-active pairs to avoid duplicates
  const { rows: activeMatches } = await query(DB,
    `SELECT request_a_id, request_b_id FROM matches WHERE status IN ('pending', 'confirmed')`
  );
  const activePairs = new Set(
    activeMatches.map(m => {
      const lo = Math.min(m.request_a_id, m.request_b_id);
      const hi = Math.max(m.request_a_id, m.request_b_id);
      return `${lo}-${hi}`;
    })
  );

  let created = 0;

  for (let i = 0; i < requests.length; i++) {
    for (let j = i + 1; j < requests.length; j++) {
      const A = requests[i];
      const B = requests[j];

      if (A.user_uuid === B.user_uuid) continue;

      const lo = Math.min(A.id, B.id);
      const hi = Math.max(A.id, B.id);
      const key = `${lo}-${hi}`;
      if (activePairs.has(key)) continue;

      const offersA = parseArray(A.offers);
      const wantsA  = parseArray(A.wants);
      const offersB = parseArray(B.offers);
      const wantsB  = parseArray(B.wants);

      const matchAB = intersect(offersA, wantsB); // A gives to B
      const matchBA = intersect(offersB, wantsA); // B gives to A

      if (matchAB.length === 0 || matchBA.length === 0) continue;

      const now = new Date().toISOString();
      // expires_at = now + 30 minutes
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      try {
        await run(DB,
          `INSERT INTO matches (request_a_id, request_b_id, zones_a_gives, zones_b_gives, status, created_at, expires_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
          [A.id, B.id, serializeArray(matchAB), serializeArray(matchBA), now, expiresAt]
        );
        activePairs.add(key);
        created++;
        console.log(`[Matcher] Match created: req ${A.id} <-> ${B.id} | A gives ${matchAB} | B gives ${matchBA}`);
      } catch (err) {
        console.error('[Matcher] Insert error:', err.message);
      }
    }
  }

  console.log(`[Matcher] runOnce() done — ${created} match(es) created`);
}

// ---------------------------------------------------------------------------
// Exported combined runner (called from cron + on new request creation)
// ---------------------------------------------------------------------------

export async function runMatcher(DB) {
  await expireOldMatches(DB);
  await runOnce(DB);
}
