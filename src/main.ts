import "./style.css";
import { registerSW } from "virtual:pwa-register";
import {
  createGame,
  completed,
  conflicts,
  enter,
  undo,
  toggleAutoCandidates,
  visibleNotes,
  type Difficulty,
} from "./game";
import { load, save } from "./storage";
import { newPuzzle, replenish } from "./puzzle-source";
import { getTheme, setTheme, type Theme } from "./theme";
const app = document.querySelector<HTMLDivElement>("#app")!;
const initialSaved = load("easy");
let busy = false;
let difficulty: Difficulty = "easy",
  game = initialSaved || createGame(difficulty),
  selected = -1,
  noteMode = false,
  ready = false;
let timer: ReturnType<typeof setTimeout> | undefined,
  longPressed = false,
  updateReady = false;
const icon = (name: string) =>
  ({ undo: "↶", erase: "⌫", notes: "✎", settings: "⚙", new: "＋" })[name] || "";
app.innerHTML = `<main class="shell"><header><a class="brand" href="/" aria-label="SansDoku home"><span class="brand-mark">▦</span> SansDoku<span class="brand-dot">.</span></a><button class="icon-button" id="settings" aria-label="Open settings">${icon("settings")}</button></header><section class="intro"><p class="eyebrow">A LITTLE MOMENT FOR YOU</p><h1>One square at a time.</h1><p class="subtitle">No rush. Just you and a little possibility.</p></section><nav class="difficulties" aria-label="Difficulty">${(["easy", "medium", "hard"] as Difficulty[]).map((d) => `<button data-difficulty="${d}" aria-pressed="${d === difficulty}">${d[0].toUpperCase() + d.slice(1)}</button>`).join("")}</nav><section class="game-area" aria-label="Sudoku game"><div class="game-meta"><span id="progress"></span><span id="saved" class="saved"></span></div><div id="board" class="board" role="group" aria-label="Sudoku board"></div><p class="game-message" id="message" role="status" aria-live="polite">Pick a square. Make a little progress.</p><div class="tools"><button id="undo">${icon("undo")}<span>Undo</span></button><button id="erase">${icon("erase")}<span>Erase</span></button><button id="notes" aria-pressed="false">${icon("notes")}<span>Notes</span></button></div><div class="number-pad" aria-label="Number pad">${Array.from({ length: 9 }, (_, i) => `<button data-number="${i + 1}" aria-label="Enter ${i + 1}">${i + 1}</button>`).join("")}</div><button id="new-game" class="new-game">${icon("new")} New puzzle</button></section><footer><span class="small-heart">♡</span> A little space to slow down.<span id="offline-status"></span><button id="update" hidden>Update available</button></footer></main><dialog id="settings-dialog"><div class="dialog-top"><h2>Your little space</h2><button class="icon-button" id="close-settings" aria-label="Close settings">×</button></div><fieldset class="appearance"><legend>Appearance</legend><div class="theme-options">${["light", "dark", "system"].map((t) => `<button data-theme-choice="${t}" aria-pressed="${getTheme() === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div></fieldset><p>On iPhone, open in Safari, tap Share, then Add to Home Screen.</p><p id="offline-detail"></p><p>Games are saved on this device. Clearing website data will remove them.</p><details><summary>A little shortcut</summary><p>Long-press Notes to toggle automatic candidates. They update as you play. Turn them off to return to your manual notes. Writing a manual note also turns them off.</p><button class="primary" id="fill-candidates">Fill candidates</button></details></dialog><dialog id="new-dialog"><h2>A fresh start?</h2><p>This replaces your saved ${difficulty} puzzle. Your other difficulties stay saved.</p><div class="dialog-actions"><button id="cancel-new">Keep playing</button><button class="primary" id="confirm-new">New puzzle</button></div></dialog>`;
const board = document.querySelector<HTMLDivElement>("#board")!;
for (let i = 0; i < 81; i++) {
  const b = document.createElement("button");
  b.className = "cell";
  b.dataset.index = String(i);
  b.addEventListener("click", () => {
    selected = i;
    render();
  });
  board.append(b);
}
function persist() {
  const ok = save(game);
  document.querySelector("#saved")!.textContent = ok
    ? "✓ Saved on this device"
    : "Saving unavailable";
}
function render() {
  const isComplete = completed(game.values),
    value = selected >= 0 ? game.values[selected] : 0;
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
      col === 2 || col === 5 ? "box-right" : "",
      row === 2 || row === 5 ? "box-bottom" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const cellNotes = visibleNotes(game, i);
    b.innerHTML = game.values[i]
      ? String(game.values[i])
      : `<span class="candidates">${Array.from({ length: 9 }, (_, n) => `<span>${cellNotes.includes(n + 1) ? n + 1 : ""}</span>`).join("")}</span>`;
    b.setAttribute(
      "aria-label",
      `Row ${row + 1}, column ${col + 1}, ${game.values[i] ? `${game.givens[i] ? "given " : ""}${game.values[i]}` : `empty${cellNotes.length ? ", candidates " + cellNotes.join(", ") : ""}`}`,
    );
    b.setAttribute("aria-pressed", String(selected === i));
  });
  document.querySelector("#progress")!.textContent = isComplete
    ? "Beautifully done ♡"
    : `${game.values.filter(Boolean).length} / 81 filled`;
  document.querySelector("#message")!.textContent = isComplete
    ? "You did it. A little win, just for you."
    : game.autoCandidates
      ? noteMode
        ? "Writing a note switches to manual candidates."
        : "Automatic candidates on · long-press Notes to turn off."
      : noteMode
        ? "Pencil mode · tap a number to leave a note."
        : "Pick a square. Make a little progress.";
  (document.querySelector("#undo") as HTMLButtonElement).disabled =
    !game.history.length;
  const notesButton = document.querySelector<HTMLButtonElement>("#notes")!;
  notesButton.setAttribute("aria-pressed", String(noteMode));
  notesButton.dataset.autoCandidates = String(Boolean(game.autoCandidates));
  notesButton.querySelector("span")!.textContent = game.autoCandidates
    ? "Notes · Auto"
    : "Notes";
  document.querySelector("#fill-candidates")!.textContent = game.autoCandidates
    ? "Turn off automatic candidates"
    : "Turn on automatic candidates";
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
  if (busy) return;
  if (selected < 0) return;
  if (enter(game, selected, n, noteMode)) {
    persist();
    render();
  }
}
function autoNotes() {
  if (busy) return;
  if (!toggleAutoCandidates(game)) return;
  persist();
  render();
  document.querySelector("#message")!.textContent = game.autoCandidates
    ? "Automatic candidates on. A little helping hand."
    : "Automatic candidates off. Back to your manual notes.";
}
document
  .querySelectorAll<HTMLButtonElement>("[data-number]")
  .forEach((b) => (b.onclick = () => change(Number(b.dataset.number))));
