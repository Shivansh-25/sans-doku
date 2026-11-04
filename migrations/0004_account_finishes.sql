CREATE TABLE IF NOT EXISTS account_finishes (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL DEFAULT 'sans',
  difficulty TEXT NOT NULL,
  finished_at INTEGER NOT NULL,
  play_ms INTEGER NOT NULL,
  hints INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_finishes_time ON account_finishes(account, finished_at);
