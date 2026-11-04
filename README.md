# SansDoku ♡

A calm, mobile-first Sudoku app made with love. It installs to the iPhone Home Screen, works offline, and has a pink **Sans mode** with notes, milestones and a little garden for one very special player.

Vite, TypeScript, plain CSS, `vite-plugin-pwa`. No runtime UI framework. A small Cloudflare Worker serves the app, proxies puzzle requests and stores the little bit of server data (stats, notes, admin).

> Design rule: the puzzle itself stays calm and uncluttered. Everything extra (notes, popups, stats, greetings) lives at the edges: when she opens the app, finishes a puzzle, or looks at her stats. Never mid-puzzle, never as pressure.

## Key features

### Playing
- Easy, medium and hard puzzles, one saved game per difficulty; fresh puzzles from an API with an offline reserve and a bundled fallback bank.
- Pencil notes, undo, erase, conflict highlighting and a **Start this puzzle over** (undoable).
- **Auto candidates** (the Auto button): candidates fill in and follow the board. Editing a note while Auto is on keeps the auto-filled candidates so they can be adjusted by hand.
- **Number-first input**: tap a number with nothing selected, then tap squares to place it.
- The number pad counts what is left and greys out finished digits; selecting a number highlights it on the board and inside pencil notes.
- Keyboard support: arrows, `1`–`9`, `N` for notes, Backspace/Delete to erase, Escape to stop number-first.

### Help when stuck, without spoiling the calm
- **Hints** that speak like a person: first tap says where to look ("Look at row 4, column 7 ♡"), second tap reveals the number.
- **Gentle mistake alerts**: a wrong number is tinted, shakes softly and gets a kind message. The solution is derived on the device from the unique puzzle and never stored.
- Settings → Helpers: mistake alerts, an optional timer, auto-advance to the next empty square, and a soft finish chime. Each can be turned off.

### Her record
- **Stats page** (chart icon): puzzles finished, streaks, time played, a "you're getting faster ♡" line, solve-time charts, puzzles per week, bests and averages, and recent puzzles. An **All / Easy / Medium / Hard** filter narrows the whole page.
- **Garden**: one flower per finished puzzle: a daisy for easy, a tulip for medium, a rose for hard. Tap a flower for its date and time.
- After each puzzle: the time, "your best yet ♡" for hint-free personal bests, the puzzle count and the streak.

### For her: Sans mode
- Optional sign-in as the shared `sans` account unlocks the blush-pink theme with hearts, song-title-style messages and a heart celebration when she finishes a puzzle.
- Her record syncs to the account, so it follows her to any phone.
- A greeting that changes with the time of day, and a **days together** line counting from 22 Nov 2025 (with anniversary wording on the 22nd).
- **Notes from you**: written in the admin page, shown as a popup once the next time she opens the app, then kept under Stats → **Notes**.
- **Milestones**: the first puzzle, 10, 50, 100, a 7-day streak, the first hard puzzle, plus any the owner adds. They pop up when unlocked and live in the Notes tab, with gentle "coming up" teasers.

### Offline and install
- Works offline after the first load (service worker); updates are prompted and progress is saved before reload.
- A guided **Add to Home Screen** card on iPhone/iPad Safari until the app is installed.
- Light, dark and system appearance.

### For the owner
- A private admin dashboard (`/admin`): totals, live players, per-player stats and daily/weekly/monthly play time.
- A **Notes & milestones** tab: send her a note (with a live preview), reword the built-in milestones, and add your own by puzzles finished, level, streak, days played, no-hint puzzles, a fast finish, or a special date.
- An `admin` test sign-in with its own stats, so testing never touches her record.

### Privacy
No email addresses, raw IPs, full boards or move histories are stored. Guests are anonymous device IDs with an optional nickname. See [docs/metrics.md](docs/metrics.md).

## Quick start

Requires Node.js 22.13+ (the local preview uses the built-in SQLite).

```sh
npm install
npm test                 # unit and API tests
npm run build            # type check, bundle, build the Worker
npm run preview          # the built Worker with a local SQLite database
```

Open http://127.0.0.1:4173 (and `/admin`; the local preview skips the admin password on localhost only). For hot reload, build once, then run `npm run dev:api` in one terminal and `npm run dev` in another.

The dev server does not register the service worker. Test offline support against `npm run preview` or a deployed HTTPS URL: let "Ready for offline play" appear, then reload offline.

## Configuration

Copy `.env.example` to `.env.local` for local runs. In production use `npx wrangler secret put <NAME>`.

| Name | Where | Purpose |
| --- | --- | --- |
| `YOUDOSUDOKU_API_KEY` | secret | Puzzle API key; the browser never sees it. Never use a `VITE_` prefix. |
| `ADMIN_PASSWORD` | secret | Password for `/admin` (12+ characters). |
| `ADMIN_EMAIL` | var in `wrangler.jsonc` | The only email allowed into `/admin`. |
| `SANS_PASSWORD` | secret | Password for the `sans` account (6+ characters). |
| `TESTER_PASSWORD` | secret, optional | Password for the owner's `admin` test account. |

## Deploy

```sh
npm test && npm run build
npx wrangler login                                            # first time only
npx wrangler d1 migrations apply sansdoku-metrics --remote    # whenever migrations/ changed
npx wrangler secret put SANS_PASSWORD                         # first time or to change it
npx wrangler deploy
```

After a deploy her phone shows "Update available" in the footer; she taps it once. The Home Screen app and Safari keep separate storage, so a newly installed Home Screen app starts fresh until she signs in again.

## Project layout

| Path | What it is |
| --- | --- |
| `src/main.ts` | The whole player UI: board, tools, dialogs, sync, popups |
| `src/game.ts` | Pure Sudoku logic: candidates, entering, undo, hints, solver |
| `src/stats.ts`, `src/stats-view.ts` | History model, streaks/bests, and the stats page markup |
| `src/milestones.ts`, `src/notes.ts` | Milestone rule engine; the inbox of notes and unlocks |
| `src/account.ts`, `src/profile.ts` | Sign-in client and the device profile |
| `src/admin.ts`, `src/admin-notes.ts` | The admin dashboard and the notes/milestones editor |
| `worker/*.mjs` | Cloudflare Worker: routing, puzzles, accounts, stats, notes, metrics, admin |
| `migrations/` | D1 schema, applied in order |
| `tests/` | `node:test` suites run through `tsx` |
| `docs/metrics.md` | Operations guide for metrics, accounts and admin |
| `AGENTS.md` | Architecture, conventions and gotchas for contributors and agents |

## Puzzle source

The bundled bank holds 30 [YouDoSudoku](https://you-do-sudoku-api.vercel.app/) puzzles (10 per difficulty), validated for a unique solution. Number permutations and transposes add variety. Live puzzles come from `/api/puzzle?difficulty=easy|medium|hard`, which adds the API key on the server; a reserve of up to 3 per difficulty is kept on the device for offline play. `npm run puzzles:import` refreshes the bundled bank. API Ninjas is not used because its free-plan terms forbid sharing its output.

## Testing

`npm test` covers Sudoku rules, hints and the solver, stats and streak maths, the milestone rule engine, greetings and dates, and the Worker's auth, sync, notes and metrics endpoints. Browser checks (Playwright at iPhone sizes) cover layout, themes, gameplay, sign-in, stats and popups. Real-iPhone testing is still the final check for Safari installation, touch and sound.
