# Nicknames, metrics, and private admin access

SansDoku asks for an optional nickname on first use. Guest play works too. Change it in Settings. Sans mode is unlocked only by signing in as the optional `sans` account (see below); the nickname `sans` is reserved. Signing out returns a selected Sans theme to System and clears its celebration.

A random device ID distinguishes players; nicknames are self-selected, not verified identities. Another device or cleared website data creates another player. Same-name players remain separate in the dashboard. Nickname changes keep the same player ID.

## What gets recorded

- One summary per puzzle played, starting with the first accepted number, pencil note, erase, or automatic-candidates action.
- Nickname, difficulty, actions, cells filled, whether automatic candidates were used, start time, first completion time, and accumulated active play time.
- Active time resumes across visits. It pauses when the page is hidden or after 60 seconds without a board interaction. Time before the first action is excluded. Completion is recorded once even if it is undone afterwards.
- Online presence sends a summary at most once per 30 seconds during active play. Closing/hiding/pausing sends a best-effort final update. A heartbeat older than 90 seconds is no longer considered live. Players who are offline cannot appear live.
- Offline summaries are queued on the device and retried online. Game IDs, revisions, and private per-game write tokens make retries idempotent and prevent other callers from overwriting a game by ID alone. Stats are self-reported game telemetry, not a verified competitive leaderboard.
- No emails, raw IP addresses, full Sudoku boards, or individual move histories are stored in the metrics database. Email is used only for the owner's admin authentication. The login limiter temporarily stores a keyed IP hash, separate from game metrics.

The private dashboard shows totals, per-difficulty averages/best times, recent games, live nicknames, and per-player stats. Click a player's nickname to filter to their games. Counts and averages use the selected 7/30/90/365-day window; recent games and player lists show up to 100 rows. Presence is always current regardless of the selected reporting period.

## Test locally

Use Node 22.13 or later (Node 24 LTS recommended) for built-in SQLite.

```sh
npm install
npm run build
npm run preview
```

Open http://127.0.0.1:4173 and http://127.0.0.1:4173/admin. If that port is occupied, run `PORT=4175 npm run preview` instead. Local preview stores metrics in `.wrangler/local-preview/metrics.sqlite`, which is ignored by Git. It explicitly bypasses admin login **only on localhost**, so local testing doesn't need a password. This bypass is not configured in the deployed Worker.

For hot reload: build once, run `npm run dev:api` in one terminal and `npm run dev` in another. The Vite app sends metrics through its API proxy. Open the dashboard on the API server at http://127.0.0.1:8787/admin.

## Production database

The free D1 database `sansdoku-metrics` has been created and migrations through `0003_admin_login.sql` applied. Wrangler's `DB` binding points to it. The live Worker is bound to this database.

Future migrations:

```sh
npx wrangler d1 migrations apply sansdoku-metrics --remote
```

## Configure the admin password

Admin email: **shivsrijan25@gmail.com**. The dashboard uses a simple server-side email/password login. Cloudflare Zero Trust and email codes are no longer needed.

Choose a password of **12–256 characters** and run this in the repository:

```sh
npx wrangler secret put ADMIN_PASSWORD
```

Wrangler prompts for the password privately. Do not put it in chat, source files, `wrangler.jsonc`, or a `VITE_` variable. It is saved as a Cloudflare Worker secret and is never shipped to the browser. The existing `ADMIN_EMAIL` setting identifies the only admin account.

Open https://sansdoku.shivsrijan25.workers.dev/admin and sign in with that email and your chosen password. A signed Secure, HttpOnly, SameSite cookie keeps you signed in for seven days. Sign out clears this browser's cookie. Changing the password with the same command invalidates existing sessions everywhere; an already copied session remains valid until expiry or a password change. There is no registration or password-reset email flow.

Login attempts are limited to 10 per IP address per 15-minute fixed window. Only a keyed hash of the address is stored temporarily in D1 for the limiter. Metrics do not record IP addresses. Admin HTML and API responses are never cached. Local preview continues to bypass login **only on localhost**. Never deploy `LOCAL_ADMIN=1`.

If you previously created a Cloudflare Access application protecting these paths, remove it so the new login can be reached.

## Cost and expected usage

