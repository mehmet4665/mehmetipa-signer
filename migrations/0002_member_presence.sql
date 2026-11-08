-- Member presence metadata for the admin dashboard.
-- Already applied to the production D1 database.
ALTER TABLE users ADD COLUMN last_seen_at TEXT;
ALTER TABLE users ADD COLUMN device_label TEXT;
ALTER TABLE users ADD COLUMN browser_label TEXT;
