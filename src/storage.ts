import { type Difficulty, type Game, validGame } from "./game";
const key = (d: Difficulty) => `sansdoku:v1:${d}`;
export function load(d: Difficulty): Game | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(d)) || "null");
    return validGame(value, d) ? value : null;
  } catch {
    return null;
  }
}
export function save(game: Game): boolean {
  try {
    localStorage.setItem(key(game.difficulty), JSON.stringify(game));
    return true;
  } catch {
    return false;
  }
}
