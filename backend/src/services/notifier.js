const webPush = require('web-push');
const db = require('../db');

/**
 * Send a Web Push notification to all subscriptions for a given user.
 *
 * Stale subscriptions (responded with HTTP 410 Gone) are automatically removed
 * from the database since the user has unsubscribed on the browser side.
 *
 * @param {string} userUuid - The user to notify.
 * @param {{ title: string, body: string, data: object }} payload - Notification content.
 */
async function notifyUser(userUuid, payload) {
  try {
    const result = await db.query(
      'SELECT * FROM push_subscriptions WHERE user_uuid = $1',
      [userUuid]
    );

    if (result.rows.length === 0) {
      console.log(`[Notifier] No subscriptions found for user_uuid=${userUuid}`);
      return;
    }

    const payloadStr = JSON.stringify(payload);

    // Send to all subscriptions in parallel; collect stale ones for cleanup
    const staleEndpoints = [];

    await Promise.all(
      result.rows.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth_key,
          },
        };

        try {
          await webPush.sendNotification(pushSubscription, payloadStr);
          console.log(`[Notifier] Push sent to endpoint=${sub.endpoint.slice(0, 60)}...`);
        } catch (err) {
          if (err.statusCode === 410) {
            // 410 Gone — subscription is no longer valid
            console.log(`[Notifier] Stale subscription detected, marking for removal: endpoint=${sub.endpoint.slice(0, 60)}...`);
            staleEndpoints.push(sub.endpoint);
          } else {
            console.error(`[Notifier] Push error for endpoint=${sub.endpoint.slice(0, 60)}...:`, err.message);
          }
        }
      })
    );

    // Clean up stale subscriptions
    for (const endpoint of staleEndpoints) {
      await db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
      console.log(`[Notifier] Removed stale subscription endpoint=${endpoint.slice(0, 60)}...`);
    }
  } catch (err) {
    console.error('[Notifier] notifyUser error:', err.message);
  }
}

/**
 * Notify both users involved in a match that they have been paired.
 *
 * @param {number} matchId - The ID of the match to notify about.
 */
async function notifyMatch(matchId) {
  try {
    // Fetch the match record
    const matchResult = await db.query('SELECT * FROM matches WHERE id = $1', [matchId]);
    if (matchResult.rows.length === 0) {
      console.warn(`[Notifier] notifyMatch: match id=${matchId} not found`);
      return;
    }
    const match = matchResult.rows[0];

    // Fetch both requests to get their user UUIDs
    const reqResult = await db.query(
      'SELECT id, user_uuid FROM requests WHERE id = ANY($1)',
      [[match.request_a_id, match.request_b_id]]
    );

    const requestMap = {};
    for (const row of reqResult.rows) {
      requestMap[row.id] = row;
    }

    const requestA = requestMap[match.request_a_id];
    const requestB = requestMap[match.request_b_id];

    if (!requestA || !requestB) {
      console.warn(`[Notifier] notifyMatch: could not find both requests for match id=${matchId}`);
      return;
    }

    // Notify user A -- they give zones_a_gives and receive zones_b_gives
    await notifyUser(requestA.user_uuid, {
      title: 'Match encontrado! 🎉',
      body: `Tienes un intercambio pendiente. Tu das: ${match.zones_a_gives.join(', ')} y recibes: ${match.zones_b_gives.join(', ')}`,
      data: {
        requestId: match.request_a_id,
        matchId: match.id,
        type: 'match_found',
      },
    });

    // Notify user B -- they give zones_b_gives and receive zones_a_gives
    await notifyUser(requestB.user_uuid, {
      title: 'Match encontrado! 🎉',
      body: `Tienes un intercambio pendiente. Tu das: ${match.zones_b_gives.join(', ')} y recibes: ${match.zones_a_gives.join(', ')}`,
      data: {
        requestId: match.request_b_id,
        matchId: match.id,
        type: 'match_found',
      },
    });

    console.log(`[Notifier] Notified both users for match id=${matchId}`);
  } catch (err) {
    console.error('[Notifier] notifyMatch error:', err.message);
  }
}

module.exports = { notifyUser, notifyMatch };