D1 Free includes **5 GB total storage**, **5 million rows read/day**, and **100,000 rows written/day**. A single free-plan D1 database is limited to **500 MB**. These allowances are shared across your account, and table/index writes both count. Free daily query limits reset at midnight UTC. Exceeding them makes queries fail rather than automatically charging overage; play continues locally and metrics retry later.

Estimated storage is roughly **0.5–1.5 KB per game including indexes and a small number of daily rows**: 10,000 games should be around **5–15 MB**. Puzzles played across many days need additional daily rows. This is an estimate, not a measured guarantee. Normal small personal-app usage should cost **$0 for D1** within the free limits. There is no need to enable Workers Paid for this feature.

A heartbeat updates the game row, its presence index, and changed daily time records. Only changed days are sent; already synced past days are not rewritten. Budget roughly **6 row writes per minute per active player**, plus initial/final writes. Idle players don't keep writing indefinitely. Dashboard polling reads totals and per-player aggregates for the selected period, so its read usage grows with game history. Check Cloudflare → Storage & databases → D1 → sansdoku-metrics → Metrics for real storage/read/write consumption.

Sources: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

## Current setup status

The database and dashboard are deployed. Set the `ADMIN_PASSWORD` Worker secret with the command above to enable production sign-in. Until that is set, the login page explains that password setup is pending and private stats stay locked.

## Daily, weekly, and monthly play time

Time is split into day buckets using **Asia/Kolkata (India time)**, including midnight crossings. After selecting a player, the dashboard shows their daily/weekly/monthly play time, most active date, and average play time per day/week/month for the selected range. Expand the three breakdown sections for date-level values. Weeks start Monday. Averages include zero-play days and all calendar weeks/months touched by the range; the first/last week or month may be partial. Daily history starts with this release and cannot be reconstructed from older total-only summaries.

Each game has separate cumulative daily snapshots. Repeated/offline uploads update the maximum recorded daily time instead of adding it again. Offline snapshots sync when online, and only changed days are written. The client retains up to the most recent 366 tracked days per puzzle for sync; previously synced older days stay in D1.

## Optional `sans` account

Sign-in is optional; guests play exactly as before (the `admin` test account is described at the end). Settings → Sign in accepts username `sans` and a shared password kept as a Worker secret, never in the repo:

```sh
npx wrangler secret put SANS_PASSWORD
```

(at least 6 characters; changing it signs everyone out). A successful sign-in sets a signed, HttpOnly, 1-year cookie and the device remembers "signed in" so Sans mode keeps working offline. The app re-checks the session whenever it opens online and only signs the device out when the server explicitly says the session is gone.

Signing in switches the device to a fixed player ID for the account, so the dashboard shows her under one name (`sans`) across devices. Earlier plays stay under the old device ID. Sign-in attempts are rate limited (10 per 15 minutes per keyed IP hash, in the existing `admin_login_attempts` table). Admin access is unchanged and separate. For local preview, put `SANS_PASSWORD` in `.env.local`.

### Account stats

While signed in, each finished puzzle (id, difficulty, finish time, active play time, hints used) is saved to the `account_finishes` table through `/api/stats` (signed-in only, idempotent by id, validated and capped at 100 per request). Her phone pushes anything unsent and pulls what other devices finished, so her streaks, bests and history match everywhere. Run the migration before deploying:

```sh
npx wrangler d1 migrations apply sansdoku-metrics --remote
```

The admin dashboard is unchanged. To clear her history: `npx wrangler d1 execute sansdoku-metrics --remote --command "DELETE FROM account_finishes;"`.

### Owner test account

A second optional account, username `admin`, with its own secret so you can try everything (Sans mode, stats, notes) without touching her record:

```sh
npx wrangler secret put TESTER_PASSWORD
```

(at least 6 characters). It has its own player ID and its own saved finishes, so her stats never change when you play as `admin`; it appears in the dashboard as a separate player named `admin`. It can read the same notes you send her, but only changes its own copy of “seen”. It does not open the admin dashboard, which keeps its separate email and password login.

### Notes for her

The admin page has a “Notes for sans” section: send a message (shown once on her next open while signed in and listed under Stats → Little notes) and edit the six milestone texts. This needs migration `0005_notes.sql`:

```sh
npx wrangler d1 migrations apply sansdoku-metrics --remote
```
