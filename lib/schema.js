// Additive setup only. Tests verify this list matches schema.sql exactly.
// Keep schema.sql and this list together when updating the schema.
export const SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS public.event_days (\n  day smallint PRIMARY KEY CHECK (day BETWEEN 1 AND 3),\n  title text NOT NULL DEFAULT '',\n  updated_at timestamptz NOT NULL DEFAULT now()\n)",
  "CREATE TABLE IF NOT EXISTS public.booth_assignments (\n  day smallint NOT NULL CHECK (day BETWEEN 1 AND 3),\n  booth_id text NOT NULL,                 \n  org text NOT NULL DEFAULT '',\n  rep text NOT NULL DEFAULT '',\n  description text NOT NULL DEFAULT '',\n  notes text NOT NULL DEFAULT '',\n  color text NOT NULL DEFAULT '#F8FAFC',\n  status text NOT NULL DEFAULT 'available', \n  updated_at timestamptz NOT NULL DEFAULT now(),\n  PRIMARY KEY (day, booth_id)\n)",
  "CREATE TABLE IF NOT EXISTS public.room_reservations (\n  day smallint NOT NULL CHECK (day BETWEEN 1 AND 3),\n  room_id text NOT NULL,                  \n  reserved_for text NOT NULL,\n  note text NOT NULL DEFAULT '',\n  paper text NOT NULL DEFAULT '#FFE680',\n  updated_at timestamptz NOT NULL DEFAULT now(),\n  PRIMARY KEY (day, room_id)\n)",
  "CREATE TABLE IF NOT EXISTS public.login_attempts (\n  ip text PRIMARY KEY,\n  fails integer NOT NULL DEFAULT 0,\n  first_fail timestamptz NOT NULL DEFAULT now()\n)",
  "CREATE TABLE IF NOT EXISTS public.event_meta (\n  id boolean PRIMARY KEY DEFAULT true CHECK (id),\n  revision integer NOT NULL DEFAULT 0,\n  updated_at timestamptz NOT NULL DEFAULT now()\n)",
  "INSERT INTO public.event_meta (id) VALUES (true) ON CONFLICT DO NOTHING",
  "CREATE TABLE IF NOT EXISTS public.organizer_sessions (\n  token_hash text PRIMARY KEY,\n  expires_at timestamptz NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS organizer_sessions_expiry ON public.organizer_sessions (expires_at)"
];
