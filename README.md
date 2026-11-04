# SansDoku

A small mobile-first Sudoku PWA. Vite, TypeScript, plain CSS, and vite-plugin-pwa. No runtime UI framework. A small Worker serves the app and proxies puzzle requests to YouDoSudoku.

## Start

Requires Node.js 22.12+ (or a current supported LTS).

```sh
npm install
npm run build
npm run dev:api # in a second terminal
npm run dev
```

Production/offline preview:

```sh
npm test
npm run build
npm run preview
```

The development server does not enable the service worker. Test offline support against the production preview or HTTPS deployment. Let the first online load finish until “Ready for offline play” appears, then reload offline. On iPhone, use Safari → Share → Add to Home Screen.

## Features

- Sans mode: a saved blush-pink appearance with hearts and original messages referencing Taylor Swift song titles. Choose it in Settings → Appearance.
- Completing a puzzle in Sans mode celebrates with falling hearts and “Love you my cutu ♡”. The card dismisses automatically or on tap; reduced-motion settings hide the falling hearts.
- Easy, medium, hard; one saved game per difficulty.
- Pencil notes, undo, erase, conflict highlighting, completion detection. Entering a number removes that candidate from manual notes in its row, column, and box; erasing does not recreate notes, and Undo restores removed notes.
- Auto button (next to Notes) toggles automatic candidates. While enabled, candidates update with the board; turning it off restores your manual notes. Editing a note while Auto is on keeps the auto-filled candidates and lets you adjust them by hand. The mode is saved per puzzle and toggles can be undone.
- Selecting a number also highlights it inside pencil notes.
- Number pad shows how many of each digit are left and greys out finished digits. Tap a number with no square selected to place it in many squares ("number-first"); tap it again or press Escape to stop. Tapping the selected square again deselects it.
- Gentle mistake alerts (Settings → Helpers): wrong entries are tinted, shake softly and get a kind message. Puzzles are unique, so the solution is derived on-device and never stored.
- Hint button: first tap points at a square in words (a mistake, a single candidate, or a number with one spot left); tapping Hint again reveals the digit.
- Optional timer (off by default). Play time only counts active moments. Finishing a puzzle shows the time, a personal best (only for hint-free games) and a soft streak; totals live under Settings → Your little record.
- Stats page (chart icon in the header): puzzles finished, streaks, time played, solve-time chart per difficulty, puzzles per week, bests/averages and recent puzzles, with a gentle "how you're growing" line. History is stored per device; when signed in as `sans` her finished puzzles are saved to the account (`account_finishes` table, migration 0004) and follow her to any phone. Games finished as a guest or while signed in are kept separate.
- Polish: Apple home-screen tags, a guided "Add to Home Screen" card (iPhone/iPad Safari, until installed), "Start this puzzle over" (undoable), optional auto-advance, and a soft finish chime (on by default; follows the iPhone silent switch). Helpers live in Settings.
- Sans mode extras: a time-of-day greeting, a "days together" line (since 22 Nov 2025), notes you write from the admin page that appear once on her next open, and milestone notes (first puzzle, 10, 50, 100, a 7-day streak, first hard puzzle) kept under Stats → Little notes. The admin page has a Notes & milestones tab where you can reword the built-in milestones and add your own (by puzzles finished, level, streak, days played, no-hint puzzles, fast finishes or a special date); see [docs](docs/metrics.md).
- An optional `admin` test sign-in (own secret, separate stats) so the owner can test without touching her record.
- Garden on the stats page: one flower per finished puzzle (daisy for easy, tulip for medium, rose for hard), newest last; tap a flower for its date and time. Shows the latest 96.
- Keyboard: arrows select cells, 1–9 enter, N toggles notes, Delete erases.
- Fresh API puzzles online; a reserve of up to 3 puzzles per difficulty on this device for offline use. A bundled bank remains as a fallback when that reserve is empty.
- Light, Dark, and System appearance, remembered on this device.
- Prompted app updates, with progress saved before reload.

Progress lives in browser storage on this device. It is not a cloud backup; clearing site data removes it. Changing hosting origins does not transfer saved games.

## Puzzle source / API

The bundled bank contains 30 YouDoSudoku puzzles (10 per difficulty), imported and validated locally. Difficulty labels come from the provider. Number permutations and transpose add variety while preserving puzzle logic. A local validator checks uniqueness; gameplay never calls a solving service.

Live requests use `/api/puzzle?difficulty=easy|medium|hard`. The server sends the key to YouDoSudoku; the browser never receives it. Responses are not service-worker cached. Fresh puzzles are fetched on starting a new game while online; the app quietly replenishes a local reserve. Existing saved games always resume without a network dependency. Slow or failed requests fall back to the reserve and then the bundled bank.

Copy `.env.example` to `.env.local` and fill in `YOUDOSUDOKU_API_KEY`. This file is ignored by Git. Never use a `VITE_` key variable: those are exposed to the browser. Local production preview and `dev:api` read this file.

`npm run puzzles:import` refreshes the bundled fallback collection (default 10 per difficulty). These one-time imports validate the supplied solution and uniqueness before writing `src/puzzles.json`; live requests only check response format. Authenticated import was verified for all 30 bundled puzzles. API docs: https://you-do-sudoku-api.vercel.app/

API Ninjas is not integrated because its current free-plan terms prohibit sharing API output with third parties.

## Hosting

Cloudflare Workers is a good fit now that the app has a server endpoint. The build embeds the small frontend assets into one Worker module; no runtime framework is required.

```sh
npm test
npm run build
npx wrangler login
npx wrangler secret put YOUDOSUDOKU_API_KEY
npx wrangler deploy
```

Wrangler prompts for the secret without putting it in Git. A `workers.dev` address is sufficient; a custom domain is optional. Deploying to static-only hosting would require a separate API proxy.

The Sites identity is recorded in `.openai/hosting.json`. Its initial deployment is owner-private, so that link is for the owner to review; sharing with another person requires an audience change or deployment to your chosen public host. The API key is configured as a hosted secret through Sites.

## Validation

`npm test` covers Sudoku rules, candidate notes, undo, save-format validation, imported puzzle uniqueness, and proxy credential/error handling. Browser checks cover mobile layout, saved progress, themes, live requests, and reloading the cached app with the local server stopped. Physical iPhone testing is still needed for Safari installation and touch behaviour.

## Player metrics

Optional nicknames, device-level player stats, active play time, offline metric sync, and a private admin dashboard with live online presence. Sans mode is unlocked by signing in as the optional `sans` account (Settings → Sign in); the nickname `sans` is reserved. See [account setup](docs/metrics.md#optional-sans-account). See [setup, cost, and admin access](docs/metrics.md).
