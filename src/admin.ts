import "./admin.css";
import { activitySummary, type DailyTime } from "./daily-time";
type Row = Record<string, string | number | null>;
type Stats = {
  now: number;
  days: number;
  localPreview: boolean;
  totals: Row;
  difficulties: Row[];
  presence: Row[];
  players: Row[];
  recent: Row[];
  daily: DailyTime[];
  timezone: string;
};
const app = document.querySelector<HTMLDivElement>("#admin-app")!;
app.innerHTML = `<main><header><div><a href="/">♡ SansDoku</a><h1>Your little stats room</h1><p id="admin-auth">Private dashboard</p></div><form method="post" action="/admin/logout"><button>Sign out</button></form></header><div class="filters"><label>Show <select id="range"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option></select></label><button id="all" hidden>← All players</button><button id="refresh">Refresh</button><span id="status" role="status">Loading…</span></div><h2 id="scope">All players</h2><section id="totals" class="cards"></section><section><h2>Play time over time</h2><p class="hint">India time (Asia/Kolkata). Weeks start Monday. Averages include quiet days and the calendar weeks/months touched by this date range; edge periods may be partial. Daily history starts with this update.</p><div id="activity-cards" class="cards"></div><details><summary>Daily play time</summary><div id="daily-time" class="table-wrap"></div></details><details><summary>Weekly play time</summary><div id="weekly-time" class="table-wrap"></div></details><details><summary>Monthly play time</summary><div id="monthly-time" class="table-wrap"></div></details></section><section><h2><span class="live-dot"></span> Playing now</h2><p class="hint">Online heartbeats · updates every 30 seconds · expires after 90 seconds. Nicknames are self-selected.</p><div id="presence"></div></section><section><h2>By difficulty</h2><div id="difficulties" class="table-wrap"></div></section><section><h2>Players</h2><p class="hint">Select a nickname for individual stats. Different devices count separately.</p><div id="players" class="table-wrap"></div></section><section><h2>Recent games</h2><p class="hint">Most recent 100 games in the selected period. Times count active play; hidden and idle time is paused.</p><div id="recent" class="table-wrap"></div></section></main>`;
const range = document.querySelector<HTMLSelectElement>("#range")!;
let player = "";
let playerName = "";
let loading = false;
const text = (value: unknown) => String(value ?? "");
function duration(value: unknown) {
  if (value === null || value === undefined) return "—";
  const s = Math.floor(Number(value) / 1000);
  return s >= 3600
    ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
    : `${Math.floor(s / 60)}m ${s % 60}s`;
}
function date(value: unknown) {
  return value ? new Date(Number(value)).toLocaleString() : "—";
}
function rate(row: Row) {
  return row.started
    ? `${Math.round((Number(row.completed) / Number(row.started)) * 100)}%`
    : "—";
}
function table(id: string, headings: string[], rows: (string | Node)[][]) {
  const target = document.querySelector(id)!;
  target.replaceChildren();
  if (!rows.length) {
    const p = document.createElement("p");
    p.textContent = "No games yet in this period.";
    target.append(p);
    return;
  }
  const t = document.createElement("table"),
    head = document.createElement("thead"),
    tr = document.createElement("tr");
  headings.forEach((h) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = h;
    tr.append(th);
  });
  head.append(tr);
  t.append(head);
  const body = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((value) => {
      const td = document.createElement("td");
      if (typeof value === "string") td.textContent = value;
      else td.append(value);
      tr.append(td);
    });
    body.append(tr);
  });
  t.append(body);
  target.append(t);
}
function playerButton(row: Row, label = text(row.nickname)) {
  const b = document.createElement("button");
  b.className = "player-link";
  b.textContent = label;
  b.setAttribute("aria-label", `View stats for ${text(row.nickname)}`);
  b.onclick = () => {
    player = text(row.player_id);
    playerName = text(row.nickname);
    void refresh();
  };
  return b;
}
async function refresh() {
  if (loading || document.hidden) return;
  loading = true;
  document.querySelector("#status")!.textContent = "Updating…";
  try {
    const q = new URLSearchParams({ days: range.value });
    if (player) q.set("player", player);
    const response = await fetch(`/admin/api/stats?${q}`, {
      cache: "no-store",
      redirect: "error",
    });
    if (response.status === 401)
      throw new Error("Session expired. Reload to sign in again.");
    if (!response.ok)
      throw new Error("Stats unavailable. Check database setup, then retry.");
    const data: Stats = await response.json();
    document.querySelector("#admin-auth")!.textContent = data.localPreview
      ? "Local preview · production requires password sign-in"
      : "Private · signed in as admin";
    document.querySelector("#scope")!.textContent = player
      ? `Stats for ${playerName}`
      : "All players";
    (document.querySelector("#all") as HTMLButtonElement).hidden = !player;
    const cards = document.querySelector("#totals")!;
    cards.replaceChildren();
    for (const [label, value] of [
      ["Games started", data.totals.started],
      ["Completed", data.totals.completed],
      ["Completion rate", rate(data.totals)],
      ["Players", data.totals.players],
      ["Total play time", duration(data.totals.active_ms)],
      ["Average solve", duration(data.totals.average_ms)],
    ]) {
      const card = document.createElement("div");
      card.className = "card";
      const p = document.createElement("p");
      p.textContent = text(label);
      const strong = document.createElement("strong");
      strong.textContent = text(value);
      card.append(p, strong);
      cards.append(card);
    }
    const activity = activitySummary(data.daily, data.days, data.now);
    const activityCards = document.querySelector("#activity-cards")!;
    activityCards.replaceChildren();
    for (const [label, value] of [
      ["Tracked play time", duration(activity.total)],
      ["Average / day", duration(activity.averageDay)],
      ["Average / week", duration(activity.averageWeek)],
      ["Average / month", duration(activity.averageMonth)],
      ["Most active date", activity.mostActive?.day || "—"],
      ["Time on that date", duration(activity.mostActive?.activeMs)],
    ]) {
      const card = document.createElement("div");
      card.className = "card";
      const labelNode = document.createElement("p");
      labelNode.textContent = label;
      const valueNode = document.createElement("strong");
      valueNode.textContent = value;
      card.append(labelNode, valueNode);
      activityCards.append(card);
    }
    table(
      "#daily-time",
      ["Date", "Day", "Play time"],
      activity.daily
        .slice()
        .reverse()
        .map((d) => [
          d.day,
          new Date(d.day + "T12:00:00Z").toLocaleDateString(undefined, {
            weekday: "long",
            timeZone: "Asia/Kolkata",
          }),
          duration(d.activeMs),
        ]),
    );
    table(
      "#weekly-time",
      ["Week starting Monday", "Play time in range"],
      activity.weekly
        .slice()
        .reverse()
        .map((d) => [d.day, duration(d.activeMs)]),
    );
    table(
      "#monthly-time",
      ["Month", "Play time in range"],
      activity.monthly
        .slice()
        .reverse()
        .map((d) => [d.day, duration(d.activeMs)]),
    );
    // A player may have multiple active tabs; show their newest heartbeat once.
    const live = Array.from(
      new Map(
        data.presence
          .slice()
          .reverse()
          .map((p) => [p.player_id, p]),
      ).values(),
    );
    table(
      "#presence",
      ["Nickname", "Difficulty", "Progress", "Play time"],
      live.map((p) => [
        playerButton(p),
        text(p.difficulty),
        `${p.filled}/81`,
        duration(p.active_ms),
      ]),
    );
    if (!live.length)
      document.querySelector("#presence p")!.textContent =
        "Nobody is playing online right now.";
    table(
      "#difficulties",
      [
        "Difficulty",
        "Started",
        "Completed",
        "Completion",
        "Average solve",
        "Best solve",
      ],
      data.difficulties.map((d) => [
        text(d.difficulty),
        text(d.started),
        text(d.completed),
        rate(d),
        duration(d.average_ms),
        duration(d.best_ms),
      ]),
    );
    table(
      "#players",
      [
        "Nickname",
        "Stats",
        "Player ID",
        "Started",
        "Completed",
        "Completion",
        "Total time",
        "Average solve",
        "Best solve",
        "Last played",
      ],
      data.players.map((p) => [
        playerButton(p),
        playerButton(p, "View stats"),
        text(p.player_id).slice(0, 8),
        text(p.started),
        text(p.completed),
        rate(p),
        duration(p.active_ms),
        duration(p.average_ms),
        duration(p.best_ms),
        date(p.last_played),
      ]),
    );
    table(
      "#recent",
      [
        "Player",
        "Difficulty",
        "Started",
        "Status",
        "Play time",
        "Auto notes",
        "Actions",
      ],
      data.recent.map((p) => [
        playerButton(p),
        text(p.difficulty),
        date(p.started_at),
        p.completed_at ? "Completed" : "In progress",
        duration(p.active_ms),
        p.auto_used ? "Used" : "No",
        text(p.moves),
      ]),
    );
    document.querySelector("#status")!.textContent =
      `Updated ${new Date(data.now).toLocaleTimeString()}`;
  } catch (e) {
    document.querySelector("#status")!.textContent =
      e instanceof Error ? e.message : "Unable to load stats.";
  } finally {
    loading = false;
  }
}
range.onchange = () => void refresh();
document.querySelector<HTMLButtonElement>("#refresh")!.onclick = () =>
  void refresh();
document.querySelector<HTMLButtonElement>("#all")!.onclick = () => {
  player = "";
  void refresh();
};
setInterval(() => void refresh(), 30000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refresh();
});
void refresh();
