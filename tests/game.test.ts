import puzzleBank from "../src/puzzles.json";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seeds,
  solutionCount,
  createGame,
  candidates,
  enter,
  undo,
  gameFromPuzzle,
  toggleAutoCandidates,
  visibleNotes,
  completed,
  validGame,
  solveUnique,
  findHint,
  isWrong,
  type Difficulty,
} from "../src/game";
for (const d of Object.keys(seeds) as Difficulty[])
  test(`${d}: unique puzzle and valid transformations`, () => {
    assert.equal(seeds[d].length, 81);
    for (const puzzle of puzzleBank[d]) {
      assert.equal(puzzle.length, 81);
      assert.equal(solutionCount([...puzzle].map(Number)), 1);
    }
    for (let i = 0; i < 3; i++) {
      const g = createGame(d);
      assert.equal(solutionCount(g.givens), 1);
      assert.ok(validGame(g, d));
    }
  });
test("candidates obey rows, columns and boxes; givens cannot change", () => {
  const values = [...seeds.easy].map(Number);
  assert.deepEqual(candidates(values, 2), [1, 2, 4]);
  assert.deepEqual(candidates(values, 4), []);
  const g = createGame("easy");
  const given = g.givens.findIndex(Boolean);
  assert.equal(enter(g, given, 0), false);
});
test("notes and undo preserve previous state", () => {
  const g = createGame("easy");
  const i = g.values.findIndex((n) => !n);
  enter(g, i, 1, true);
  assert.deepEqual(g.notes[i], [1]);
  const before = JSON.stringify({ values: g.values, notes: g.notes });
  enter(g, i, 2, true);
  assert.deepEqual(g.notes[i], [1, 2]);
  undo(g);
  assert.equal(JSON.stringify({ values: g.values, notes: g.notes }), before);
  enter(g, i, 2);
  assert.equal(g.values[i], 2);
  assert.deepEqual(g.notes[i], []);
  undo(g);
  assert.equal(JSON.stringify({ values: g.values, notes: g.notes }), before);
});
test("completion rejects a full invalid board", () => {
  assert.equal(completed(Array(81).fill(1)), false);
  assert.equal(
    completed(
      Array.from(
        { length: 81 },
        (_, i) =>
          ((Math.floor(i / 9) * 3 +
            Math.floor(Math.floor(i / 9) / 3) +
            (i % 9)) %
            9) +
          1,
      ),
    ),
    true,
  );
});
test("saved game round trip and malformed records", () => {
  const g = createGame("hard");
  assert.ok(validGame(JSON.parse(JSON.stringify(g)), "hard"));
  assert.equal(validGame({ ...g, values: [1] }, "hard"), false);
  assert.equal(validGame(g, "easy"), false);
  assert.equal(validGame({ ...g, history: [{}] }, "hard"), false);
});

test("automatic candidates toggle, follow entries, and preserve manual notes", () => {
  const g = gameFromPuzzle("easy", seeds.easy);
  enter(g, 2, 9, true);
  assert.deepEqual(g.notes[2], [9]);
  toggleAutoCandidates(g);
  assert.deepEqual(visibleNotes(g, 2), [1, 2, 4]);
  enter(g, 3, 1);
  assert.deepEqual(visibleNotes(g, 2), [2, 4]);
  toggleAutoCandidates(g);
  assert.deepEqual(visibleNotes(g, 2), [9]);
  undo(g);
  assert.equal(g.autoCandidates, true);
  assert.deepEqual(visibleNotes(g, 2), [2, 4]);
  const saved = JSON.parse(JSON.stringify(g));
  assert.ok(validGame(saved, "easy"));
  assert.equal(saved.autoCandidates, true);
});

test("manual note entry keeps auto-filled candidates, exits automatic mode, and undo restores it", () => {
  const g = gameFromPuzzle("easy", seeds.easy);
  toggleAutoCandidates(g);
  const auto = visibleNotes(g, 2).slice();
  assert.ok(auto.includes(4) && auto.length > 1);
  enter(g, 2, 4, true);
  assert.equal(g.autoCandidates, false);
  assert.deepEqual(visibleNotes(g, 2), auto.filter((n) => n !== 4));
  assert.deepEqual(visibleNotes(g, 3), g.notes[3]);
  assert.ok(g.notes[3].length > 0);
  undo(g);
  assert.equal(g.autoCandidates, true);
  assert.deepEqual(g.notes[2], []);
});

