import puzzleBank from "./puzzles.json";
export type Difficulty = "easy" | "medium" | "hard";
export type Snapshot = {
  values: number[];
  notes: number[][];
  autoCandidates?: boolean;
};
export type Game = Snapshot & {
  version: 1;
  difficulty: Difficulty;
  givens: number[];
  history: Snapshot[];
  startedAt: number;
  playMs?: number;
  counted?: boolean;
  hints?: number;
};
// Seed puzzles are validated by the test suite; transformations preserve their logic and uniqueness.
export const seeds: Record<Difficulty, string> = {
  easy: "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
  medium:
    "000260701680070090190004500820100040004602900050003028009300074040050036703018000",
  hard: "000000010400000000020000000000050407008000300001090000300400200050100000000806000",
};
export function candidates(values: number[], index: number): number[] {
  if (values[index]) return [];
  const row = Math.floor(index / 9),
    col = index % 9;
  const used = new Set<number>();
  for (let k = 0; k < 9; k++) {
    used.add(values[row * 9 + k]);
    used.add(values[k * 9 + col]);
    used.add(
      values[
        (Math.floor(row / 3) * 3 + Math.floor(k / 3)) * 9 +
          Math.floor(col / 3) * 3 +
          (k % 3)
      ],
    );
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !used.has(n));
}
export function conflicts(values: number[], index: number): boolean {
  const n = values[index];
  if (!n) return false;
  const copy = values.slice();
  copy[index] = 0;
  return !candidates(copy, index).includes(n);
}
export function completed(values: number[]): boolean {
  return values.every((n, i) => n >= 1 && n <= 9 && !conflicts(values, i));
}
export function solutionCount(input: number[], limit = 2): number {
  const values = input.slice();
  if (values.some((n, i) => n && conflicts(values, i))) return 0;
  function search(): number {
    let index = -1,
      options: number[] = [];
    for (let i = 0; i < 81; i++)
      if (!values[i]) {
        const c = candidates(values, i);
        if (!c.length) return 0;
        if (index < 0 || c.length < options.length) {
          index = i;
          options = c;
        }
        if (c.length === 1) break;
      }
    if (index < 0) return 1;
    let count = 0;
    for (const n of options) {
      values[index] = n;
      count += search();
      if (count >= limit) break;
    }
    values[index] = 0;
    return count;
  }
  return search();
}
export function createGame(difficulty: Difficulty): Game {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 8; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  const bank = puzzleBank[difficulty];
  const puzzle = bank[Math.floor(Math.random() * bank.length)];
  let givens = Array.from(puzzle, (n) =>
    Number(n) ? digits[Number(n) - 1] : 0,
  );
  if (Math.random() < 0.5)
    givens = givens.map((_, i) => givens[(i % 9) * 9 + Math.floor(i / 9)]);
  return gameFromPuzzle(difficulty, givens.join(""));
}
export function gameFromPuzzle(difficulty: Difficulty, puzzle: string): Game {
  const givens = [...puzzle].map(Number);
  return {
    version: 1,
    difficulty,
    givens,
    values: givens.slice(),
    notes: Array.from({ length: 81 }, () => []),
    autoCandidates: false,
    history: [],
    startedAt: Date.now(),
  };
}
function remember(game: Game) {
  game.history.push({
    values: game.values.slice(),
    notes: game.notes.map((n) => n.slice()),
    autoCandidates: Boolean(game.autoCandidates),
  });
  if (game.history.length > 100) game.history.shift();
}
export function enter(
  game: Game,
  index: number,
  n: number,
  noteMode = false,
): boolean {
  if (game.givens[index] || completed(game.values)) return false;
  if (noteMode) {
    if (game.values[index] || !n) return false;
    remember(game);
    if (game.autoCandidates) {
      game.notes = game.values.map((_, i) => candidates(game.values, i));
      game.autoCandidates = false;
    }
    const notes = game.notes[index];
    game.notes[index] = notes.includes(n)
      ? notes.filter((v) => v !== n)
      : [...notes, n].sort();
  } else {
    if (game.values[index] === n && !game.notes[index].length) return false;
    remember(game);
    game.values[index] = n;
    game.notes[index] = [];
    if (n) {
      const row = Math.floor(index / 9);
      const col = index % 9;
      game.notes.forEach((notes, peer) => {
        const peerRow = Math.floor(peer / 9);
        const peerCol = peer % 9;
        if (
          peerRow === row ||
          peerCol === col ||
          (Math.floor(peerRow / 3) === Math.floor(row / 3) &&
            Math.floor(peerCol / 3) === Math.floor(col / 3))
        ) {
          game.notes[peer] = notes.filter((candidate) => candidate !== n);
        }
      });
    }
  }
  return true;
}
// Back to the starting numbers; Undo can bring everything back.
export function restartPuzzle(game: Game) {
  remember(game);
  game.values = game.givens.slice();
  game.notes = Array.from({ length: 81 }, () => []);
}
export function toggleAutoCandidates(game: Game): boolean {
  if (completed(game.values) && !game.autoCandidates) return false;
  remember(game);
  game.autoCandidates = !game.autoCandidates;
  return true;
}
export function visibleNotes(game: Game, index: number): number[] {
  return game.autoCandidates
    ? candidates(game.values, index)
    : game.notes[index];
}
export function undo(game: Game) {
  const previous = game.history.pop();
  if (previous) {
    game.values = previous.values;
    game.notes = previous.notes;
    game.autoCandidates = Boolean(previous.autoCandidates);
  }
}
export function validGame(
  value: unknown,
  difficulty: Difficulty,
): value is Game {
  if (!value || typeof value !== "object") return false;
  const g = value as Game;
  const board = (a: unknown): a is number[] =>
    Array.isArray(a) &&
    a.length === 81 &&
    a.every((n) => Number.isInteger(n) && n >= 0 && n <= 9);
  const notes = (a: unknown) =>
    Array.isArray(a) &&
    a.length === 81 &&
    a.every(
      (ns) =>
        Array.isArray(ns) &&
        ns.length <= 9 &&
        new Set(ns).size === ns.length &&
        ns.every((n) => Number.isInteger(n) && n >= 1 && n <= 9),
    );
  return (
    g.version === 1 &&
    g.difficulty === difficulty &&
    board(g.givens) &&
    board(g.values) &&
    g.givens.every((n, i) => !n || g.values[i] === n) &&
    notes(g.notes) &&
    (g.autoCandidates === undefined || typeof g.autoCandidates === "boolean") &&
    Number.isFinite(g.startedAt) &&
    (g.playMs === undefined || (Number.isFinite(g.playMs) && g.playMs >= 0)) &&
    (g.counted === undefined || typeof g.counted === "boolean") &&
    (g.hints === undefined || (Number.isInteger(g.hints) && g.hints >= 0)) &&
    Array.isArray(g.history) &&
    g.history.length <= 100 &&
    g.history.every(
      (s) =>
        board(s.values) &&
        notes(s.notes) &&
        (s.autoCandidates === undefined ||
          typeof s.autoCandidates === "boolean") &&
        g.givens.every((n, i) => !n || s.values[i] === n),
    )
  );
}

