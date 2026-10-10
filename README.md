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

- Easy, medium, hard; one saved game per difficulty.
- Pencil notes, undo, erase, conflict highlighting, completion detection.
- Long-press Notes to toggle automatic candidates; the same action is under Settings → A little shortcut. While enabled, candidates update with the board. Turning it off restores your manual notes; writing a manual note also exits automatic mode. The mode is saved per puzzle and toggles can be undone.
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
