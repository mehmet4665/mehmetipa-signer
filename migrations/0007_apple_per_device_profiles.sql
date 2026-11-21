-- Store one Ad Hoc provisioning profile per member device.
-- Each profile contains only that device so disabling one tester does not invalidate
-- other members' provisioning profiles.
ALTER TABLE devices ADD COLUMN apple_profile_id TEXT;
ALTER TABLE devices ADD COLUMN profile_key TEXT;
ALTER TABLE devices ADD COLUMN profile_iv TEXT;
ALTER TABLE devices ADD COLUMN profile_name TEXT;
ALTER TABLE devices ADD COLUMN profile_expires_at TEXT;
ALTER TABLE devices ADD COLUMN profile_certificate_serial TEXT;
ALTER TABLE devices ADD COLUMN profile_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE devices ADD COLUMN profile_last_error TEXT;
ALTER TABLE devices ADD COLUMN profile_last_attempt_at TEXT;
ALTER TABLE devices ADD COLUMN profile_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_devices_apple_profile_id ON devices(apple_profile_id);
CREATE INDEX IF NOT EXISTS idx_devices_profile_status ON devices(profile_status);
