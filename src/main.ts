import "./style.css";
import { registerSW } from "virtual:pwa-register";
import {
  createGame,
  completed,
  conflicts,
  enter,
  restartPuzzle,
  undo,
  solveUnique,
  findHint,
  type Hint,
  toggleAutoCandidates,
  visibleNotes,
  type Difficulty,
} from "./game";
import { load, save } from "./storage";
import { newPuzzle, replenish } from "./puzzle-source";
import { getTheme, setTheme, type Theme } from "./theme";
import { celebrate, clearCelebration } from "./celebration";
import {
  getProfile,
  setNickname,
  canUseSans,
  reservedName,
  startAccount,
  endAccount,
} from "./profile";
import { signIn, signOut, checkSession, pullFinishes, pushFinishes } from "./account";
import { touchMetrics, pauseMetrics } from "./metrics";
import { PlayClock } from "./play-clock";
import { greeting, togetherLine } from "./greeting";
import { chime, unlockAudio } from "./sound";
import { unlockedKeys } from "./milestones";
import { cachedNotes, fetchNotes, inbox, loadSeen, markSeen, nextLocked, unseenItems, type Notes } from "./notes";
import { getPrefs, setPref } from "./prefs";
import {
  loadHistory,
  saveHistory,
  addFinish,
  mergeRemote,
  scope,
  summarize,
  isNewBest,
  formatTime,
  difficulties,
  type Finish,
} from "./stats";
import { renderStats, type StatsFilter } from "./stats-view";
const app = document.querySelector<HTMLDivElement>("#app")!;
const initialSaved = load("easy");
let busy = false;
let difficulty: Difficulty = "easy",
  game = initialSaved || createGame(difficulty),
  selected = -1,
  noteMode = false,
  ready = false;
let updateReady = false;
let armed = 0,
  hintState: Hint | null = null,
  finishNote = "",
  clock = new PlayClock(Date.now()),
  solutionKey = "",
  solutionCache: number[] | null = null;
const puzzles = (n: number) => `${n} ${n === 1 ? "puzzle" : "puzzles"}`;
let history: Finish[] = loadHistory();
let statsFilter: StatsFilter = "all";
let inboxData: Notes = cachedNotes();
const signedIn = () => Boolean(getProfile().account);
const myFinishes = () => scope(history, signedIn());
const sansTheme = () => getTheme() === "sans";
const setMessage = (text: string) =>
  (document.querySelector("#message")!.textContent = text);
// Puzzles are unique, so the solution is derived on demand and never stored.
function solution() {
  const k = game.givens.join("");
  if (k !== solutionKey) {
    solutionKey = k;
    solutionCache = solveUnique(game.givens);
  }
  return solutionCache;
}
function flushPlay() {
  game.playMs = (game.playMs || 0) + clock.tick(Date.now());
}
function adopt(next: typeof game) {
  flushPlay();
  save(game);
  game = next;
  clock = new PlayClock(Date.now());
  armed = 0;
  hintState = null;
  finishNote = "";
}
function updateClock() {
  const el = document.querySelector<HTMLElement>("#clock")!;
  const on = getPrefs().timer;
  el.hidden = !on;
  if (on) {
    flushPlay();
    el.textContent = formatTime(game.playMs || 0);
  }
}
setInterval(() => {
  if (getPrefs().timer && !document.hidden) updateClock();
}, 1000);
document.addEventListener("visibilitychange", () => {
  game.playMs =
    (game.playMs || 0) + clock.visibility(Date.now(), !document.hidden);
  if (document.hidden) save(game);
});
const icon = (name: string) =>
  ({
    undo: "↶",
    erase: "⌫",
    notes: "✎",
    auto: "✦",
    hint: "✧",
    new: "＋",
  })[name] || "";
