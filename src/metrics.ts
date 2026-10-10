import { completed, type Game } from "./game";
import { getProfile } from "./profile";
import { PlayClock } from "./play-clock";
import { addDailyTime, type DailyTime } from "./daily-time";
type Play = {
  key: string;
  id: string;
  token: string;
  playerId: string;
  nickname: string;
  difficulty: string;
  startedAt: number;
  lastPlayedAt: number;
  completedAt: number | null;
  activeMs: number;
  days: DailyTime[];
  syncedDays: Record<string, number>;
  autoUsed: boolean;
  moves: number;
  filled: number;
  revision: number;
  dirty: boolean;
};
const storageKey = "sansdoku:metrics:v1";
let plays: Play[] = [];
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  if (Array.isArray(saved))
    plays = saved
      .filter(
        (p) =>
          p &&
          typeof p.key === "string" &&
          typeof p.id === "string" &&
          typeof p.token === "string" &&
          Number.isFinite(p.activeMs) &&
          Number.isInteger(p.revision),
      )
      .map((p) => ({
        ...p,
        lastPlayedAt: p.lastPlayedAt || p.startedAt,
        days: p.days || [],
        syncedDays: p.syncedDays || {},
      }));
} catch {}
let current: Play | undefined;
let clock: PlayClock | undefined;
let syncing = false;
let lastSync = 0;
let lastPlaying = false;
function persist() {
  // Prefer keeping unsent games over already synced history if storage grows.
  while (plays.length > 500) {
    const i = plays.findIndex((p) => p !== current && !p.dirty);
    if (i < 0) break;
    plays.splice(i, 1);
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(plays));
  } catch {}
}
function dirty(p: Play) {
  p.revision++;
  p.dirty = true;
}
function recordTime(elapsed: number) {
  if (!current || !clock || elapsed <= 0) return;
  current.activeMs += elapsed;
  addDailyTime(
    current.days,
    Math.round(performance.timeOrigin + clock.lastInterval.start),
    elapsed,
  );
  current.days = current.days.slice(-366);
}
function accrue() {
  if (current && clock && !current.completedAt) {
    const elapsed = Math.round(clock.tick(performance.now()));
    recordTime(elapsed);
    if (elapsed > 0) {
      current.lastPlayedAt = Date.now();
      dirty(current);
    }
  }
}
export function pauseMetrics() {
  accrue();
  if (current) dirty(current);
  lastPlaying = false;
  current = undefined;
  clock = undefined;
  persist();
  void syncMetrics();
}
export function touchMetrics(game: Game, move = false) {
  const profile = getProfile();
  const key = `${profile.id}:${game.difficulty}:${game.startedAt}:${game.givens.join("")}`;
  if (current?.key !== key) {
    pauseMetrics();
    current = plays.find((p) => p.key === key);
    if (!current && !move) return;
    if (!current) {
      current = {
        key,
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        playerId: profile.id,
        nickname: profile.nickname || "Guest",
        difficulty: game.difficulty,
        startedAt: Date.now(),
        lastPlayedAt: Date.now(),
        completedAt: null,
        activeMs: 0,
        days: [],
        syncedDays: {},
        autoUsed: false,
        moves: 0,
        filled: game.values.filter(Boolean).length,
        revision: 0,
        dirty: true,
      };
      plays.push(current);
    }
    clock = new PlayClock(performance.now());
    clock.visibility(performance.now(), !document.hidden);
  }
  if (clock && !current.completedAt)
    recordTime(Math.round(clock.touch(performance.now())));
  current.lastPlayedAt = Date.now();
  current.nickname = profile.nickname || "Guest";
  current.filled = game.values.filter(Boolean).length;
  current.autoUsed ||= Boolean(game.autoCandidates);
  if (move) current.moves++;
  const justCompleted = completed(game.values) && !current.completedAt;
  if (justCompleted) current.completedAt = Date.now();
  dirty(current);
  persist();
  if (justCompleted || Date.now() - lastSync >= 30_000) void syncMetrics();
}
export async function syncMetrics(keepalive = false) {
  if (syncing || !navigator.onLine) return;
  let payloadSize = 0;
  const batch = plays
    .filter((p) => p.dirty)
    .map((p) => {
      const { key: _key, dirty: _dirty, syncedDays: _syncedDays, ...body } = p;
      return {
        ...body,
        days: p.days.filter((d) => d.activeMs > (p.syncedDays[d.day] || 0)),
        playing:
          p === current &&
          !p.completedAt &&
          Boolean(clock?.active(performance.now())) &&
          !document.hidden,
      };
    })
    .filter((p) => {
      const size = JSON.stringify(p).length + 100;
      if (payloadSize + size > 26000) return false;
      payloadSize += size;
      return true;
    })
    .slice(0, 20);
  if (!batch.length) return;
  syncing = true;
  lastSync = Date.now();
  try {
    const response = await fetch("/api/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plays: batch,
      }),
      keepalive,
      signal: AbortSignal.timeout(7000),
    });
    if (response.ok) {
      for (const sent of batch) {
        const live = plays.find((p) => p.id === sent.id);
        if (live) {
          for (const d of sent.days)
            live.syncedDays[d.day] = Math.max(
              live.syncedDays[d.day] || 0,
              d.activeMs,
            );
          if (live.revision === sent.revision) live.dirty = false;
        }
      }
      persist();
    }
  } catch {
    /* Offline stats wait for another sync; gameplay never waits. */
  } finally {
    syncing = false;
  }
}
setInterval(() => {
  accrue();
  const playing = Boolean(
    current &&
    !current.completedAt &&
    clock?.active(performance.now()) &&
    !document.hidden,
  );
  if (current && playing !== lastPlaying) dirty(current);
  lastPlaying = playing;
  persist();
  if (Date.now() - lastSync >= 30_000) void syncMetrics();
}, 10_000);
document.addEventListener("visibilitychange", () => {
  if (current && clock && !current.completedAt) {
    recordTime(
      Math.round(clock.visibility(performance.now(), !document.hidden)),
    );
    dirty(current);
  }
  persist();
  void syncMetrics(document.hidden);
});
window.addEventListener("pagehide", () => {
  accrue();
  clock?.visibility(performance.now(), false);
  if (current) dirty(current);
  persist();
  void syncMetrics(true);
});
window.addEventListener("online", () => void syncMetrics());
void syncMetrics();
window.addEventListener("pageshow", () => {
  if (current && clock && !current.completedAt) {
    recordTime(
      Math.round(clock.visibility(performance.now(), !document.hidden)),
    );
    dirty(current);
    persist();
    void syncMetrics();
  }
});
