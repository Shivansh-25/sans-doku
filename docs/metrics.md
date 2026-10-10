# Nicknames, metrics, and private admin access

SansDoku asks for an optional nickname on first use. Guest play works too. Change it in Settings. Only the trimmed nickname `sans` (case insensitive) makes Sans mode available. Changing to another nickname returns a selected Sans theme to System and clears its celebration.

A random device ID distinguishes players; nicknames are self-selected, not verified identities. Another device or cleared website data creates another player. Same-name players remain separate in the dashboard. Nickname changes keep the same player ID.

## What gets recorded

- One summary per puzzle played, starting with the first accepted number, pencil note, erase, or automatic-candidates action.
- Nickname, difficulty, actions, cells filled, whether automatic candidates were used, start time, first completion time, and accumulated active play time.
- Active time resumes across visits. It pauses when the page is hidden or after 60 seconds without a board interaction. Time before the first action is excluded. Completion is recorded once even if it is undone afterwards.
- Online presence sends a summary at most once per 30 seconds during active play. Closing/hiding/pausing sends a best-effort final update. A heartbeat older than 90 seconds is no longer considered live. Players who are offline cannot appear live.
- Offline summaries are queued on the device and retried online. Game IDs, revisions, and private per-game write tokens make retries idempotent and prevent other callers from overwriting a game by ID alone. Stats are self-reported game telemetry, not a verified competitive leaderboard.
- No emails, IP addresses, full Sudoku boards, or individual move histories are stored in the metrics database. Email is used only for the owner's admin authentication.

The private dashboard shows totals, per-difficulty averages/best times, recent games, live nicknames, and per-player stats. Click a player's nickname to filter to their games. Counts and averages use the selected 7/30/90/365-day window; recent games and player lists show up to 100 rows. Presence is always current regardless of the selected reporting period.

## Test locally

Use Node 22.13 or later (Node 24 LTS recommended) for built-in SQLite.

```sh
npm install
npm run build
npm run preview
```

Open http://127.0.0.1:4173 and http://127.0.0.1:4173/admin. If that port is occupied, run `PORT=4175 npm run preview` instead. Local preview stores metrics in `.wrangler/local-preview/metrics.sqlite`, which is ignored by Git. It explicitly bypasses admin login **only on localhost**, so local testing doesn't need an email code. This bypass is not configured in the deployed Worker.

For hot reload: build once, run `npm run dev:api` in one terminal and `npm run dev` in another. The Vite app sends metrics through its API proxy. Open the dashboard on the API server at http://127.0.0.1:8787/admin.

## Production database

The free D1 database `sansdoku-metrics` has been created and migration `0001_metrics.sql` applied. Wrangler's `DB` binding points to it. This does not deploy changes to the live app.

Future migrations:

```sh
npx wrangler d1 migrations apply sansdoku-metrics --remote
```

## Configure Cloudflare Access before deploying

Admin identity: **shivsrijan25@gmail.com**. There is no separate admin ID or password. Cloudflare sends a one-time code to this allowed email.

1. Open Cloudflare Zero Trust → Access controls → Applications → Add an application → Self-hosted.
2. Name it `SansDoku admin`. Add public-hostname entries for `sansdoku.shivsrijan25.workers.dev` with paths `admin` and `admin/*`, plus `admin.html` (the alternate HTML URL). Protect **only these paths**. A Worker-wide Access switch would also lock players out of the game.
3. Set the application session duration to **7 days**. Use an Allow policy including only the email `shivsrijan25@gmail.com`, and set its duration to 7 days too. Enable One-time PIN as its login method. Do not add a Bypass policy.
4. Copy the application's **AUD tag** and your Zero Trust team domain, e.g. `your-team.cloudflareaccess.com`.
5. Add these non-secret settings to `wrangler.jsonc` under `vars`:

```json
{
  "ADMIN_EMAIL": "shivsrijan25@gmail.com",
  "ACCESS_TEAM_DOMAIN": "your-team.cloudflareaccess.com",
  "ACCESS_AUD": "your-application-aud-tag"
}
```

6. Build and deploy the reviewed changes. Open https://sansdoku.shivsrijan25.workers.dev/admin, enter your email, then its code. You stay signed in for the configured session, subject to Cloudflare's session/policy settings. Use Sign out to end it early.

The Worker independently verifies the Access JWT signature, issuer, audience, expiry, and allowed email before serving the dashboard HTML or metrics. Without correct Access settings or a valid token, production admin endpoints stay locked. The service worker excludes admin navigation and admin assets from offline caching. Never deploy `LOCAL_ADMIN=1` as an environment variable.

References: [Access applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [session durations](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/), [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## Cost and expected usage

D1 Free includes **5 GB total storage**, **5 million rows read/day**, and **100,000 rows written/day**. A single free-plan D1 database is limited to **500 MB**. These allowances are shared across your account, and table/index writes both count. Free daily query limits reset at midnight UTC. Exceeding them makes queries fail rather than automatically charging overage; play continues locally and metrics retry later.

Estimated storage is roughly **0.5–1.5 KB per game including indexes and a small number of daily rows**: 10,000 games should be around **5–15 MB**. Puzzles played across many days need additional daily rows. This is an estimate, not a measured guarantee. Normal small personal-app usage should cost **$0 for D1** within the free limits. There is no need to enable Workers Paid for this feature.

A heartbeat updates the game row, its presence index, and changed daily time records. Only changed days are sent; already synced past days are not rewritten. Budget roughly **6 row writes per minute per active player**, plus initial/final writes. Idle players don't keep writing indefinitely. Dashboard polling reads totals and per-player aggregates for the selected period, so its read usage grows with game history. Check Cloudflare → Storage & databases → D1 → sansdoku-metrics → Metrics for real storage/read/write consumption.

Sources: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

## Current setup status

The database exists. Production Access configuration is still pending: the connected CLI can manage Workers and D1, but the browser is not signed in to your Cloudflare dashboard. The production dashboard stays locked until Access is configured. After creating the Access app, provide its team domain and AUD tag (neither is a password) so the Worker can validate the email login.

## Daily, weekly, and monthly play time

Time is split into day buckets using **Asia/Kolkata (India time)**, including midnight crossings. After selecting a player, the dashboard shows their daily/weekly/monthly play time, most active date, and average play time per day/week/month for the selected range. Expand the three breakdown sections for date-level values. Weeks start Monday. Averages include zero-play days and all calendar weeks/months touched by the range; the first/last week or month may be partial. Daily history starts with this release and cannot be reconstructed from older total-only summaries.

Each game has separate cumulative daily snapshots. Repeated/offline uploads update the maximum recorded daily time instead of adding it again. Offline snapshots sync when online, and only changed days are written. The client retains up to the most recent 366 tracked days per puzzle for sync; previously synced older days stay in D1.
