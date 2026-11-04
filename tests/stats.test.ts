import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyStats, recordFinish, currentStreak, formatTime, total } from "../src/stats";

const day = (d: number) => new Date(2026, 10, d, 12);
test("finishing puzzles builds a streak that resets after a missed day", () => {
  let s = recordFinish(emptyStats(), "easy", 90_000, false, day(1)).stats;
  s = recordFinish(s, "easy", 80_000, false, day(2)).stats;
  s = recordFinish(s, "hard", 80_000, false, day(2)).stats;
  assert.equal(s.streak, 2);
  assert.equal(total(s), 3);
  assert.equal(currentStreak(s, day(3)), 2);
  assert.equal(currentStreak(s, day(5)), 0);
  s = recordFinish(s, "easy", 70_000, false, day(5)).stats;
  assert.equal(s.streak, 1);
});

test("best times ignore hinted games and only improve", () => {
  let r = recordFinish(emptyStats(), "easy", 90_000, false, day(1));
  assert.equal(r.newBest, true);
  r = recordFinish(r.stats, "easy", 95_000, false, day(1));
  assert.equal(r.newBest, false);
  r = recordFinish(r.stats, "easy", 30_000, true, day(1));
  assert.equal(r.newBest, false);
  assert.equal(r.stats.best.easy, 90_000);
  assert.equal(formatTime(65_000), "1:05");
  assert.equal(formatTime(3_725_000), "1:02:05");
});
