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

import { milestoneList, unlockedIds, ruleProgress, ruleText, BUILTIN_KEYS } from "../src/milestones";
import { greeting, daysTogether, togetherLine } from "../src/greeting";
import { inbox, unseenItems, nextLocked, type Notes } from "../src/notes";
import { restartPuzzle, gameFromPuzzle, enter, undo, seeds } from "../src/game";

const noNotes: Notes = { messages: [], milestones: {}, custom: [] };
const custom = (over: object) => ({ id: 1, title: "T", kind: "total", difficulty: null, value: 1, on_date: null, text: "msg", enabled: 1, ...over }) as Notes["custom"][number];

test("built-in milestones unlock from her record", () => {
  const list = milestoneList({}, []);
  assert.equal(list.length, BUILTIN_KEYS.length);
  assert.deepEqual(unlockedIds(list, []), []);
  assert.deepEqual(unlockedIds(list, [fin(1, "easy", 60_000)]), ["k:first"]);
  const many = Array.from({ length: 10 }, (_, i) => fin(1 + i, i === 9 ? "hard" : "easy", 60_000));
  assert.deepEqual(unlockedIds(list, many), ["k:first", "k:ten", "k:streak7", "k:hard"]);
});

test("every rule kind unlocks at the right moment", () => {
  const now = day(20);
  const f = [
    fin(10, "easy", 600_000),
    fin(11, "easy", 300_000, 1),
    fin(12, "hard", 900_000),
    fin(12, "medium", 1_200_000),
  ];
  const p = (rule: Parameters<typeof ruleProgress>[0]) => ruleProgress(rule, f, now);
  assert.deepEqual(p({ kind: "total", value: 4 }), { done: true, current: 4, target: 4 });
  assert.equal(p({ kind: "total", value: 5 }).done, false);
  assert.equal(p({ kind: "difficulty", value: 2, difficulty: "easy" }).done, true);
  assert.equal(p({ kind: "difficulty", value: 2, difficulty: "hard" }).done, false);
  assert.equal(p({ kind: "streak", value: 3 }).done, true); // 10, 11, 12
  assert.equal(p({ kind: "streak", value: 4 }).done, false);
  assert.equal(p({ kind: "days", value: 3 }).done, true);
  assert.equal(p({ kind: "days", value: 4 }).done, false);
  assert.deepEqual(p({ kind: "nohint", value: 3 }), { done: true, current: 3, target: 3 });
  assert.equal(p({ kind: "nohint", value: 4 }).done, false);
  assert.equal(p({ kind: "fast", value: 11 }).done, true); // 600s easy, hint-free
  assert.equal(p({ kind: "fast", value: 6 }).done, false); // the 5-minute game used a hint
  assert.equal(p({ kind: "fast", value: 16, difficulty: "hard" }).done, true);
  assert.equal(p({ kind: "fast", value: 11, difficulty: "hard" }).done, false);
  assert.equal(ruleProgress({ kind: "date", value: 0, date: "2026-11-20" }, [], day(19)).done, false);
  assert.equal(ruleProgress({ kind: "date", value: 0, date: "2026-11-20" }, [], day(20)).done, true);
  assert.equal(ruleProgress({ kind: "date", value: 0, date: "2026-11-20" }, [], day(25)).done, true);
});

test("rules read as plain sentences", () => {
  assert.equal(ruleText({ kind: "total", value: 1 }), "Finish a puzzle");
  assert.equal(ruleText({ kind: "total", value: 25 }), "Finish 25 puzzles");
  assert.equal(ruleText({ kind: "difficulty", value: 5, difficulty: "hard" }), "Finish 5 hard puzzles");
  assert.equal(ruleText({ kind: "difficulty", value: 1, difficulty: "medium" }), "Finish a medium puzzle");
  assert.equal(ruleText({ kind: "streak", value: 1 }), "Play 1 day in a row");
  assert.equal(ruleText({ kind: "days", value: 20 }), "Play on 20 different days");
  assert.equal(ruleText({ kind: "nohint", value: 10 }), "Finish 10 puzzles without a hint");
  assert.equal(ruleText({ kind: "fast", value: 15 }), "Finish any puzzle in under 15 minutes");
  assert.equal(ruleText({ kind: "fast", value: 1, difficulty: "hard" }), "Finish a hard puzzle in under 1 minute");
  assert.equal(ruleText({ kind: "date", value: 0, date: "2026-12-25" }), "On 2026-12-25");
});

test("custom milestones join the inbox and the teasers, disabled ones never appear", () => {
  const notes: Notes = {
    messages: [{ id: 2, text: "Hi ♡", at: 5 }],
    milestones: { first: "Mine" },
    custom: [
      custom({ id: 7, title: "Twenty-five", value: 25, text: "25!" }),
      custom({ id: 8, title: "Off", value: 1, enabled: 0 }),
      custom({ id: 9, title: "Surprise", kind: "date", value: 0, on_date: "2099-01-01", text: "secret" }),
    ],
  };
  const one = [fin(1, "easy", 60_000)];
  const items = inbox(notes, one, day(2));
  assert.deepEqual(items.map((i) => [i.id, i.text]), [["m:2", "Hi ♡"], ["k:first", "Mine"]]);
  assert.deepEqual(unseenItems(items, ["m:2"]).map((i) => i.id), ["k:first"]);
  const twentyFive = Array.from({ length: 25 }, (_, i) => fin(1 + (i % 20), "easy", 60_000));
  assert.ok(inbox(notes, twentyFive, day(30)).some((i) => i.id === "c:7"));
  assert.ok(!inbox(notes, twentyFive, day(30)).some((i) => i.id === "c:8"));
  // teasers: closest first, with progress, and the date surprise stays hidden
  assert.deepEqual(nextLocked(notes, one, 2, day(2)), ["Play 7 days in a row · 1/7", "Finish 10 puzzles · 1/10"]);
  assert.ok(!nextLocked(notes, one, 10, day(2)).some((t) => t.includes("2099")));
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