app.innerHTML = `<main class="shell"><header><a class="brand" href="/" aria-label="SansDoku home"><span class="brand-mark">▦</span> SansDoku<span class="brand-dot">.</span></a><div class="header-actions"><button class="icon-button" id="stats-open" aria-label="Open your stats"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 20V11M12 20V5M19 20v-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button><button class="icon-button" id="settings" aria-label="Open settings"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h8.5M17.5 7H20M4 12h3.5M12.5 12H20M4 17h9.5M18.5 17H20"/><circle cx="15" cy="7" r="2.5"/><circle cx="10" cy="12" r="2.5"/><circle cx="16" cy="17" r="2.5"/></svg></button></div></header><section class="intro"><p class="eyebrow">A LITTLE MOMENT FOR YOU</p><h1>One square at a time.</h1><p class="subtitle">No rush. Just you and a little possibility.</p></section><nav class="difficulties" aria-label="Difficulty">${(["easy", "medium", "hard"] as Difficulty[]).map((d) => `<button data-difficulty="${d}" aria-pressed="${d === difficulty}">${d[0].toUpperCase() + d.slice(1)}</button>`).join("")}</nav><section class="game-area" aria-label="Sudoku game"><div class="game-meta"><span id="progress"></span><span id="clock" class="clock" hidden></span><span id="saved" class="saved"></span></div><div id="board" class="board" role="group" aria-label="Sudoku board"></div><p class="game-message" id="message" role="status" aria-live="polite">Pick a square. Make a little progress.</p><div class="tools"><button id="undo">${icon("undo")}<span>Undo</span></button><button id="erase">${icon("erase")}<span>Erase</span></button><button id="notes" aria-pressed="false">${icon("notes")}<span>Notes</span></button><button id="auto" aria-pressed="false" aria-label="Automatic candidates">${icon("auto")}<span>Auto</span></button><button id="hint" aria-label="Hint">${icon("hint")}<span>Hint</span></button></div><div class="number-pad" aria-label="Number pad">${Array.from({ length: 9 }, (_, i) => `<button data-number="${i + 1}" aria-label="Enter ${i + 1}">${i + 1}<span class="left" aria-hidden="true"></span></button>`).join("")}</div><button id="new-game" class="new-game">${icon("new")} New puzzle</button><aside id="install-tip" class="install-tip" hidden><span>♡ Add SansDoku to your Home Screen for a full-screen app.</span><button id="install-how">Show me how</button><button id="install-dismiss" aria-label="Dismiss tip">×</button></aside></section><footer><span class="small-heart">♡</span><span id="footer-message">A little space to slow down.</span><span id="offline-status"></span><button id="update" hidden>Update available</button></footer></main><dialog id="settings-dialog"><div class="dialog-top"><h2>Your little space</h2><button class="icon-button" id="close-settings" aria-label="Close settings">×</button></div><section class="player-settings"><div class="profile-row"><div><span class="profile-label">Playing as</span><strong id="player-label" class="profile-name"></strong></div><div class="profile-actions"><button id="edit-nickname" class="profile-edit" aria-label="Change nickname">Edit</button><button id="signin-open" class="profile-edit">Sign in</button><button id="signout" class="profile-edit" hidden>Sign out</button></div></div><p class="metrics-notice">Your nickname, game stats, and online playing status are shared with the app owner. No email needed.</p></section><fieldset class="appearance"><legend>Appearance</legend><div class="theme-options">${["light", "dark", "system", "sans"].map((t) => `<button data-theme-choice="${t}" aria-pressed="${getTheme() === t}">${t === "sans" ? "Sans mode ♡" : t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div></fieldset><fieldset class="appearance"><legend>Helpers</legend><div class="theme-options wrap"><button id="pref-mistakes">Mistake alerts</button><button id="pref-timer">Show timer</button><button id="pref-advance">Auto-advance</button><button id="pref-sound">Finish chime</button></div></fieldset><section class="record"><h3>Your little record</h3><p id="record-text"></p><button type="button" class="profile-edit" id="stats-open-settings">See all my stats</button></section><p>Add SansDoku to your iPhone Home Screen for a full-screen app. <button type="button" class="profile-edit" id="install-open">Show me how</button></p><p id="offline-detail"></p><p>Games are saved on this device. Clearing website data will remove them.</p></dialog><dialog id="stats-dialog" aria-labelledby="stats-title"><div class="dialog-top"><h2 id="stats-title">Your little stats</h2><button class="icon-button" id="close-stats" aria-label="Close stats">×</button></div><div id="stats-body"></div></dialog><dialog id="new-dialog"><h2>A fresh start?</h2><p id="new-text"></p><div class="dialog-actions"><button id="restart-puzzle">Start this puzzle over</button><button id="cancel-new">Keep playing</button><button class="primary" id="confirm-new">New puzzle</button></div></dialog><dialog id="note-dialog" aria-labelledby="note-title"><h2 id="note-title"></h2><p id="note-text" class="note-text"></p><div class="dialog-actions single"><button class="primary" id="note-keep">Keep it ♡</button></div></dialog><dialog id="install-dialog" aria-labelledby="install-title"><div class="dialog-top"><h2 id="install-title">Add to Home Screen</h2><button class="icon-button" id="close-install" aria-label="Close">×</button></div><p id="install-warning" class="install-warning" hidden>It looks like you're not in Safari. On iPhone, only Safari can add apps to the Home Screen, so open this page in Safari first.</p><ol class="install-steps"><li><span class="step-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M7 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg></span><div><strong>Tap the Share button</strong> at the bottom of Safari: the square with an arrow pointing up. If you can't see it, tap the <strong>···</strong> button first.</div></li><li><span class="step-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/></svg></span><div><strong>Scroll down and tap "Add to Home Screen".</strong> If you don't see it, tap "View More" first.</div></li><li><span class="step-icon num">3</span><div><strong>Tap "Add"</strong> in the top corner. If you see "Open as Web App", leave it on.</div></li><li><span class="step-icon num">4</span><div><strong>Open SansDoku from your Home Screen</strong> from now on. It opens full screen and works offline ♡</div></li></ol><p class="install-note">The Home Screen app is a fresh start on this phone, so sign in again there (⚙ → Sign in) and your record comes right back. A puzzle you're halfway through in Safari won't move over, so finish it first.</p><div class="dialog-actions single"><button class="primary" id="install-done">Got it ♡</button></div></dialog>`;
app.insertAdjacentHTML(
  "beforeend",
  `<dialog id="nickname-dialog"><h2>Your little name</h2><p>What should we call you?</p><form id="nickname-form"><label for="nickname-input">Nickname</label><input id="nickname-input" name="nickname" maxlength="24" autocomplete="nickname" placeholder="Your nickname"><p class="form-error" id="nickname-error" role="alert" hidden>That name is reserved ♡ Try another.</p><p class="metrics-notice">Your nickname, play time, and online playing status are visible only to the app owner. You can play as Guest instead.</p><div class="dialog-actions"><button type="button" id="nickname-guest">Play as Guest</button><button class="primary" type="submit">Let’s play</button></div></form></dialog><dialog id="signin-dialog"><h2>Sign in</h2><p>Optional. Signing in unlocks special things and keeps your stats together on every device.</p><form id="signin-form"><label for="signin-user">Username</label><input id="signin-user" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="40" required><label for="signin-pass">Password</label><input id="signin-pass" name="password" type="password" autocomplete="current-password" maxlength="100" required><p class="form-error" id="signin-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" id="signin-cancel">Not now</button><button class="primary" type="submit" id="signin-submit">Sign in</button></div></form></dialog>`,
);
const nicknameDialog =
  document.querySelector<HTMLDialogElement>("#nickname-dialog")!;
const nicknameInput =
  document.querySelector<HTMLInputElement>("#nickname-input")!;
function updateProfile() {
  if (!canUseSans() && getTheme() === "sans") setTheme("system");
  document.querySelector<HTMLButtonElement>(
    '[data-theme-choice="sans"]',
  )!.hidden = !canUseSans();
  const account = Boolean(getProfile().account);
  document.querySelector("#player-label")!.textContent = account
    ? getProfile().account === "admin"
      ? "admin (test account)"
      : "sans ♡"
    : getProfile().nickname || "Guest";
  document.querySelector<HTMLElement>("#edit-nickname")!.hidden = account;
  document.querySelector<HTMLElement>("#signin-open")!.hidden = account;
  document.querySelector<HTMLElement>("#signout")!.hidden = !account;
  document
    .querySelectorAll<HTMLButtonElement>("[data-theme-choice]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.themeChoice === getTheme()),
      ),
    );
  if (!canUseSans()) clearCelebration();
  if (!busy) render();
  else renderAppearance();
}
document.querySelector("#nickname-form")!.addEventListener("submit", (e) => {
  e.preventDefault();
  const reserved = reservedName(nicknameInput.value);
  document.querySelector<HTMLElement>("#nickname-error")!.hidden = !reserved;
  if (!setNickname(nicknameInput.value)) return;
  nicknameDialog.close();
  updateProfile();
  touchMetrics(game);
});
document.querySelector<HTMLButtonElement>("#nickname-guest")!.onclick = () => {
  setNickname("");
  nicknameDialog.close();
  updateProfile();
  touchMetrics(game);
};
const signinDialog =
  document.querySelector<HTMLDialogElement>("#signin-dialog")!;
