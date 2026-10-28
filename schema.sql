-- Run this once in Cloudflare: Storage & Databases > D1 > your database > Console.
CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY CHECK (id = 1), next INTEGER NOT NULL);
INSERT OR IGNORE INTO counter (id, next) VALUES (1, 8);   -- first receipt is 1503-008

CREATE TABLE IF NOT EXISTS orders (
  receipt TEXT PRIMARY KEY, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending',
  name TEXT, company TEXT, reg TEXT, email TEXT, phone TEXT, biz TEXT, method TEXT, plan TEXT, months INTEGER,
  packages TEXT, discounts TEXT, due REAL, recurring REAL, fees TEXT, notes TEXT,
  paid_at TEXT, next_due_at TEXT, sheet_synced INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orders_next_due ON orders (next_due_at);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, receipt TEXT, paid_at TEXT, amount REAL, period_months INTEGER, next_due_at TEXT
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, type TEXT, name TEXT, email TEXT, phone TEXT, message TEXT, extra TEXT, sheet_synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rate_limit (ip TEXT, ts INTEGER);
