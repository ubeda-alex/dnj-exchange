-- DNJ Exchange — D1 (SQLite) Schema
-- Equivalente al schema PostgreSQL pero compatible con SQLite

-- Usuarios
CREATE TABLE IF NOT EXISTS users (
  uuid       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  parish     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Solicitudes
-- NOTA: offers y wants se almacenan como JSON strings, ej: '["A-1","A-2"]'
CREATE TABLE IF NOT EXISTS requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid  TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  offers     TEXT NOT NULL DEFAULT '[]',
  wants      TEXT NOT NULL DEFAULT '[]',
  status     TEXT NOT NULL DEFAULT 'searching'
               CHECK (status IN ('searching', 'completed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Matches
-- NOTA: zones_a_gives y zones_b_gives también son JSON strings
CREATE TABLE IF NOT EXISTS matches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  request_a_id  INTEGER NOT NULL REFERENCES requests(id),
  request_b_id  INTEGER NOT NULL REFERENCES requests(id),
  zones_a_gives TEXT NOT NULL DEFAULT '[]',
  zones_b_gives TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL DEFAULT (datetime('now', '+30 minutes'))
);

-- Suscripciones Push (desactivado por ahora, pero el schema lo mantiene)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid  TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth_key   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_user   ON requests(user_uuid);
CREATE INDEX IF NOT EXISTS idx_matches_status  ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_req_a   ON matches(request_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_req_b   ON matches(request_b_id);
CREATE INDEX IF NOT EXISTS idx_push_user       ON push_subscriptions(user_uuid);