const signinError = document.querySelector<HTMLElement>("#signin-error")!;
document.querySelector<HTMLButtonElement>("#signin-open")!.onclick = () => {
  settings.close();
  signinError.hidden = true;
  signinDialog.showModal();
};
document.querySelector<HTMLButtonElement>("#signin-cancel")!.onclick = () =>
  signinDialog.close();
document.querySelector("#signin-form")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submit = document.querySelector<HTMLButtonElement>("#signin-submit")!;
  const user = document.querySelector<HTMLInputElement>("#signin-user")!;
  const pass = document.querySelector<HTMLInputElement>("#signin-pass")!;
  submit.disabled = true;
  signinError.hidden = true;
  const result = await signIn(user.value, pass.value);
  submit.disabled = false;
  if (!result.ok) {
    signinError.textContent = result.message;
    signinError.hidden = false;
    return;
  }
  pass.value = "";
  startAccount(result.playerId, result.username);
  void syncFinishes();
  void refreshNotes();
  setTheme("sans");
  signinDialog.close();
  updateProfile();
  touchMetrics(game);
  setMessage(result.username === "admin" ? "Signed in as the test account. Sans mode is on." : "Welcome, sans ♡ Sans mode is on.");
});
document.querySelector<HTMLButtonElement>("#signout")!.onclick = async () => {
  await signOut();
  endAccount();
  updateProfile();
  touchMetrics(game);
};
void checkSession().then((state) => {
  // Only an explicit "signed out" answer revokes; being offline never does.
  if (state === "out" && getProfile().account) {
    endAccount();
    updateProfile();
  } else if (state === "in" && getProfile().account) {
    void syncFinishes();
    void checkNotes();
  }
});
document.querySelector<HTMLButtonElement>("#edit-nickname")!.onclick = () => {
  settings.close();
  nicknameInput.value = getProfile().nickname;
  nicknameDialog.showModal();
};
const board = document.querySelector<HTMLDivElement>("#board")!;
for (let i = 0; i < 81; i++) {
  const b = document.createElement("button");
  b.className = "cell";
  b.dataset.index = String(i);
  b.addEventListener("click", () => {
    if (busy) return;
    touchMetrics(game);
    if (armed && !game.givens[i]) {
      selected = i;
      apply(i, game.values[i] === armed && !noteMode ? 0 : armed);
      return;
    }
    selected = selected === i && !armed ? -1 : i;
    render();
  });
  board.append(b);
}
function persist() {
  game.playMs = (game.playMs || 0) + clock.touch(Date.now());
  const ok = save(game);
  document.querySelector("#saved")!.textContent = ok
    ? "✓ Saved on this device"
    : "Saving unavailable";
}
function renderAppearance() {
  const sans = getTheme() === "sans";
  document.querySelector(".brand-mark")!.textContent = sans ? "♡" : "▦";
  document.querySelector(".eyebrow")!.textContent = sans
    ? "♡ SANS MODE · YOUR LITTLE LOVE STORY ♡"
    : "A LITTLE MOMENT FOR YOU";
  document.querySelector("h1")!.textContent = sans
    ? "Enchanted, one square at a time."
    : "One square at a time.";
  const now = new Date();
  document.querySelector(".subtitle")!.textContent = sans
    ? greeting(now.getHours())
    : "No rush. Just you and a little possibility.";
  document.querySelector("#footer-message")!.textContent = sans
    ? `${togetherLine(now) || "Sweet Nothing."} · Just you and your little puzzle.`
    : "A little space to slow down.";
}
function render() {
  renderAppearance();
  const isComplete = completed(game.values),
    value = armed || (selected >= 0 ? game.values[selected] : 0),
    sol = solution(),
    showWrong = getPrefs().mistakes;
  board.querySelectorAll<HTMLButtonElement>(".cell").forEach((b, i) => {
    const row = Math.floor(i / 9),
      col = i % 9;
    const peer =
      selected >= 0 &&
      (row === Math.floor(selected / 9) ||
        col === selected % 9 ||
        (Math.floor(row / 3) === Math.floor(selected / 27) &&
          Math.floor(col / 3) === Math.floor((selected % 9) / 3)));
    b.className = [
      "cell",
      game.givens[i] ? "given" : "",
      peer ? "peer" : "",
      i === selected ? "selected" : "",
      value && game.values[i] === value ? "matching" : "",
      conflicts(game.values, i) ? "conflict" : "",
      showWrong && sol && game.values[i] && !game.givens[i] && sol[i] !== game.values[i]
        ? "wrong"
        : "",
      hintState?.index === i ? "hint" : "",
      col === 2 || col === 5 ? "box-right" : "",
      row === 2 || row === 5 ? "box-bottom" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const cellNotes = visibleNotes(game, i);
    b.innerHTML = game.values[i]
      ? String(game.values[i])
      : `<span class="candidates">${Array.from({ length: 9 }, (_, n) => `<span${value && n + 1 === value && cellNotes.includes(n + 1) ? ' class="hit"' : ""}>${cellNotes.includes(n + 1) ? n + 1 : ""}</span>`).join("")}</span>`;
    b.setAttribute(
      "aria-label",
      `Row ${row + 1}, column ${col + 1}, ${game.values[i] ? `${game.givens[i] ? "given " : ""}${game.values[i]}` : `empty${cellNotes.length ? ", candidates " + cellNotes.join(", ") : ""}`}`,
    );
    b.setAttribute("aria-pressed", String(selected === i));
  });
  document.querySelector("#progress")!.textContent = isComplete
    ? getTheme() === "sans"
      ? "Long Live this little win ♡"
      : "Beautifully done ♡"
    : `${game.values.filter(Boolean).length} / 81 filled`;
  document.querySelector("#message")!.textContent = isComplete
    ? getTheme() === "sans"
      ? "Today Was a Fairytale — you solved it, sweetheart! ♡"
      : "You did it. A little win, just for you."
    : armed
      ? `Number-first · tap squares to place ${armed} · tap ${armed} again to stop.`
      : game.autoCandidates
      ? noteMode
        ? "Tap a number to edit the filled candidates by hand."
        : "Automatic candidates on · tap Auto to turn off."
      : noteMode
        ? getTheme() === "sans"
          ? "Blank Space ♡ Pencil mode · tap a number to leave a note."
          : "Pencil mode · tap a number to leave a note."
        : getTheme() === "sans"
          ? game.values.some((_, i) => conflicts(game.values, i))
            ? "Shake It Off ♡ Check the highlighted numbers and try again."
            : game.values.filter(Boolean).length >= 60
              ? "Daylight ♡ The finish is getting closer, one square at a time."
              : "Begin Again ♡ Pick a square. Your little Love Story starts here."
          : "Pick a square · or tap a number first.";
  if (!isComplete) finishNote = "";
  else if (finishNote)
    document.querySelector("#message")!.textContent += ` ${finishNote}`;
  (document.querySelector("#undo") as HTMLButtonElement).disabled =
    !game.history.length;
  const notesButton = document.querySelector<HTMLButtonElement>("#notes")!;
  notesButton.setAttribute("aria-pressed", String(noteMode));
  const autoButton = document.querySelector<HTMLButtonElement>("#auto")!;
  autoButton.setAttribute("aria-pressed", String(Boolean(game.autoCandidates)));
  document.querySelector<HTMLButtonElement>("#hint")!.disabled = isComplete;
  document
    .querySelectorAll<HTMLButtonElement>("[data-number]")
    .forEach((b) => {
      const n = Number(b.dataset.number);
      const placed = game.values.filter((v) => v === n).length;
      const left = Math.max(0, 9 - placed);
      const done =
        placed === 9 && !game.values.some((v, i) => v === n && conflicts(game.values, i));
      b.classList.toggle("done", done);
      b.setAttribute("aria-pressed", String(armed === n));
      b.setAttribute(
        "aria-label",
        done ? `${n}, all placed` : `Enter ${n}, ${left} left`,
      );
      b.querySelector(".left")!.textContent = done || !left ? "" : String(left);
    });
  document
    .querySelector("#pref-mistakes")!
    .setAttribute("aria-pressed", String(getPrefs().mistakes));
  document
    .querySelector("#pref-timer")!
    .setAttribute("aria-pressed", String(getPrefs().timer));
  document
    .querySelector("#pref-advance")!
    .setAttribute("aria-pressed", String(getPrefs().advance));
  document
    .querySelector("#pref-sound")!
    .setAttribute("aria-pressed", String(getPrefs().sound));
  updateClock();
  document
    .querySelectorAll<HTMLButtonElement>("[data-difficulty]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.difficulty === difficulty),
      ),
    );
}
function change(n: number) {
  if (selected >= 0) apply(selected, n);
}
function apply(i: number, n: number) {
  if (busy) return;
  const wasComplete = completed(game.values);
  if (!enter(game, i, n, noteMode)) return;
  hintState = null;
  if (getPrefs().advance && !armed && !noteMode && n) {
    for (let k = 1; k < 81; k++) {
      const next = (i + k) % 81;
      if (!game.values[next]) {
        selected = next;
        break;
      }
    }
  }
  touchMetrics(game, true);
  persist();
  render();
  if (!wasComplete && completed(game.values)) return finish();
  if (noteMode || !n || !getPrefs().mistakes) return;
  const sol = solution();
  if (conflicts(game.values, i) || (sol && sol[i] !== n))
    setMessage(
      sansTheme()
        ? "Not quite, love ♡ That one doesn't fit. Try another."
        : "Hmm, that one doesn't fit here. Try another ♡",
    );
}
function finish() {
  flushPlay();
  let note = "";
  if (!game.counted) {
    game.counted = true;
    const acct = signedIn();
    const entry: Finish = {
      id: crypto.randomUUID(),
      difficulty: game.difficulty,
      at: Date.now(),
      ms: Math.round(game.playMs || 0),
      hints: game.hints || 0,
      acct,
    };
    const newBest = isNewBest(scope(history, acct), entry);
    const unlockedBefore = unlockedKeys(scope(history, acct)).length;
    history = addFinish(history, entry);
    saveHistory(history);
    const s = summarize(scope(history, acct));
    note = `Finished in ${formatTime(entry.ms)}${newBest ? " — your best yet ♡" : "."} ${puzzles(s.total)} finished${s.currentStreak > 1 ? ` · ${s.currentStreak} days in a row ♡` : "."}`;
    if (acct && unlockedKeys(scope(history, acct)).length > unlockedBefore)
      note += " A new little note is waiting in your stats ♡";
    if (acct) void syncFinishes();
  }
  finishNote = note;
  persist();
  render();
  if (getPrefs().sound) chime();
  if (sansTheme()) celebrate(note);
}
// Keeps her record in step with the account: pull what other phones finished, push ours.
let syncing = false;
async function syncFinishes() {
  if (!signedIn() || syncing || !navigator.onLine) return;
  syncing = true;
  try {
    const remote = await pullFinishes();
    if (!remote) return;
    history = mergeRemote(history, remote);
    for (;;) {
      const batch = history.filter((f) => f.acct && !f.synced).slice(0, 100);
      if (!batch.length || !(await pushFinishes(batch))) break;
      const sent = new Set(batch.map((f) => f.id));
      history = history.map((f) => (sent.has(f.id) ? { ...f, synced: true } : f));
    }
    saveHistory(history);
    if (statsDialog.open) renderStatsDialog();
    document.querySelector("#record-text")!.textContent = recordText();
  } finally {
    syncing = false;
  }
}
function revealOrHint() {
  if (busy || completed(game.values)) return;
  if (hintState && hintState.digit && hintState.index >= 0) {
    const { index, digit } = hintState;
    const wasComplete = completed(game.values);
    if (game.values[index] !== digit) {
      const was = noteMode;
      noteMode = false;
      const ok = enter(game, index, digit);
      noteMode = was;
      if (ok) {
        game.hints = (game.hints || 0) + 1;
        hintState = null;
        selected = index;
        touchMetrics(game, true);
        persist();
        render();
        if (!wasComplete && completed(game.values)) return finish();
        setMessage("There you go · a little nudge ♡");
        return;
      }
    }
  }
  const hint = findHint(game, solution());
  hintState = hint;
  if (!hint) {
    render();
    setMessage("I can't see an easy next step. Maybe re-check a number? ♡");
    return;
  }
  selected = hint.index;
  armed = 0;
  persist();
  render();
  const r = Math.floor(hint.index / 9) + 1,
    c = (hint.index % 9) + 1;
  const more = hint.digit ? " Tap Hint again to reveal it." : "";
  setMessage(
    hint.kind === "wrong"
      ? `Something in row ${r}, column ${c} doesn't fit. Take another look ♡${more}`
      : hint.kind === "single"
        ? `Look at row ${r}, column ${c} — only one number fits there ♡${more}`
        : hint.kind === "hidden"
          ? `A number has just one spot left in this ${hint.unit}. Look at row ${r}, column ${c} ♡${more}`
          : `Try row ${r}, column ${c} — it has the fewest options ♡${more}`,
  );
}
function autoNotes() {
  if (busy) return;
  if (!toggleAutoCandidates(game)) return;
  touchMetrics(game, true);
  persist();
  render();
  document.querySelector("#message")!.textContent = game.autoCandidates
    ? "Automatic candidates on. A little helping hand."
    : "Automatic candidates off. Back to your manual notes.";
}
document
  .querySelectorAll<HTMLButtonElement>("[data-number]")
  .forEach((b) => (b.onclick = () => padPress(Number(b.dataset.number))));