document.querySelectorAll<HTMLButtonElement>("[data-difficulty]").forEach(
  (b) =>
    (b.onclick = () => {
      difficulty = b.dataset.difficulty as Difficulty;
      const saved = load(difficulty);
      game = saved || createGame(difficulty);
      selected = -1;
      persist();
      render();
      if (!saved) void startFresh();
      else void replenish(difficulty);
    }),
);
document.querySelector<HTMLButtonElement>("#undo")!.onclick = () => {
  undo(game);
  persist();
  render();
};
document.querySelector<HTMLButtonElement>("#erase")!.onclick = () => {
  if (selected >= 0 && enter(game, selected, 0)) {
    persist();
    render();
  }
};
const notes = document.querySelector<HTMLButtonElement>("#notes")!;
notes.onpointerdown = (e) => {
  if (e.button !== 0) return;
  longPressed = false;
  timer = setTimeout(() => {
    longPressed = true;
    autoNotes();
  }, 650);
};
function clearPress() {
  clearTimeout(timer);
  timer = undefined;
}
notes.onpointerup = clearPress;
notes.onpointerleave = clearPress;
notes.onpointercancel = () => {
  clearPress();
  longPressed = false;
};
notes.oncontextmenu = (e) => e.preventDefault();
notes.onclick = () => {
  if (longPressed) {
    longPressed = false;
    return;
  }
  noteMode = !noteMode;
  render();
};
const settings = document.querySelector<HTMLDialogElement>("#settings-dialog")!;
document.querySelector<HTMLButtonElement>("#settings")!.onclick = () => {
  document.querySelector("#offline-detail")!.textContent = ready
    ? "Ready for offline play."
    : "Offline files are still being prepared. Keep this page open while online.";
  settings.showModal();
};
document.querySelector<HTMLButtonElement>("#close-settings")!.onclick = () =>
  settings.close();
document.querySelector<HTMLButtonElement>("#fill-candidates")!.onclick = () => {
  autoNotes();
  settings.close();
};
const newDialog = document.querySelector<HTMLDialogElement>("#new-dialog")!;
document.querySelector<HTMLButtonElement>("#new-game")!.onclick = () => {
  newDialog.querySelector("p")!.textContent =
    `This replaces your saved ${difficulty} puzzle. Your other difficulties stay saved.`;
  newDialog.showModal();
};
document.querySelector<HTMLButtonElement>("#cancel-new")!.onclick = () =>
  newDialog.close();
document.querySelector<HTMLButtonElement>("#confirm-new")!.onclick = () => {
  newDialog.close();
  void startFresh();
};
async function startFresh() {
  if (busy) return;
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
  game = result.game;
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
      ? "A fresh puzzle, just for you."
      : result.source === "reserve"
        ? "From your saved offline puzzles."
        : "An offline puzzle, ready when you are.";
}
document.querySelectorAll<HTMLButtonElement>("[data-theme-choice]").forEach(
  (b) =>
    (b.onclick = () => {
      setTheme(b.dataset.themeChoice as Theme);
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
  if (
    busy ||
    settings.open ||
    newDialog.open ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey
  )
    return;
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
  void replenish(difficulty);
});
window.addEventListener("offline", offlineStatus);
persist();
render();
offlineStatus();

if (!initialSaved) void startFresh();
else void replenish(difficulty);