test("old saved games remain valid and invalid automatic modes are rejected", () => {
  const g = gameFromPuzzle("easy", seeds.easy);
  delete g.autoCandidates;
  assert.ok(validGame(g, "easy"));
  assert.equal(validGame({ ...g, autoCandidates: "yes" }, "easy"), false);
});

test("number entry prunes only matching manual notes in peers and undo restores all notes", () => {
  const g = gameFromPuzzle("easy", "0".repeat(81));
  for (const i of [10, 16, 64, 20, 80]) {
    for (const n of [1, 4, 9]) enter(g, i, n, true);
  }
  const before = JSON.stringify({ values: g.values, notes: g.notes });
  enter(g, 10, 4);
  assert.deepEqual(g.notes[10], []);
  for (const peer of [16, 64, 20]) assert.deepEqual(g.notes[peer], [1, 9]);
  assert.deepEqual(g.notes[80], [1, 4, 9]);
  assert.equal(g.autoCandidates, false);
  undo(g);
  assert.equal(JSON.stringify({ values: g.values, notes: g.notes }), before);
});

test("replacement prunes the new number and erasing does not recreate manual notes", () => {
  const g = gameFromPuzzle("easy", "0".repeat(81));
  for (const n of [1, 4, 9]) enter(g, 16, n, true);
  enter(g, 10, 4);
  enter(g, 10, 9);
  assert.deepEqual(g.notes[16], [1]);
  enter(g, 10, 0);
  assert.deepEqual(g.notes[16], [1]);
  undo(g);
  assert.equal(g.values[10], 9);
  assert.deepEqual(g.notes[16], [1]);
  undo(g);
  assert.equal(g.values[10], 4);
  assert.deepEqual(g.notes[16], [1, 9]);
});

test("writing a pencil note does not remove notes elsewhere", () => {
  const g = gameFromPuzzle("easy", "0".repeat(81));
  enter(g, 16, 4, true);
  enter(g, 10, 4, true);
  assert.deepEqual(g.notes[16], [4]);
  assert.deepEqual(g.notes[10], [4]);
});

test("manual notes stay cleaned up when switching back from automatic candidates", () => {
  const g = gameFromPuzzle("easy", "0".repeat(81));
  enter(g, 16, 4, true);
  enter(g, 16, 9, true);
  toggleAutoCandidates(g);
  enter(g, 10, 4);
  assert.equal(g.autoCandidates, true);
  toggleAutoCandidates(g);
  assert.deepEqual(visibleNotes(g, 16), [9]);
});

test("solveUnique finds the single solution and rejects ambiguous puzzles", () => {
  const sol = solveUnique([...seeds.easy].map(Number));
  assert.ok(sol && completed(sol));
  assert.equal(solveUnique(Array(81).fill(0)), null);
});

test("hints flag mistakes first, then singles, then reveal a correct digit", () => {
  const g = gameFromPuzzle("easy", seeds.easy);
  const sol = solveUnique(g.givens)!;
  const h = findHint(g, sol)!;
  assert.ok(h && !g.values[h.index] && sol[h.index] === h.digit);
  const empty = g.values.findIndex((n) => !n);
  const bad = sol[empty] === 1 ? 2 : 1;
  enter(g, empty, bad);
  if (isWrong(g, sol, empty)) {
    const wrong = findHint(g, sol)!;
    assert.equal(wrong.kind, "wrong");
    assert.equal(wrong.index, empty);
    assert.equal(wrong.digit, sol[empty]);
  }
  const done = gameFromPuzzle("easy", sol.join(""));
  assert.equal(findHint(done, sol), null);
});

test("saved games accept optional play time, hints and counted flag", () => {
  const g = gameFromPuzzle("easy", seeds.easy);
  assert.ok(validGame({ ...g, playMs: 5000, hints: 2, counted: true }, "easy"));
  assert.equal(validGame({ ...g, playMs: -1 }, "easy"), false);
  assert.equal(validGame({ ...g, hints: 1.5 }, "easy"), false);
});
