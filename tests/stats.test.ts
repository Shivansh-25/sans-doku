import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarize,
  isNewBest,
  bestMs,
  mergeRemote,
  addFinish,
  scope,
  formatTime,
  formatDuration,
  type Finish,
} from "../src/stats";

const day = (d: number, h = 12) => new Date(2026, 10, d, h);
let n = 0;
const fin = (d: number, difficulty: Finish["difficulty"], ms: number, hints = 0, extra = {}): Finish => ({
  id: `game-${++n}-test`,
  difficulty,
  at: day(d).getTime(),
  ms,
  hints,
  ...extra,
});

test("streaks count consecutive days and drop once a day is missed", () => {
  const list = [fin(1, "easy", 90_000), fin(2, "easy", 80_000), fin(2, "hard", 80_000), fin(4, "easy", 1_000)];
  const s = summarize(list, day(4));
  assert.equal(s.total, 4);
  assert.equal(s.longestStreak, 2);
  assert.equal(s.currentStreak, 1);
  assert.equal(summarize(list, day(5)).currentStreak, 1);
  assert.equal(summarize(list, day(7)).currentStreak, 0);
  assert.equal(summarize([], day(7)).longestStreak, 0);
});

test("best times ignore hinted and untimed games and only improve", () => {
  const history = [fin(1, "easy", 90_000), fin(1, "easy", 30_000, 1), fin(1, "easy", 0)];
  assert.equal(bestMs(history, "easy"), 90_000);
  assert.equal(isNewBest(history, fin(2, "easy", 95_000)), false);
  assert.equal(isNewBest(history, fin(2, "easy", 80_000)), true);
  assert.equal(isNewBest(history, fin(2, "easy", 10_000, 2)), false);
  assert.equal(isNewBest(history, fin(2, "hard", 200_000)), true);
});

test("growth compares the first three and latest three timed games", () => {
  const times = [600, 580, 590, 500, 450, 400, 300, 300, 300].map((s) => s * 1000);
  const list = times.map((ms, i) => fin(1 + i, "medium", ms));
  const s = summarize(list, day(10));
  assert.ok(Math.abs(s.byDifficulty.medium.improvement! - (590 - 300) / 590) < 1e-9);
  assert.equal(s.byDifficulty.easy.improvement, undefined);
  assert.equal(s.byDifficulty.medium.bestMs, 300_000);
  assert.equal(summarize(list.slice(0, 5), day(10)).byDifficulty.medium.improvement, undefined);
});

test("weekly counts cover eight Monday-based weeks ending this week", () => {
  const s = summarize([fin(2, "easy", 1000), fin(3, "easy", 1000), fin(9, "easy", 1000)], day(10));
  assert.equal(s.weeks.length, 8);
  assert.equal(s.weeks[7].count, 1); // Mon 9 Nov
  assert.equal(s.weeks[6].count, 2); // Mon 2 Nov
  assert.equal(s.weeks[0].count, 0);
  assert.equal(s.weeks[7].start.getDay(), 1);
});

test("account history merges server rows and stays separate from guest history", () => {
  const guest = fin(1, "easy", 60_000);
  const mine = fin(2, "easy", 70_000, 0, { acct: true });
  let history = addFinish(addFinish([], guest), mine);
  const merged = mergeRemote(history, [
    { id: mine.id, difficulty: "easy", at: mine.at, ms: mine.ms, hints: 0 },
    { id: "from-other-phone", difficulty: "hard", at: day(3).getTime(), ms: 400_000, hints: 0 },
  ]);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((f) => f.id === mine.id)!.synced, true);
  assert.equal(scope(merged, true).length, 2);
  assert.equal(scope(merged, false).length, 1);
  assert.equal(addFinish(merged, guest).length, 3);
  assert.equal(formatTime(65_000), "1:05");
  assert.equal(formatTime(3_725_000), "1:02:05");
  assert.equal(formatDuration(45 * 60000), "45m");
  assert.equal(formatDuration(200 * 60000), "3h 20m");
});
