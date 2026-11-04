import {
  difficulties,
  formatDuration,
  formatTime,
  summarize,
  type Finish,
} from "./stats";
import type { Difficulty } from "./game";
// Every interpolated value below is a number or a fixed word, never user text.
const name = (d: Difficulty) => d[0].toUpperCase() + d.slice(1);
const dateText = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function growthLine(s: ReturnType<typeof summarize>): string {
  const best = difficulties
    .map((d) => ({ d, i: s.byDifficulty[d].improvement }))
    .filter((x): x is { d: Difficulty; i: number } => x.i !== undefined && x.i > 0.03)
    .sort((a, b) => b.i - a.i)[0];
  if (best)
    return `You're about ${Math.round(best.i * 100)}% faster at ${best.d} than when you started ♡`;
  return s.total >= 3
    ? "Steady and calm. Every puzzle counts ♡"
    : "Your story is just beginning ♡";
}

// Solve times for one difficulty: a thin line, one tappable dot per game.
function timeChart(finishes: Finish[], d: Difficulty): string {
  const games = finishes.filter((f) => f.difficulty === d && f.ms >= 1000).slice(-20);
  if (games.length < 2)
    return `<p class="stats-empty">Finish ${games.length ? "one more" : "two"} timed ${d} puzzle${games.length ? "" : "s"} to see your times here.</p>`;
  const W = 320,
    H = 150,
    L = 38,
    R = 10,
    T = 12,
    B = 22;
  const lo = Math.min(...games.map((g) => g.ms)),
    hi = Math.max(...games.map((g) => g.ms));
  const pad = (hi - lo || hi * 0.2) * 0.15;
  const min = Math.max(0, lo - pad),
    max = hi + pad;
  const x = (i: number) => L + (i * (W - L - R)) / (games.length - 1);
  const y = (ms: number) => T + ((max - ms) * (H - T - B)) / (max - min);
  const line = games.map((g, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(g.ms).toFixed(1)}`).join(" ");
  const ticks = [min + (max - min) * 0.08, (min + max) / 2, max - (max - min) * 0.08];
  const grid = ticks
    .map(
      (t) =>
        `<line x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end" class="axis">${formatTime(t)}</text>`,
    )
    .join("");
  const dots = games
    .map(
      (g, i) =>
        `<circle cx="${x(i).toFixed(1)}" cy="${y(g.ms).toFixed(1)}" r="4" class="dot${g.hints ? " hinted" : ""}"/><circle cx="${x(i).toFixed(1)}" cy="${y(g.ms).toFixed(1)}" r="14" class="hit" data-readout="${name(d)} · ${dateText(g.at)} · ${formatTime(g.ms)}${g.hints ? " · with a hint" : ""}" tabindex="0" role="button" aria-label="${dateText(g.at)}, ${formatTime(g.ms)}"/>`,
    )
    .join("");
  const first = games[0].at,
    last = games[games.length - 1].at;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${name(d)} solve times, oldest to newest, from ${formatTime(games[0].ms)} to ${formatTime(games[games.length - 1].ms)}">${grid}<path d="${line}" class="line"/>${dots}<text x="${L}" y="${H - 5}" class="axis">${dateText(first)}</text><text x="${W - R}" y="${H - 5}" text-anchor="end" class="axis">${dateText(last)}</text></svg>
<p class="chart-readout" data-readout-target aria-live="polite">Tap a dot for details. Lower is faster.</p>`;
}

// Puzzles finished per week, with rounded tops anchored to the baseline.
function weekChart(s: ReturnType<typeof summarize>): string {
  const W = 320,
    H = 120,
    T = 16,
    B = 20;
  const max = Math.max(1, ...s.weeks.map((w) => w.count));
  const slot = W / s.weeks.length,
    bar = Math.min(26, slot - 10);
  const bars = s.weeks
    .map((w, i) => {
      const h = w.count ? Math.max(5, (w.count / max) * (H - T - B)) : 0;
      const cx = i * slot + slot / 2;
      const label = `Week of ${dateText(w.start.getTime())} · ${plural(w.count, "puzzle")}`;
      return `${h ? `<rect x="${(cx - bar / 2).toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${bar}" height="${h.toFixed(1)}" rx="4" class="bar"/><text x="${cx.toFixed(1)}" y="${(H - B - h - 4).toFixed(1)}" text-anchor="middle" class="axis">${w.count}</text>` : `<rect x="${(cx - bar / 2).toFixed(1)}" y="${H - B - 2}" width="${bar}" height="2" class="bar empty"/>`}<rect x="${(cx - slot / 2).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}" class="hit" data-readout="${label}" tabindex="0" role="button" aria-label="${label}"/><text x="${cx.toFixed(1)}" y="${H - 5}" text-anchor="middle" class="axis">${i === s.weeks.length - 1 ? "now" : dateText(w.start.getTime())}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Puzzles finished per week over the last ${s.weeks.length} weeks">${bars}</svg>
<p class="chart-readout" data-readout-target aria-live="polite">Tap a bar for details.</p>`;
}

export function renderStats(finishes: Finish[], selected: Difficulty, synced: boolean): string {
  const s = summarize(finishes);
  const note = synced
    ? "Saved to your account ♡ it follows you to any phone."
    : "Saved on this device.";
  if (!s.total)
    return `<p class="stats-note">${note}</p><p class="stats-empty big">Finish a puzzle and your story starts here ♡</p>`;
  const tile = (value: string, label: string) =>
    `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`;
  const rows = difficulties
    .map((d) => {
      const x = s.byDifficulty[d];
      return `<tr><th scope="row">${name(d)}</th><td>${x.count}</td><td>${x.bestMs ? formatTime(x.bestMs) : "–"}</td><td>${x.avgMs ? formatTime(x.avgMs) : "–"}</td></tr>`;
    })
    .join("");
  const recent = finishes
    .slice(-10)
    .reverse()
    .map(
      (f) =>
        `<tr><th scope="row">${dateText(f.at)}</th><td>${name(f.difficulty)}</td><td>${f.ms >= 1000 ? formatTime(f.ms) : "–"}</td><td>${f.hints ? "hint" : ""}</td></tr>`,
    )
    .join("");
  return `<p class="stats-note">${note}</p>
<div class="stat-grid">${tile(String(s.total), s.total === 1 ? "puzzle finished" : "puzzles finished")}${tile(String(s.currentStreak), s.currentStreak === 1 ? "day in a row" : "days in a row")}${tile(String(s.longestStreak), "longest streak")}${tile(s.playMs >= 60000 ? formatDuration(s.playMs) : "–", "time played")}</div>
<p class="growth">${growthLine(s)}</p>
<h3>How you're growing</h3>
<div class="stat-tabs" role="group" aria-label="Difficulty">${difficulties.map((d) => `<button data-stats-difficulty="${d}" aria-pressed="${d === selected}">${name(d)}</button>`).join("")}</div>
${timeChart(finishes, selected)}
<h3>Puzzles per week</h3>
${weekChart(s)}
<h3>By difficulty</h3>
<table class="stats-table"><thead><tr><th></th><th scope="col">Done</th><th scope="col">Best</th><th scope="col">Average</th></tr></thead><tbody>${rows}</tbody></table>
<h3>Recent puzzles</h3>
<table class="stats-table"><tbody>${recent}</tbody></table>`;
}
