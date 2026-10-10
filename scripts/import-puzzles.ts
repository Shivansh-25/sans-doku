// Run locally: YOUDOSUDOKU_API_KEY=<key> npm run puzzles:import
// Confirm your provider plan permits storing and sharing puzzles before importing.
import { writeFile } from "node:fs/promises";
import { completed, solutionCount, type Difficulty } from "../src/game";
const key = process.env.YOUDOSUDOKU_API_KEY;
if (!key)
  throw new Error(
    "Set YOUDOSUDOKU_API_KEY locally. Never put it in a VITE_ variable or commit it.",
  );
const count = Number(process.env.PUZZLES_PER_DIFFICULTY || 10);
if (!Number.isInteger(count) || count < 1 || count > 100)
  throw new Error("PUZZLES_PER_DIFFICULTY must be 1–100.");
const bank: Record<Difficulty, string[]> = { easy: [], medium: [], hard: [] };
function grid(value: unknown): number[] {
  const a =
    typeof value === "string"
      ? [...value].map((n) => (n === "." ? 0 : Number(n)))
      : Array.isArray(value)
        ? value.flat().map((n) => (n === null ? 0 : n))
        : [];
  if (a.length !== 81 || a.some((n) => !Number.isInteger(n) || n < 0 || n > 9))
    throw new Error("Provider returned an invalid grid.");
  return a;
}
for (const difficulty of ["easy", "medium", "hard"] as Difficulty[]) {
  for (let i = 0; i < count; i++) {
    const response = await fetch("https://www.youdosudoku.com/api/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({ difficulty, solution: true, array: false }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(
        `YouDoSudoku returned HTTP ${response.status}; no files changed.`,
      );
    const data = (await response.json()) as {
      puzzle: unknown;
      solution: unknown;
    };
    const puzzle = grid(data.puzzle),
      solution = grid(data.solution);
    if (
      !completed(solution) ||
      puzzle.some((n, j) => n && n !== solution[j]) ||
      solutionCount(puzzle) !== 1
    )
      throw new Error("Puzzle validation failed; no files changed.");
    const encoded = puzzle.join("");
    if (!bank[difficulty].includes(encoded)) bank[difficulty].push(encoded);
  }
  console.log(`${difficulty}: ${bank[difficulty].length} validated puzzles`);
}
await writeFile(
  new URL("../src/puzzles.json", import.meta.url),
  JSON.stringify(bank, null, 2) + "\n",
);
console.log(
  "Puzzle bank updated. Run npm test && npm run build before deploying.",
);