// A number with nothing selected is "armed": tap squares to place it in each.
function padPress(n: number) {
  if (busy) return;
  if (armed) armed = armed === n ? 0 : n;
  else if (selected < 0) armed = n;
  else return change(n);
  render();
}
document.querySelector<HTMLButtonElement>("#auto")!.onclick = autoNotes;
document.querySelector<HTMLButtonElement>("#hint")!.onclick = revealOrHint;
const prefButton = (id: string, name: "mistakes" | "timer" | "advance" | "sound") =>
  (document.querySelector<HTMLButtonElement>(id)!.onclick = () => {
    setPref(name, !getPrefs()[name]);
    render();
  });
prefButton("#pref-mistakes", "mistakes");
prefButton("#pref-timer", "timer");
prefButton("#pref-advance", "advance");
prefButton("#pref-sound", "sound");
function recordText() {
  const s = summarize(myFinishes());
  const best = difficulties
    .filter((d) => s.byDifficulty[d].bestMs)
    .map((d) => `${d} ${formatTime(s.byDifficulty[d].bestMs!)}`);
  return s.total
    ? `${puzzles(s.total)} finished${s.currentStreak > 1 ? ` · ${s.currentStreak} days in a row ♡` : ""}${best.length ? ` · best: ${best.join(", ")}` : ""}`
    : "Finish a puzzle to start your record ♡";
}
const statsDialog = document.querySelector<HTMLDialogElement>("#stats-dialog")!;
function renderStatsDialog() {
  const body = statsDialog.querySelector<HTMLElement>("#stats-body")!;
  body.innerHTML = renderStats(myFinishes(), statsFilter, signedIn());
  if (signedIn()) {
    const together = togetherLine(new Date());
    if (together) {
      const p = document.createElement("p");
      p.className = "together";
      p.textContent = together;
      body.prepend(p);
    }
    renderNotesSection(body);
  }
  body.querySelectorAll<HTMLElement>("[data-readout]").forEach((el) => {
    const show = () => {
      const target = el.closest("svg")!.parentElement!.querySelector("[data-readout-target]");
      if (target) target.textContent = el.dataset.readout || "";
    };
    el.addEventListener("click", show);
    el.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ") {
        e.preventDefault();
        show();
      }
    });
  });
  body.querySelectorAll<HTMLButtonElement>("[data-stats-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        statsFilter = b.dataset.statsFilter as StatsFilter;
        renderStatsDialog();
      }),
  );
}
function renderNotesSection(body: HTMLElement) {
  const items = inbox(inboxData, myFinishes());
  const seen = loadSeen();
  const heading = document.createElement("h3");
  heading.textContent = "Little notes";
  const list = document.createElement("div");
  list.className = "notes-list";
  for (const item of items) {
    const card = document.createElement("article");
    const fresh = !seen.includes(item.id);
    card.className = "note-card" + (fresh ? " fresh" : "");
    const title = document.createElement("strong");
    title.textContent = item.title + (fresh ? " · new ♡" : "");
    const text = document.createElement("p");
    text.className = "note-text";
    text.textContent = item.text;
    card.append(title, text);
    list.append(card);
  }
  for (const hint of nextLocked(myFinishes())) {
    const locked = document.createElement("p");
    locked.className = "note-locked";
    locked.textContent = `A note is waiting · ${hint}`;
    list.append(locked);
  }
  body.append(heading, list);
}
function openStats() {
  settings.close();
  statsFilter = "all";
  renderStatsDialog();
  statsDialog.showModal();
  void syncFinishes();
  void refreshNotes().then(() => statsDialog.open && renderStatsDialog());
}
document.querySelector<HTMLButtonElement>("#stats-open")!.onclick = openStats;
document.querySelector<HTMLButtonElement>("#stats-open-settings")!.onclick = openStats;
document.querySelector<HTMLButtonElement>("#close-stats")!.onclick = () => statsDialog.close();
statsDialog.addEventListener("close", () =>
  markSeen(inbox(inboxData, myFinishes()).map((i) => i.id)),
);
document.querySelectorAll<HTMLButtonElement>("[data-difficulty]").forEach(
  (b) =>
    (b.onclick = () => {
      clearCelebration();
      pauseMetrics();
      difficulty = b.dataset.difficulty as Difficulty;
      const saved = load(difficulty);
      adopt(saved || createGame(difficulty));
      selected = -1;
      persist();
      render();
      if (!saved) void startFresh();
      else void replenish(difficulty);
    }),
);
document.querySelector<HTMLButtonElement>("#undo")!.onclick = () => {
  clearCelebration();
  hintState = null;
  undo(game);
  touchMetrics(game);
  persist();
  render();
};
document.querySelector<HTMLButtonElement>("#erase")!.onclick = () => {
  if (selected >= 0 && enter(game, selected, 0)) {
    hintState = null;
    touchMetrics(game, true);
    persist();
    render();
  }
};
const notes = document.querySelector<HTMLButtonElement>("#notes")!;
notes.onclick = () => {
  noteMode = !noteMode;
  render();
};
const settings = document.querySelector<HTMLDialogElement>("#settings-dialog")!;
document.querySelector<HTMLButtonElement>("#settings")!.onclick = () => {
  document.querySelector("#record-text")!.textContent = recordText();
  document.querySelector("#offline-detail")!.textContent = ready
    ? "Ready for offline play."
    : "Offline files are still being prepared. Keep this page open while online.";
  settings.showModal();
};
document.querySelector<HTMLButtonElement>("#close-settings")!.onclick = () =>
  settings.close();
