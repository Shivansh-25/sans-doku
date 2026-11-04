import type { Difficulty } from "./game";
export type Finish = {
  id: string;
  difficulty: Difficulty;
  at: number; // finish time, ms since epoch
  ms: number; // active play time, 0 when unknown
  hints: number;
  acct?: boolean; // finished while signed in to the sans account
  synced?: boolean;
};
export const difficulties: Difficulty[] = ["easy", "medium", "hard"];
const key = "sansdoku:history:v1";
const legacyKey = "sansdoku:stats:v1";
const isFinish = (f: unknown): f is Finish => {
  const v = f as Finish;
  return Boolean(
    v &&
      typeof v.id === "string" &&
      /^[A-Za-z0-9:_-]{6,64}$/.test(v.id) &&
      difficulties.includes(v.difficulty) &&
      Number.isSafeInteger(v.at) &&
      Number.isSafeInteger(v.ms) &&
      v.ms >= 0 &&
      Number.isSafeInteger(v.hints) &&
      v.hints >= 0,
  );
};
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function addFinish(history: Finish[], f: Finish): Finish[] {
  return history.some((h) => h.id === f.id)
    ? history
    : [...history, f].sort((a, b) => a.at - b.at);
}
export const scope = (history: Finish[], acct: boolean) =>
  history.filter((f) => Boolean(f.acct) === acct);
// Her synced rows replace nothing local: missing ones are added, matching ones marked synced.
export function mergeRemote(
  history: Finish[],
  remote: { id: string; difficulty: Difficulty; at: number; ms: number; hints: number }[],
): Finish[] {
  const ids = new Set(remote.map((r) => r.id));
  let merged = history.map((f) => (f.acct && ids.has(f.id) ? { ...f, synced: true } : f));
  for (const r of remote)
    if (isFinish(r) && !merged.some((f) => f.id === r.id))
      merged = addFinish(merged, { ...r, acct: true, synced: true });
  return merged;
}
export function loadHistory(): Finish[] {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const list = JSON.parse(saved);
      return Array.isArray(list)
        ? list.filter(isFinish).sort((a: Finish, b: Finish) => a.at - b.at)
        : [];
    }
    // One-time carry-over from the earlier counters-only version.
    const old = JSON.parse(localStorage.getItem(legacyKey) || "null");
    const seeded: Finish[] = [];
    if (old?.finished) {
      const when = old.lastDay ? new Date(`${old.lastDay}T12:00:00`).getTime() : Date.now();
      for (const d of difficulties)
        for (let i = 0; i < (Number.isInteger(old.finished[d]) ? old.finished[d] : 0); i++)
          seeded.push({
            id: `legacy-${d}-${i}`,
            difficulty: d,
            at: Number.isFinite(when) ? when : Date.now(),
            ms: i === 0 && Number.isFinite(old.best?.[d]) ? Math.round(old.best[d]) : 0,
            hints: 0,
          });
      saveHistory(seeded);
    }
    return seeded;
  } catch {
    return [];
  }
}
export function saveHistory(history: Finish[]) {
  try {
    localStorage.setItem(key, JSON.stringify(history));
  } catch {}
}
const timed = (f: Finish) => f.ms >= 1000;
export function bestMs(finishes: Finish[], d: Difficulty): number | undefined {
  const times = finishes.filter((f) => f.difficulty === d && f.hints === 0 && timed(f)).map((f) => f.ms);
  return times.length ? Math.min(...times) : undefined;
}
// A new best needs a hint-free, timed game that beats the earlier best.
export function isNewBest(previous: Finish[], f: Finish): boolean {
  if (f.hints > 0 || !timed(f)) return false;
  const best = bestMs(previous, f.difficulty);
  return best === undefined || f.ms < best;
}
export type DifficultySummary = {
  count: number;
  bestMs?: number;
  avgMs?: number;
  improvement?: number; // fraction faster: first three vs latest three timed games
};
export type Summary = {
  total: number;
  currentStreak: number;
  longestStreak: number;
  playMs: number;
  byDifficulty: Record<Difficulty, DifficultySummary>;
  weeks: { start: Date; count: number }[];
};
const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
function streaks(finishes: Finish[], now: Date) {
  const days = [...new Set(finishes.map((f) => dayKey(new Date(f.at))))].sort();
  let longest = 0,
    run = 0,
    previous = "";
  for (const day of days) {
    const [y, m, d] = day.split("-").map(Number);
    const before = dayKey(new Date(y, m - 1, d - 1));
    run = previous === before ? run + 1 : 1;
    previous = day;
    longest = Math.max(longest, run);
  }
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const alive = previous === dayKey(now) || previous === yesterday;
  return { current: alive ? run : 0, longest };
}
// Weeks start on Monday; the last entry is the current week.
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
export function summarize(finishes: Finish[], now = new Date(), weekCount = 8): Summary {
  const byDifficulty = {} as Record<Difficulty, DifficultySummary>;
  for (const d of difficulties) {
    const own = finishes.filter((f) => f.difficulty === d);
    const times = own.filter(timed).sort((a, b) => a.at - b.at).map((f) => f.ms);
    byDifficulty[d] = {
      count: own.length,
      bestMs: bestMs(finishes, d),
      avgMs: times.length ? mean(times) : undefined,
      improvement:
        times.length >= 6
          ? (mean(times.slice(0, 3)) - mean(times.slice(-3))) / mean(times.slice(0, 3))
          : undefined,
    };
  }
  const thisWeek = weekStart(now);
  const weeks = Array.from({ length: weekCount }, (_, i) => {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - 7 * (weekCount - 1 - i));
    return { start, count: 0 };
  });
  for (const f of finishes) {
    const w = weekStart(new Date(f.at)).getTime();
    const slot = weeks.find((x) => x.start.getTime() === w);
    if (slot) slot.count++;
  }
  const { current, longest } = streaks(finishes, now);
  return {
    total: finishes.length,
    currentStreak: current,
    longestStreak: longest,
    playMs: finishes.reduce((sum, f) => sum + f.ms, 0),
    byDifficulty,
    weeks,
  };
}
export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m >= 60
    ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${m}:${String(s % 60).padStart(2, "0")}`;
}
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
