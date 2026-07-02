require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const webPush = require('web-push');

const db = require('./db');
const usersRouter = require('./routes/users');
const requestsRouter = require('./routes/requests');
const pushRouter = require('./routes/push');
const matchJob = require('./jobs/matchJob');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(helmet());
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api/users', usersRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/push', pushRouter);

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[App] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start() {
  try {
    // Initialize DB schema (idempotent)
    await db.init();

    // Configure VAPID details for Web Push
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@dnj-exchange.app';

    if (vapidPublicKey && vapidPrivateKey) {
      webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      console.log('[App] VAPID details configured');
    } else {
      console.warn(
        '[App] WARNING: VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY not set -- push notifications disabled'
      );
    }

    // Start the recurring matchmaking cron job
    matchJob.start();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`[App] DNJ Exchange backend listening on port ${PORT}`);
    });

    // ---------------------------------------------------------------------------
    // Graceful shutdown
    // ---------------------------------------------------------------------------

    const shutdown = async (signal) => {
      console.log(`[App] Received ${signal}, shutting down gracefully...`);
      server.close(async () => {
        try {
          await db.pool.end();
          console.log('[App] Database pool closed. Goodbye.');
          process.exit(0);
        } catch (err) {
          console.error('[App] Error closing DB pool:', err.message);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('[App] Startup error:', err.message);
    process.exit(1);
  }
}

start();
