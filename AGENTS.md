# AGENTS.md: SansDoku design notes for contributors and agents

SansDoku is a Sudoku PWA the owner built for their partner. Read the product rules first, then the architecture, then the gotchas. They are short and each one cost real time to learn.

## Product rules (these outrank any clever idea)

1. **The core puzzle experience must stay calm.** No pop-ups, animations, sounds or nags while she is solving. Extras live at the edges: app open, finishing a puzzle, the stats page, settings.
2. **No pressure.** No leaderboards, badges that can be lost, failure states, countdowns or guilt-streaks. Time and streaks are shown softly and the timer is off by default.
3. **Everything optional is switchable.** New helpers become a Settings → Helpers toggle in `src/prefs.ts` with a sensible default.
4. **Offline first.** Playing, stats, notes already fetched and Sans mode must work with no network. Network features degrade silently and retry later.
5. **Tone is warm and gentle.** Copy is short, kind and lowercase-friendly ("a little win ♡"). Sans mode may reference Taylor Swift song titles; do not copy lyrics.
6. **Privacy.** No emails, raw IPs, boards or move histories on the server. Guests are anonymous.
7. **Her record is sacred.** Test code and the owner's `admin` test account must never write to the `sans` account.

## Commands

```sh
npm install
npm test             # tsx --test tests/*.test.ts (needs `npm ci`/`npm install` first)
npm run build        # tsc --noEmit && vite build && build-worker && validate-artifact
npm run preview      # built Worker + local SQLite at http://127.0.0.1:4173 (reads .env.local)
npm run dev:api      # same server on :8787 for `npm run dev` (Vite proxies /api)
npx tsc --noEmit --noUnusedLocals --noUnusedParameters   # stricter check used for clean-ups
```

`tsconfig.json` only includes `src/` and `vite.config.ts`: **tests and `worker/` are not type-checked**. Run `npm test` for them.

## Architecture

```
index.html ── src/main.ts (player UI)        admin.html ── src/admin.ts (+ admin-notes.ts)
        │                                                     │
        └──────────── fetch /api/* ───────────────────────────┘
                              │
              dist/server/index.js  (Worker = all worker/*.mjs concatenated + embedded assets)
                              │
                       Cloudflare D1 (sansdoku-metrics)
```

- **No UI framework.** `src/main.ts` builds one `app.innerHTML` template, then wires handlers imperatively. `render()` repaints the board and tool states from module-level state (`game`, `selected`, `noteMode`, `armed`, `hintState`, `history`, `inboxData`…). `persist()` saves the game and credits play time.
- **Pure logic lives in small modules** that are unit-tested: `game.ts` (rules, hints, solver), `stats.ts`, `milestones.ts`, `notes.ts`, `greeting.ts`, `prefs.ts`. Prefer adding logic there rather than into `main.ts`.
- **Safe HTML.** `innerHTML` may only receive numbers and fixed words (see `stats-view.ts`). Anything typed by a person (notes, titles, nicknames) goes through `textContent` or DOM APIs.

### Client storage (`localStorage`, all per device)

| Key | Holds |
| --- | --- |
| `sansdoku:v1:<difficulty>` | The saved game (validated by `validGame`) |
| `sansdoku:reserve:v1:<difficulty>` | Up to 3 offline puzzles |
| `sansdoku:profile:v1` | Device id, nickname, `account` (`sans` or `admin`), `deviceId` |
| `sansdoku:theme`, `sansdoku:prefs:v1` | Appearance and helper toggles |
| `sansdoku:history:v1` | Finished puzzles (`Finish[]`), guest and account entries flagged by `acct` |
| `sansdoku:notes:cache:v1`, `sansdoku:notes:seen:v1` | Last fetched notes; which items she has seen |
| `sansdoku:metrics:v1` | Queued play metrics |
| `sansdoku:install-tip:v1` | Add-to-Home-Screen card dismissed |
| `sansdoku:stats:v1` | Legacy counters, read once by `loadHistory` to seed history (safe to delete later) |

