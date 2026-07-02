/**
 * DNJ Exchange — Database Module
 * Gestiona el pool de conexiones a PostgreSQL y la inicialización del esquema.
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en cliente inactivo:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DB] (${duration}ms, rows=${res.rowCount}) ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
  }
  return res;
}

async function getClient() {
  return pool.connect();
}

async function init() {
  console.log('[DB] Inicializando esquema...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      uuid        TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      phone       TEXT NOT NULL,
      parish      TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id            SERIAL PRIMARY KEY,
      request_a_id  INT NOT NULL,
      request_b_id  INT NOT NULL,
      zones_a_gives TEXT[] NOT NULL,
      zones_b_gives TEXT[] NOT NULL,
      status        TEXT DEFAULT 'pending',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      expires_at    TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id          SERIAL PRIMARY KEY,
      user_uuid   TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
      offers      TEXT[] NOT NULL,
      wants       TEXT[] NOT NULL,
      status      TEXT DEFAULT 'searching' CHECK (status IN ('searching', 'completed', 'cancelled')),
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          SERIAL PRIMARY KEY,
      user_uuid   TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
      endpoint    TEXT NOT NULL UNIQUE,
      p256dh      TEXT NOT NULL,
      auth_key    TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_requests_user   ON requests(user_uuid);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_user       ON push_subscriptions(user_uuid);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_matches_status  ON matches(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_matches_expires ON matches(expires_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_matches_req_a   ON matches(request_a_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_matches_req_b   ON matches(request_b_id);`);

  console.log('[DB] Esquema inicializado correctamente.');
}

module.exports = { query, getClient, init, pool };
