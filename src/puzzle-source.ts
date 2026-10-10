import bank from "./puzzles.json";
import { createGame, gameFromPuzzle, type Game, type Difficulty } from "./game";
const reserveKey = (d: Difficulty) => `sansdoku:reserve:v1:${d}`;
const valid = (p: unknown): p is string =>
  typeof p === "string" && /^[0-9]{81}$/.test(p);
function readReserve(d: Difficulty): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(reserveKey(d)) || "null");
    return Array.isArray(saved) ? saved.filter(valid).slice(0, 3) : [];
  } catch {
    return [];
  }
}
function writeReserve(d: Difficulty, puzzles: string[]) {
  try {
    localStorage.setItem(reserveKey(d), JSON.stringify(puzzles));
  } catch {
    /* Bundled puzzles remain available if storage is full. */
  }
}
export async function fetchPuzzle(d: Difficulty): Promise<string> {
  const r = await fetch(`/api/puzzle?difficulty=${d}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8500),
  });
  if (!r.ok) throw new Error("Puzzle service unavailable");
  const data = await r.json();
  if (data.difficulty !== d || !valid(data.puzzle))
    throw new Error("Unexpected puzzle response");
  return data.puzzle;
}
const replenishing = new Set<Difficulty>();
export async function replenish(d: Difficulty) {
  if (!navigator.onLine || replenishing.has(d)) return;
  replenishing.add(d);
  try {
    while (readReserve(d).length < 3) {
      const puzzle = await fetchPuzzle(d);
      const reserve = readReserve(d);
      if (!reserve.includes(puzzle)) reserve.push(puzzle);
      else break;
      writeReserve(d, reserve);
      if (readReserve(d).length < reserve.length) break;
    }
  } catch {
    /* Offline reserve is best effort; never block gameplay. */
  } finally {
    replenishing.delete(d);
  }
}
export async function newPuzzle(
  d: Difficulty,
): Promise<{ game: Game; source: "fresh" | "reserve" | "bundled" }> {
  if (navigator.onLine) {
    try {
      const puzzle = await fetchPuzzle(d);
      void replenish(d);
      return { game: gameFromPuzzle(d, puzzle), source: "fresh" };
    } catch {
      /* Use reserve when the API or connection is unavailable. */
    }
  }
  const reserve = readReserve(d),
    puzzle = reserve.shift();
  if (puzzle) {
    writeReserve(d, reserve);
    return { game: gameFromPuzzle(d, puzzle), source: "reserve" };
  }
  // A bundled collection keeps the app playable even after the reserve is exhausted.
  return { game: createGame(d), source: "bundled" };
}
