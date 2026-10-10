CREATE TABLE IF NOT EXISTS plays (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  player_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  active_ms INTEGER NOT NULL DEFAULT 0,
  auto_used INTEGER NOT NULL DEFAULT 0,
  moves INTEGER NOT NULL DEFAULT 0,
  filled INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL,
  playing INTEGER NOT NULL DEFAULT 0,
  presence_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plays_player ON plays(player_id, started_at DESC);
CREATE INDEX IF NOT EXISTS plays_presence ON plays(playing, presence_at);
CREATE INDEX IF NOT EXISTS plays_started ON plays(started_at DESC);
