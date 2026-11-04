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

import { unlockedKeys, MILESTONES } from "../src/milestones";
import { greeting, daysTogether, togetherLine } from "../src/greeting";
import { inbox, unseenItems, nextLocked } from "../src/notes";
import { restartPuzzle, gameFromPuzzle, enter, undo, seeds } from "../src/game";

test("milestones unlock from her record", () => {
  assert.deepEqual(unlockedKeys([]), []);
  const one = [fin(1, "easy", 60_000)];
  assert.deepEqual(unlockedKeys(one), ["first"]);
  const many = Array.from({ length: 10 }, (_, i) => fin(1 + i, i === 9 ? "hard" : "easy", 60_000));
  assert.deepEqual(unlockedKeys(many), ["first", "ten", "streak7", "hard"]);
  assert.equal(MILESTONES.length, 6);
});

test("inbox shows messages and unlocked notes, with custom text winning", () => {
  const notes = { messages: [{ id: 2, text: "Hi ♡", at: 5 }], milestones: { first: "Mine" } };
  const items = inbox(notes, [fin(1, "easy", 60_000)]);
  assert.deepEqual(items.map((i) => [i.id, i.text]), [["m:2", "Hi ♡"], ["k:first", "Mine"]]);
  assert.deepEqual(unseenItems(items, ["m:2"]).map((i) => i.id), ["k:first"]);
  assert.deepEqual(nextLocked([fin(1, "easy", 60_000)], 2), ["Finish 10 puzzles", "Play 7 days in a row"]);
});

test("greeting follows the hour and days together count from 22 Nov 2025", () => {
  assert.match(greeting(8), /^Good morning/);
  assert.match(greeting(14), /^Good afternoon/);
  assert.match(greeting(20), /^Good evening/);
  assert.match(greeting(2), /^Still up/);
  assert.equal(daysTogether(new Date(2025, 10, 22)), 0);
  assert.equal(daysTogether(new Date(2026, 10, 4)), 347);
  assert.equal(togetherLine(new Date(2025, 10, 22)), "Today is where it all began ♡");
  assert.equal(togetherLine(new Date(2025, 10, 23)), "1 day together ♡");
  assert.equal(togetherLine(new Date(2026, 0, 22)), "Happy 2-month anniversary ♡");
  assert.equal(togetherLine(new Date(2026, 10, 22)), "Happy 1 year together ♡");
  assert.equal(togetherLine(new Date(2026, 10, 4)), "347 days together ♡");
});

test("restarting keeps the puzzle, clears progress, and can be undone", () => {
  const g = gameFromPuzzle("easy", seeds.easy);
  const empty = g.values.findIndex((n) => !n);
  enter(g, empty, 9);
  restartPuzzle(g);
  assert.deepEqual(g.values, g.givens);
  undo(g);
  assert.equal(g.values[empty], 9);
});

import { renderStats } from "../src/stats-view";
test("the garden grows one flower per puzzle, in each difficulty's own shape", () => {
  const list = [fin(1, "easy", 60_000), fin(2, "easy", 60_000), fin(3, "medium", 60_000), fin(4, "hard", 60_000)];
  const html = renderStats(list, "all", false);
  assert.equal((html.match(/class="flower"/g) || []).length, 4);
  assert.equal((html.match(/daisy-petal/g) || []).length, 16);
  assert.equal((html.match(/class="tulip"/g) || []).length, 1);
  assert.equal((html.match(/class="rose-outer"/g) || []).length, 1);
  assert.match(html, /2 daisies · 1 tulip · 1 rose/);
  const many = Array.from({ length: 100 }, (_, i) => fin(1, "easy", 60_000 + i));
  const capped = renderStats(many, "all", false);
  assert.equal((capped.match(/class="flower"/g) || []).length, 96);
  assert.match(capped, /4 more bloomed earlier/);
});

test("the filter narrows tiles, garden, tables and charts, but 'all' shows everything", () => {
  const list = [
    ...Array.from({ length: 3 }, (_, i) => fin(1 + i, "easy", 60_000 - i * 1000)),
    ...Array.from({ length: 2 }, (_, i) => fin(5 + i, "medium", 120_000 - i * 1000)),
    fin(8, "hard", 300_000),
  ];
  const flowers = (h: string) => (h.match(/class="flower"/g) || []).length;
  const tileTotal = (h: string) => h.match(/<div class="stat"><strong>(\d+)<\/strong>/)![1];
  assert.equal(flowers(renderStats(list, "all", false)), 6);
  assert.equal(tileTotal(renderStats(list, "all", false)), "6");
  const medium = renderStats(list, "medium", false);
  assert.equal(flowers(medium), 2);
  assert.equal(tileTotal(medium), "2");
  assert.ok(!/class="daisy-petal"/.test(medium) && !/class="rose-outer"/.test(medium));
  assert.equal((medium.match(/<th scope="row">(Easy|Medium|Hard)<\/th>/g) || []).length, 1);
  assert.match(medium, /aria-pressed="true">Medium/);
  assert.match(renderStats(list, "all", false), /aria-pressed="true">All/);
  // a level she has not played shows a friendly empty state with the filter still visible
  const none = renderStats(list.filter((f) => f.difficulty !== "hard"), "hard", false);
  assert.match(none, /No hard puzzles yet/);
  assert.match(none, /data-stats-filter="all"/);
});
