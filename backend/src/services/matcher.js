const db = require('../db');
const notifier = require('./notifier');

// ---------------------------------------------------------------------------
// Core intersection helper
// ---------------------------------------------------------------------------

/**
 * Returns elements that exist in both arrays.
 */
function intersect(arrA, arrB) {
  return arrA.filter((x) => arrB.includes(x));
}

// ---------------------------------------------------------------------------
// Main matchmaking function
// ---------------------------------------------------------------------------

/**
 * runOnce()
 *
 * New algorithm (multi-match):
 *   1. Load all requests with status='searching'.
 *   2. For every unique pair (i, j):
 *        - Check bilateral zone intersection.
 *        - Check if an active match between these two requests already exists
 *          (status IN ('pending','confirmed')). If yes, skip to avoid duplicates.
 *        - If no active match exists, INSERT a new match row.
 *        - Requests stay 'searching' forever — they do NOT become 'reserved'.
 *   3. Send push notifications for each new match.
 *
 * This means one person can accumulate many simultaneous match offers,
 * and ALL searching requests remain visible in the "Todos" tab.
 */
async function runOnce() {
  console.log('[Matcher] runOnce() started');

  // Fetch all currently searching requests
  const result = await db.query(
    `SELECT id, user_uuid, offers, wants FROM requests WHERE status = 'searching' ORDER BY created_at ASC`
  );

  const requests = result.rows;
  console.log(`[Matcher] ${requests.length} searching request(s) found`);

  if (requests.length < 2) {
    console.log('[Matcher] Not enough requests to match, exiting');
    return;
  }

  // Load all currently active matches to avoid creating duplicates
  const activeMatchesResult = await db.query(
    `SELECT request_a_id, request_b_id FROM matches WHERE status IN ('pending', 'confirmed')`
  );
  // Build a Set of "a-b" keys (always low-high order) for fast lookup
  const activePairs = new Set(
    activeMatchesResult.rows.map(m => {
      const lo = Math.min(m.request_a_id, m.request_b_id);
      const hi = Math.max(m.request_a_id, m.request_b_id);
      return `${lo}-${hi}`;
    })
  );

  let matchesCreated = 0;

  for (let i = 0; i < requests.length; i++) {
    for (let j = i + 1; j < requests.length; j++) {
      const requestA = requests[i];
      const requestB = requests[j];

      // Skip self-matches (same user)
      if (requestA.user_uuid === requestB.user_uuid) continue;

      // Skip if they already have an active match together
      const lo = Math.min(requestA.id, requestB.id);
      const hi = Math.max(requestA.id, requestB.id);
      const pairKey = `${lo}-${hi}`;
      if (activePairs.has(pairKey)) continue;

      // Compute bilateral intersection
      const match_AB = intersect(requestA.offers, requestB.wants); // A gives to B
      const match_BA = intersect(requestB.offers, requestA.wants); // B gives to A

      // Both directions must be non-empty
      if (match_AB.length === 0 || match_BA.length === 0) continue;

      console.log(
        `[Matcher] New match: request ${requestA.id} <-> ${requestB.id} | A gives ${match_AB} | B gives ${match_BA}`
      );

      // Insert the match — no transaction needed since we're only inserting,
      // not changing request status. A small race window exists but is harmless
      // (worst case: a duplicate match gets created and one gets expired).
      let matchId = null;
      try {
        const matchInsert = await db.query(
          `INSERT INTO matches (request_a_id, request_b_id, zones_a_gives, zones_b_gives, status)
           VALUES ($1, $2, $3, $4, 'pending')
           RETURNING id`,
          [requestA.id, requestB.id, match_AB, match_BA]
        );
        matchId = matchInsert.rows[0].id;

        // Mark this pair as already matched so subsequent loop iterations skip it
        activePairs.add(pairKey);

        matchesCreated++;
        console.log(`[Matcher] Match created id=${matchId} between request ${requestA.id} and ${requestB.id}`);
      } catch (err) {
        console.error('[Matcher] Insert error:', err.message);
        continue;
      }

      // Push notifications (non-blocking)
      if (matchId !== null) {
        notifier.notifyMatch(matchId).catch((err) =>
          console.error('[Matcher] notifyMatch error:', err.message)
        );
      }
    }
  }

  console.log(`[Matcher] runOnce() finished -- ${matchesCreated} match(es) created`);
}

// ---------------------------------------------------------------------------
// Match expiration function
// ---------------------------------------------------------------------------

/**
 * expireOldMatches()
 *
 * Marks pending matches past their deadline as 'expired'.
 * Requests stay 'searching' regardless — no status reset needed.
 */
async function expireOldMatches() {
  console.log('[Matcher] expireOldMatches() started');

  try {
    const expiredResult = await db.query(
      `SELECT id FROM matches WHERE status = 'pending' AND expires_at < NOW()`
    );

    if (expiredResult.rows.length === 0) {
      console.log('[Matcher] No expired matches found');
      return;
    }

    const expiredIds = expiredResult.rows.map((r) => r.id);
    console.log(`[Matcher] Expiring ${expiredIds.length} match(es): ${expiredIds.join(', ')}`);

    await db.query(
      `UPDATE matches SET status = 'expired' WHERE id = ANY($1)`,
      [expiredIds]
    );

    console.log(`[Matcher] expireOldMatches() finished -- ${expiredIds.length} match(es) expired`);
  } catch (err) {
    console.error('[Matcher] expireOldMatches error:', err.message);
  }
}

module.exports = { runOnce, expireOldMatches };