The Home Screen app and Safari have **separate storage**.

### HTTP surface (all in `worker/`)

| Route | File | Auth |
| --- | --- | --- |
| `GET /api/puzzle` | `handler.mjs` | none (adds the API key server-side) |
| `POST /api/metrics` | `metrics.mjs` | none (per-game write tokens) |
| `POST /api/login`, `/api/logout`, `GET /api/session` | `account.mjs` | cookie `__Host-sansdoku-session` |
| `GET/POST /api/stats` | `account.mjs` | signed-in account |
| `GET /api/notes` | `notes.mjs` | signed-in account |
| `/admin`, `/admin/login`, `/admin/logout`, `/admin/api/stats` | `metrics.mjs`, `access.mjs` | cookie `__Host-sansdoku-admin` (7 days) |
| `GET/POST /admin/api/notes` | `notes.mjs` | admin only; POSTs check `Origin` |

### Accounts

- Two shared accounts, no user table: `sans` (secret `SANS_PASSWORD`) and `admin` (secret `TESTER_PASSWORD`, optional, for the owner's testing). The cookie is an HMAC-signed payload keyed with that account's password, so rotating a password signs only that account out.
- `accountPlayerId(user)` gives each account a stable UUIDv4-shaped player id. Signing in swaps the device's `profile.id`; signing out restores `deviceId`.
- Login attempts are rate limited by a keyed IP hash in `admin_login_attempts`.
- `admin` here is **not** the dashboard login. The dashboard uses `ADMIN_EMAIL` + `ADMIN_PASSWORD` (`access.mjs`).
- Sans mode (`canUseSans`) is purely cosmetic on the client; the account protects her record and labels, not secrets.

### D1 tables (`migrations/`, applied in order)

`plays`, `play_days` (metrics), `admin_login_attempts`, `account_finishes` (her synced record), `sans_messages`, `milestone_notes` (replacement wording for built-ins), `custom_milestones`.

### Stats, history and sync

- A finished puzzle is a `Finish {id, difficulty, at, ms, hints, acct?, synced?}` in `history`. Everything on the stats page is derived from it (`summarize`, `renderStats`).
- `acct` entries (finished while signed in) and guest entries are kept apart with `scope(history, acct)`. Only `acct` entries upload, so testing on the owner's phone never leaks into her record.
- `syncFinishes()` pulls the account's rows, merges them (`mergeRemote`) and pushes unsent ones in batches of 100. It is idempotent by id. `checkNotes()` runs sync and a notes refresh together before any popup.

### Milestones and notes

- One rule engine, `src/milestones.ts`: `Rule {kind, value, difficulty?, date?}`, `ruleProgress`, `ruleText`, `milestoneList`. The player app, the admin editor preview and the tests share it. Kinds: `total`, `difficulty`, `streak`, `days`, `nohint`, `fast`, `date`.
- Built-ins have fixed rules and replaceable wording; custom milestones live in `custom_milestones`. Rules are evaluated **on her phone** from her history, so they work offline. The Worker only stores and validates them.
- `src/notes.ts` builds the inbox (messages first, then unlocked milestones, ids `m:<id>`, `k:<key>`, `c:<id>`). `loadSeen`/`markSeen` track what she has seen. Popups (`startPopups`) show up to three unseen items, wait for the celebration and open dialogs (`whenQuiet`), and the Notes tab shows everything with "new" badges.

### Worker bundling (important)

`scripts/build-worker.mjs` **concatenates** `worker/{access,account,notes,metrics,handler}.mjs` into one file after stripping single-line `import … from "./x.mjs"` lines. Therefore:

- Top-level names must be unique across worker files (that is why account/notes helpers are prefixed `account…`/`notes…`).
- Use single-line relative imports; each file should still import what it uses, because the tests import files individually.
- A new worker file must be added to the list in `build-worker.mjs`.

## Conventions

- TypeScript strict, ES modules, 2-space indentation, double quotes. Small pure functions with tests; DOM code in `main.ts`/views.
- CSS is plain, themed through custom properties (`--board`, `--surface`, `--accent-ink`, `--selection-border`…) defined for light, dark and `data-theme="sans"`. Never hard-code colours for UI that must follow the theme (flower colours in the garden are intentional).
- Respect `prefers-reduced-motion` for any animation.
- Keep tap targets at least 44px high and verify at 320px (iPhone SE) wide. Nothing may scroll horizontally.
- Dates and streaks use the **local** calendar day (`dayKey`). The "days together" start date is a constant in `src/greeting.ts`.
- Interface copy changes should keep the gentle tone (see the product rules).

## How to…

- **Add a helper toggle:** add the key and default to `Prefs` in `src/prefs.ts`, a button in the Helpers fieldset in `main.ts`, an `aria-pressed` update in `render()`, and `prefButton(...)`.
- **Add a milestone rule kind:** extend `RuleKind`, `RULE_KINDS`, `ruleProgress` and `ruleText` in `src/milestones.ts`, then the limits/validation in `worker/notes.mjs` (`notesRuleLimits`, `notesCleanCustom`) and the admin editor fields in `src/admin-notes.ts`. Add tests in `tests/stats.test.ts` and `tests/notes.test.ts`.
- **Add a table or column:** new numbered file in `migrations/`, add it to the list in `scripts/d1-local.mjs`, and mention `wrangler d1 migrations apply sansdoku-metrics --remote` in the PR.
- **Add an endpoint:** route it in `worker/handler.mjs`, check the cookie with `sessionUser`/`isAdmin`, check `Origin` on writes, and add tests that cover auth, validation and the happy path.
- **Add a secret:** read it from `env` in the Worker, add it to `.env.example` and the Configuration table in the README, and never commit its value.

## Testing

- `npm test` for logic and the Worker (`tests/*.test.ts`, using `localDatabase()` from `scripts/d1-local.mjs`).
- `scripts/d1-local.mjs` is a tiny D1 stand-in on `node:sqlite`: every statement passed to `batch()` needs `.bind(...)` (even with no arguments), and `SELECT`/`RETURNING` statements return rows.
- For browser checks, build, then start the preview with the secrets in the environment, for example `SANS_PASSWORD=x TESTER_PASSWORD=y PORT=4173 node scripts/serve.mjs`. The preview treats localhost as admin (`LOCAL_ADMIN`), so `/admin` and `/admin/api/notes` work without signing in. Delete `.wrangler/local-preview` **before** starting the server for a clean database, and use the emulated iPhone devices from Playwright (SE 320px, 13 390px, 15 Pro Max 430px).
- Do not kill the preview with `pkill -f` patterns that also match your own command line.

## Gotchas worth knowing

- **Global keyboard shortcuts** in `main.ts` must stay out of the way whenever a dialog is open or an input has focus (this broke Backspace in the sign-in box once).
- **Tapping the selected square deselects it**, so tests and code must not "click again to type".
- The selection ring is a `::after` outline floating 1px inside the cell, with the four corner cells rounded to match the board corner; do not go back to an inset `box-shadow`, which merged with the board border.
- `showModal` is wrapped at the top of `main.ts` so dialogs open with focus on the dialog itself (no stray focus ring).
- `notes` is already the name of the Notes button in `main.ts`; the notes inbox state is `inboxData`.
- `finish()` runs exactly once per puzzle via `game.counted`; restarting a finished puzzle does not recount it.
- Tooling: there is no `gh` CLI in the agent environment; use the GitHub tools. `.openai/hosting.json` is part of the build artifact check, leave it in place.

## Deliberately not built (so nobody re-litigates it)

Leaderboards, social sharing, loss-based streaks, ads, analytics beyond the owner's dashboard, and any email or phone collection.

## Ideas parked for later

A "puzzle of the day" for the two of them, a heart she can send back to the owner, accent colour choices for Sans mode, scheduled notes on a chosen date (the `date` milestone kind already covers one-off surprises), and removing the legacy `sansdoku:stats:v1` carry-over once it is certainly unneeded.
