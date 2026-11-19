-- VIP membership foundation. Payment provider integration is added separately.
ALTER TABLE users ADD COLUMN vip_plan TEXT;
ALTER TABLE users ADD COLUMN vip_expires_at TEXT;
ALTER TABLE users ADD COLUMN vip_updated_at TEXT;

CREATE TABLE IF NOT EXISTS vip_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  amount_try INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  provider_reference TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  activated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_vip_orders_user ON vip_orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vip_orders_status ON vip_orders(status, created_at);
