-- DNJ Exchange — Schema Inicial PostgreSQL
-- Este archivo se ejecuta automáticamente al crear el contenedor por primera vez.

-- Usuarios (identificados por UUID generado en el cliente)
CREATE TABLE IF NOT EXISTS users (
  uuid        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  parish      TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Matches (creados por el motor de emparejamiento)
CREATE TABLE IF NOT EXISTS matches (
  id            SERIAL PRIMARY KEY,
  request_a_id  INT NOT NULL,
  request_b_id  INT NOT NULL,
  zones_a_gives TEXT[] NOT NULL,
  zones_b_gives TEXT[] NOT NULL,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'expired')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes'
);

-- Solicitudes de intercambio
-- Sin match_id: ahora una solicitud puede tener varios matches simultáneos
CREATE TABLE IF NOT EXISTS requests (
  id          SERIAL PRIMARY KEY,
  user_uuid   TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  offers      TEXT[] NOT NULL,
  wants       TEXT[] NOT NULL,
  status      TEXT DEFAULT 'searching' CHECK (status IN ('searching', 'completed', 'cancelled')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Suscripciones Web Push (VAPID)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          SERIAL PRIMARY KEY,
  user_uuid   TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Agregar foreign keys de matches -> requests después de crear requests
ALTER TABLE matches ADD CONSTRAINT fk_match_req_a
  FOREIGN KEY (request_a_id) REFERENCES requests(id) ON DELETE CASCADE;
ALTER TABLE matches ADD CONSTRAINT fk_match_req_b
  FOREIGN KEY (request_b_id) REFERENCES requests(id) ON DELETE CASCADE;

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_requests_status   ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_user     ON requests(user_uuid);
CREATE INDEX IF NOT EXISTS idx_push_user         ON push_subscriptions(user_uuid);
CREATE INDEX IF NOT EXISTS idx_matches_status    ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_expires   ON matches(expires_at);
CREATE INDEX IF NOT EXISTS idx_matches_req_a     ON matches(request_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_req_b     ON matches(request_b_id);
