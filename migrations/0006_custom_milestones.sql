CREATE TABLE IF NOT EXISTS custom_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  difficulty TEXT,
  value INTEGER NOT NULL,
  on_date TEXT,
  text TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