const newDialog = document.querySelector<HTMLDialogElement>("#new-dialog")!;
document.querySelector<HTMLButtonElement>("#new-game")!.onclick = () => {
  newDialog.querySelector("p")!.textContent =
    `"Start this puzzle over" keeps this puzzle and clears your numbers (you can still undo). "New puzzle" replaces your saved ${difficulty} puzzle; your other difficulties stay saved.`;
  newDialog.showModal();
};
document.querySelector<HTMLButtonElement>("#cancel-new")!.onclick = () =>
  newDialog.close();
document.querySelector<HTMLButtonElement>("#confirm-new")!.onclick = () => {
  newDialog.close();
  void startFresh();
};
document.querySelector<HTMLButtonElement>("#restart-puzzle")!.onclick = () => {
  newDialog.close();
  if (busy) return;
  clearCelebration();
  restartPuzzle(game);
  hintState = null;
  armed = 0;
  selected = -1;
  finishNote = "";
  touchMetrics(game);
  persist();
  render();
  setMessage("A fresh start, same puzzle ♡");
};
// --- Add to Home Screen guide (iPhone/iPad Safari only, until she installs it) ---
const installDialog = document.querySelector<HTMLDialogElement>("#install-dialog")!;
const installTip = document.querySelector<HTMLElement>("#install-tip")!;
const tipKey = "sansdoku:install-tip:v1";
const ua = navigator.userAgent;
const onIos =
  /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const installed =
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;
const dismissedTip = () => {
  try {
    return localStorage.getItem(tipKey) === "1";
  } catch {
    return false;
  }
};
const dismissTip = () => {
  installTip.hidden = true;
  try {
    localStorage.setItem(tipKey, "1");
  } catch {}
};
installTip.hidden = !(onIos && !installed && !dismissedTip());
function openInstallGuide() {
  settings.close();
  document.querySelector<HTMLElement>("#install-warning")!.hidden =
    !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\//.test(ua);
  installDialog.showModal();
}
document.querySelector<HTMLButtonElement>("#install-how")!.onclick = openInstallGuide;
document.querySelector<HTMLButtonElement>("#install-open")!.onclick = openInstallGuide;
document.querySelector<HTMLButtonElement>("#install-dismiss")!.onclick = dismissTip;
document.querySelector<HTMLButtonElement>("#close-install")!.onclick = () => installDialog.close();
document.querySelector<HTMLButtonElement>("#install-done")!.onclick = () => {
  installDialog.close();
  dismissTip();
};
// --- Notes from you ---
const noteDialog = document.querySelector<HTMLDialogElement>("#note-dialog")!;
let shownNoteId = "";
async function refreshNotes() {
  if (!signedIn() || !navigator.onLine) return;
  const fresh = await fetchNotes();
  if (fresh) inboxData = fresh;
}
function showNextNote() {
  if (!signedIn() || document.querySelector("dialog[open], .celebration")) return;
  const items = unseenItems(inbox(inboxData, myFinishes()));
  const item = items.find((i) => i.id.startsWith("m:")) || items[0];
  if (!item) return;
  shownNoteId = item.id;
  document.querySelector("#note-title")!.textContent = item.title;
  document.querySelector("#note-text")!.textContent = item.text;
  noteDialog.showModal();
}
document.querySelector<HTMLButtonElement>("#note-keep")!.onclick = () => {
  markSeen([shownNoteId]);
  noteDialog.close();
};
async function checkNotes() {
  await refreshNotes();
  showNextNote();
}
document.addEventListener("pointerdown", unlockAudio, { once: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  renderAppearance();
  void checkNotes();
});
async function startFresh() {
  if (busy) return;
  clearCelebration();
  pauseMetrics();
  busy = true;
  document
    .querySelectorAll<HTMLButtonElement>(
      ".cell, .tools button, [data-number], [data-difficulty], #new-game",
    )
    .forEach((b) => (b.disabled = true));
  document.querySelector("#message")!.textContent = navigator.onLine
    ? "Finding your next little challenge…"
    : "Picking an offline puzzle…";
  const result = await newPuzzle(difficulty);
  adopt(result.game);
  selected = -1;
  noteMode = false;
  busy = false;
  document
    .querySelectorAll<HTMLButtonElement>(
      ".cell, .tools button, [data-number], [data-difficulty], #new-game",
    )
    .forEach((b) => (b.disabled = false));
  persist();
  render();
  document.querySelector("#message")!.textContent =
    result.source === "fresh"
      ? getTheme() === "sans"
        ? "Everything Has Changed ♡ A fresh puzzle, just for you."
        : "A fresh puzzle, just for you."
      : result.source === "reserve"
        ? "From your saved offline puzzles."
        : "An offline puzzle, ready when you are.";
}
document.querySelectorAll<HTMLButtonElement>("[data-theme-choice]").forEach(
  (b) =>
    (b.onclick = () => {
      setTheme(b.dataset.themeChoice as Theme);
      if (getTheme() !== "sans") clearCelebration();
      if (!busy) render();
      else renderAppearance();
      document
        .querySelectorAll("[data-theme-choice]")
        .forEach((option) =>
          option.setAttribute(
            "aria-pressed",
            String((option as HTMLElement).dataset.themeChoice === getTheme()),
          ),
        );
    }),
);
document.addEventListener("keydown", (e) => {
  // Never steal keys while she is typing or any dialog (sign in, nickname, stats…) is open.
  const target = e.target as HTMLElement | null;
  if (
    busy ||
    document.querySelector("dialog[open]") ||
    target?.closest("input, textarea, select, [contenteditable]") ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey
  )
    return;
  if (e.key === "Escape" && armed) {
    armed = 0;
    render();
    return;
  }
  let movement = 0;
  if (e.key === "ArrowRight") movement = 1;
  if (e.key === "ArrowLeft") movement = -1;
  if (e.key === "ArrowDown") movement = 9;
  if (e.key === "ArrowUp") movement = -9;
  if (movement) {
    e.preventDefault();
    selected = Math.max(
      0,
      Math.min(80, selected < 0 ? 0 : selected + movement),
    );
    touchMetrics(game);
    render();
    board.children[selected].scrollIntoView({ block: "nearest" });
  } else if (/^[1-9]$/.test(e.key)) change(Number(e.key));
  else if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();
    document.querySelector<HTMLButtonElement>("#erase")!.click();
  } else if (e.key.toLowerCase() === "n") {
    noteMode = !noteMode;
    render();
  }
});
function offlineStatus() {
  document.querySelector("#offline-status")!.textContent = ready
    ? navigator.onLine
      ? "Ready for offline play"
      : "Offline · enjoy your little moment"
    : "Preparing offline play…";
}
const updateSW = registerSW({
  onOfflineReady() {
    ready = true;
    offlineStatus();
  },
  onNeedRefresh() {
    updateReady = true;
    (document.querySelector("#update") as HTMLButtonElement).hidden = false;
  },
  onRegisteredSW(_url, registration) {
    if (registration?.active && navigator.serviceWorker.controller) {
      ready = true;
      offlineStatus();
    }
  },
  onRegisterError() {
    document.querySelector("#offline-status")!.textContent =
      "Offline setup unavailable · try reloading online";
  },
});
document.querySelector<HTMLButtonElement>("#update")!.onclick = () => {
  if (updateReady) {
    persist();
    void updateSW(true);
  }
};
window.addEventListener("online", () => {
  offlineStatus();
  void syncFinishes();
  void replenish(difficulty);
});
window.addEventListener("offline", offlineStatus);
persist();
updateProfile();
offlineStatus();
if (!getProfile().chosen) nicknameDialog.showModal();

if (!initialSaved) void startFresh();
else void replenish(difficulty);
