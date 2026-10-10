import { completed, type Game } from "./game";
import { getProfile } from "./profile";
import { PlayClock } from "./play-clock";
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
      .map((p) => ({ ...p, lastPlayedAt: p.lastPlayedAt || p.startedAt }));
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
function accrue() {
  if (current && clock && !current.completedAt) {
    const elapsed = Math.round(clock.tick(performance.now()));
    current.activeMs += elapsed;
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
    current.activeMs += Math.round(clock.touch(performance.now()));
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
  const batch = plays
    .filter((p) => p.dirty)
    .slice(0, 20)
    .map((p) => ({
      ...p,
      playing:
        p === current &&
        !p.completedAt &&
        Boolean(clock?.active(performance.now())) &&
        !document.hidden,
    }));
  if (!batch.length) return;
  syncing = true;
  lastSync = Date.now();
  try {
    const response = await fetch("/api/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plays: batch.map(({ key: _key, dirty: _dirty, ...p }) => p),
      }),
      keepalive,
      signal: AbortSignal.timeout(7000),
    });
    if (response.ok) {
      for (const sent of batch) {
        const live = plays.find((p) => p.id === sent.id);
        if (live?.revision === sent.revision) live.dirty = false;
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
    current.activeMs += Math.round(
      clock.visibility(performance.now(), !document.hidden),
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
    current.activeMs += Math.round(
      clock.visibility(performance.now(), !document.hidden),
    );
    dirty(current);
    persist();
    void syncMetrics();
  }
});
