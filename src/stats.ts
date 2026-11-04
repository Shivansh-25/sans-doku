import type { Difficulty } from "./game";
export type Stats = {
  finished: Record<Difficulty, number>;
  best: Partial<Record<Difficulty, number>>;
  streak: number;
  lastDay: string | null;
};
export const emptyStats = (): Stats => ({
  finished: { easy: 0, medium: 0, hard: 0 },
  best: {},
  streak: 0,
  lastDay: null,
});
const key = "sansdoku:stats:v1";
export function dayKey(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function yesterday(d: Date): string {
  const y = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  return dayKey(y);
}
export function total(stats: Stats) {
  return stats.finished.easy + stats.finished.medium + stats.finished.hard;
}
// The streak only counts while she played today or yesterday.
export function currentStreak(stats: Stats, now = new Date()): number {
  return stats.lastDay === dayKey(now) || stats.lastDay === yesterday(now)
    ? stats.streak
    : 0;
}
export function recordFinish(
  stats: Stats,
  difficulty: Difficulty,
  ms: number,
  usedHint: boolean,
  now = new Date(),
): { stats: Stats; newBest: boolean } {
  const today = dayKey(now);
  const next: Stats = {
    finished: { ...stats.finished, [difficulty]: stats.finished[difficulty] + 1 },
    best: { ...stats.best },
    streak:
      stats.lastDay === today
        ? Math.max(1, stats.streak)
        : stats.lastDay === yesterday(now)
          ? stats.streak + 1
          : 1,
    lastDay: today,
  };
  const previous = stats.best[difficulty];
  const newBest = !usedHint && ms >= 1000 && (previous === undefined || ms < previous);
  if (newBest) next.best[difficulty] = ms;
  return { stats: next, newBest };
}
export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m >= 60
    ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${m}:${String(s % 60).padStart(2, "0")}`;
}
export function loadStats(): Stats {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    const count = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
    if (
      v &&
      count(v.finished?.easy) &&
      count(v.finished?.medium) &&
      count(v.finished?.hard) &&
      count(v.streak) &&
      (v.lastDay === null || typeof v.lastDay === "string")
    ) {
      const best: Stats["best"] = {};
      for (const d of ["easy", "medium", "hard"] as Difficulty[])
        if (Number.isFinite(v.best?.[d]) && v.best[d] > 0) best[d] = v.best[d];
      return { finished: v.finished, best, streak: v.streak, lastDay: v.lastDay };
    }
  } catch {}
  return emptyStats();
}
export function saveStats(stats: Stats) {
  try {
    localStorage.setItem(key, JSON.stringify(stats));
  } catch {}
}
