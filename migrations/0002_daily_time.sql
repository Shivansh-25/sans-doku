CREATE TABLE IF NOT EXISTS play_days (
  play_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  day TEXT NOT NULL,
  active_ms INTEGER NOT NULL,
  PRIMARY KEY(play_id, day)
);
CREATE INDEX IF NOT EXISTS play_days_player ON play_days(player_id, day);
CREATE INDEX IF NOT EXISTS play_days_date ON play_days(day);
