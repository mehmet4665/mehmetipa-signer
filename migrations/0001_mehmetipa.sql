-- Mehmet IPA account database. Safe to run on a fresh D1 database.
-- The existing database may already contain these tables; in that case do not rerun this file.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  group_name TEXT NOT NULL DEFAULT 'Standart',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  udid TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_user_udid ON devices(user_id, udid);
