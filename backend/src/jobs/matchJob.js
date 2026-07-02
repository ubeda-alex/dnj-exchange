const cron = require('node-cron');
const matcher = require('../services/matcher');

// Start the recurring matchmaking cron job.
//
// Runs every 30 seconds:
//   - matcher.expireOldMatches() -- expire pending matches past their deadline
//   - matcher.runOnce()          -- find and create new matches
//
// Cron expression '*/30 * * * * *' uses 6-field syntax (node-cron supports seconds):
//   field order: second minute hour day-of-month month day-of-week
function start() {
  console.log('[MatchJob] Starting cron job -- every 30 seconds');

  cron.schedule('*/30 * * * * *', async () => {
    console.log('[MatchJob] Tick --', new Date().toISOString());
    try {
      await matcher.expireOldMatches();
      await matcher.runOnce();
    } catch (err) {
      console.error('[MatchJob] Error during scheduled run:', err.message);
    }
  });
}

module.exports = { start };
