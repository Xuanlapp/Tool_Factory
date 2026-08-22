CREATE TABLE IF NOT EXISTS platform_events (
  event_id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  run_id TEXT,
  sheet_id TEXT,
  item_id TEXT,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_platform_events_time ON platform_events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_platform_events_run ON platform_events (run_id);
CREATE TABLE IF NOT EXISTS agent_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  snapshot_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_outbox (
  event_id TEXT PRIMARY KEY,
  destination TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
