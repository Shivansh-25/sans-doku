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
  fillCandidates,
  gameFromPuzzle,
  toggleAutoCandidates,
  visibleNotes,
  completed,
  validGame,
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
test("notes, fill and undo preserve previous state", () => {
  const g = createGame("easy");
  const i = g.values.findIndex((n) => !n);
  enter(g, i, 1, true);
  assert.deepEqual(g.notes[i], [1]);
  const before = JSON.stringify({ values: g.values, notes: g.notes });
  fillCandidates(g);
  assert.deepEqual(g.notes[i], candidates(g.values, i));
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

test("manual note entry exits automatic mode and undo restores it", () => {
  const g = gameFromPuzzle("easy", seeds.easy);
  toggleAutoCandidates(g);
  enter(g, 2, 4, true);
  assert.equal(g.autoCandidates, false);
  assert.deepEqual(visibleNotes(g, 2), [4]);
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
