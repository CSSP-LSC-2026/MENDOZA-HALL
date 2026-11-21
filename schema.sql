-- Required: run this entire idempotent migration in the Neon SQL Editor before deployment.
-- The application deliberately does not run DDL during requests.
CREATE TABLE IF NOT EXISTS event_days (
  day smallint PRIMARY KEY CHECK (day BETWEEN 1 AND 3),
  title text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS booth_assignments (
  day smallint NOT NULL CHECK (day BETWEEN 1 AND 3),
  booth_id text NOT NULL,                 -- e.g. 102-R1, DEAN-G1, 214–215-R1
  org text NOT NULL DEFAULT '',
  rep text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#F8FAFC',
  status text NOT NULL DEFAULT 'available', -- available | assigned | reserved | maintenance
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, booth_id)
);
CREATE TABLE IF NOT EXISTS room_reservations (
  day smallint NOT NULL CHECK (day BETWEEN 1 AND 3),
  room_id text NOT NULL,                  -- e.g. 105, dean, 214–215
  reserved_for text NOT NULL,
  note text NOT NULL DEFAULT '',
  paper text NOT NULL DEFAULT '#FFE680',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, room_id)
);
CREATE TABLE IF NOT EXISTS login_attempts (
  ip text PRIMARY KEY,
  fails integer NOT NULL DEFAULT 0,
  first_fail timestamptz NOT NULL DEFAULT now()
);

-- Handy views for checking assignments in the Neon console:
-- SELECT day, booth_id, org, rep, status FROM booth_assignments ORDER BY day, booth_id;
-- SELECT day, room_id, reserved_for, note FROM room_reservations ORDER BY day, room_id;

-- Shared revision serializes writes and prevents lost updates from stale editors.
CREATE TABLE IF NOT EXISTS event_meta (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO event_meta (id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS organizer_sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS organizer_sessions_expiry ON organizer_sessions (expires_at);
