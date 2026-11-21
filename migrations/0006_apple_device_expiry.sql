-- Link each locally approved UDID to its App Store Connect device resource.
ALTER TABLE devices ADD COLUMN apple_device_id TEXT;
ALTER TABLE devices ADD COLUMN apple_status TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE devices ADD COLUMN apple_last_error TEXT;
ALTER TABLE devices ADD COLUMN apple_status_updated_at TEXT;
ALTER TABLE devices ADD COLUMN apple_last_attempt_at TEXT;

CREATE INDEX IF NOT EXISTS idx_devices_apple_device_id ON devices(apple_device_id);
CREATE INDEX IF NOT EXISTS idx_trial_access_expires_at ON trial_access(expires_at);
CREATE INDEX IF NOT EXISTS idx_users_vip_expires_at ON users(vip_expires_at);

-- Internal authentication material for the scheduled expiry Worker.
-- Values are managed in D1 and are never returned by the public API.
CREATE TABLE IF NOT EXISTS system_secrets (
  secret_key TEXT PRIMARY KEY,
  secret_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS apple_device_events (
  id TEXT PRIMARY KEY,
  device_id TEXT,
  user_id TEXT,
  apple_device_id TEXT,
  udid TEXT,
  requested_status TEXT NOT NULL,
  applied_status TEXT,
  reason TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apple_device_events_created_at ON apple_device_events(created_at);
CREATE INDEX IF NOT EXISTS idx_apple_device_events_user_id ON apple_device_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS expiry_sweep_runs (
  id TEXT PRIMARY KEY,
  run_at TEXT NOT NULL,
  inspected INTEGER NOT NULL DEFAULT 0,
  changed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_expiry_sweep_runs_run_at ON expiry_sweep_runs(run_at);