// The unique solution of a puzzle, or null if it has none or several.
export function solveUnique(givens: number[]): number[] | null {
  const values = givens.slice();
  if (values.some((n, i) => n && conflicts(values, i))) return null;
  let found: number[] | null = null;
  let count = 0;
  function search() {
    let index = -1,
      options: number[] = [];
    for (let i = 0; i < 81; i++)
      if (!values[i]) {
        const c = candidates(values, i);
        if (!c.length) return;
        if (index < 0 || c.length < options.length) {
          index = i;
          options = c;
        }
        if (c.length === 1) break;
      }
    if (index < 0) {
      count++;
      found = values.slice();
      return;
    }
    for (const n of options) {
      values[index] = n;
      search();
      if (count >= 2) break;
    }
    values[index] = 0;
  }
  search();
  return count === 1 ? found : null;
}
export type Hint = {
  index: number;
  digit: number;
  kind: "wrong" | "single" | "hidden" | "peek";
  unit?: "row" | "column" | "box";
};
function units(): { unit: "row" | "column" | "box"; cells: number[] }[] {
  const out: { unit: "row" | "column" | "box"; cells: number[] }[] = [];
  for (let k = 0; k < 9; k++) {
    out.push({ unit: "row", cells: Array.from({ length: 9 }, (_, c) => k * 9 + c) });
    out.push({ unit: "column", cells: Array.from({ length: 9 }, (_, r) => r * 9 + k) });
    const r0 = Math.floor(k / 3) * 3,
      c0 = (k % 3) * 3;
    out.push({
      unit: "box",
      cells: Array.from({ length: 9 }, (_, j) => (r0 + Math.floor(j / 3)) * 9 + c0 + (j % 3)),
    });
  }
  return out;
}
export function isWrong(game: Game, solution: number[] | null, i: number) {
  const n = game.values[i];
  return Boolean(
    n && !game.givens[i] && (conflicts(game.values, i) || (solution && solution[i] !== n)),
  );
}
// Suggest the gentlest next step: a mistake, a naked single, a hidden single,
// and finally (with a known solution) the emptiest-looking cell.
export function findHint(game: Game, solution: number[] | null): Hint | null {
  const v = game.values;
  if (completed(v)) return null;
  for (let i = 0; i < 81; i++)
    if (isWrong(game, solution, i))
      return { index: i, digit: solution ? solution[i] : 0, kind: "wrong" };
  for (let i = 0; i < 81; i++)
    if (!v[i]) {
      const c = candidates(v, i);
      if (c.length === 1) return { index: i, digit: c[0], kind: "single" };
    }
  for (const { unit, cells } of units())
    for (let d = 1; d <= 9; d++) {
      if (cells.some((i) => v[i] === d)) continue;
      const homes = cells.filter((i) => !v[i] && candidates(v, i).includes(d));
      if (homes.length === 1) return { index: homes[0], digit: d, kind: "hidden", unit };
    }
  if (solution) {
    let best = -1;
    for (let i = 0; i < 81; i++)
      if (!v[i] && (best < 0 || candidates(v, i).length < candidates(v, best).length))
        best = i;
    if (best >= 0) return { index: best, digit: solution[best], kind: "peek" };
  }
  return null;
}
