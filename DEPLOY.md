# Deploying GBPNinja to cPanel (app.gbpninja.com)

GBPNinja is a Next.js server app. It runs on the cPanel server as a **Node.js app** (CloudLinux "Setup Node.js App", LiteSpeed),
and every push to `main` is built on GitHub and uploaded over FTPS by `.github/workflows/deploy.yml` (~3–5 min).

```
GitHub push → npm ci → schema SQL → typecheck + lint → next build (standalone)
            → app.tar.gz (server.js + node_modules + .next/static + public, ~40 MB)
            → FTPS upload of 4 files to ~/app.gbpninja.com/deploy: server.js (loader), app.tar.gz, release.txt, tmp/restart.txt
            → app restarts → deploy/server.js unpacks app.tar.gz into ./app (when release.txt changed) → runs app/server.js
```

One archive instead of ~2,000 loose files: FTPS on this host costs ~2 s per file. The previous release stays in `app.prev`.

## 1. GitHub (once)

Repo → Settings → Secrets and variables → Actions.

**Secrets**

| Name | Value |
|---|---|
| `FTP_SERVER` | `ftp.minhazhosen.com` |
| `FTP_USERNAME` | `deploy@app.gbpninja.com` (rooted at `~/app.gbpninja.com/deploy`) |
| `FTP_PASSWORD` | the FTP account's password |

**Variables** (built into the browser bundle — public Firebase web config, same as `.env.local`):
`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`,
`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.

## 2. cPanel → Setup Node.js App (once)

*Create Application*:

| Field | Value |
|---|---|
| Node.js version | **22** |
| Application mode | Production |
| Application root | `app.gbpninja.com/deploy` |
| Application URL | `app.gbpninja.com` |
| Application startup file | `server.js` |

Don't press *Run NPM Install* — the archive already contains the `node_modules` the server needs.

**Environment variables** (server-only; never put these in GitHub):

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_OPTIONS` | `--v8-pool-size=2 --max-old-space-size=384` — fewer threads (~9) and a memory cap, so the app can't crowd out PHP |
| `DATABASE_URL` | `file:/home/minhazho/gbpninja-data/app.db` — outside the upload folder, so deploys never touch it |
| `SESSION_SECRET` | a new random value: `openssl rand -base64 32` (don't reuse the local one) |
| `GOOGLE_CLIENT_ID` | the OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | the OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `https://app.gbpninja.com/` (must be listed on the OAuth client) |
| `GBP_DATA_SOURCE` | `google` — real Business Profiles and data saved in the database (`mock` = sample data, nothing saved). Check with `/api/health` |
| `PLATFORM_ADMIN_EMAILS` | your sign-in email(s), comma-separated |
| `CRON_SECRET` | a random value; daily cron: `curl -H "Authorization: Bearer <CRON_SECRET>" https://app.gbpninja.com/api/cron/refresh-competitors` |
| `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID` | the Meta app (Facebook Page + Instagram publishing) |
| `META_REDIRECT_URI` | `https://app.gbpninja.com/api/oauth/meta/callback` (listed in the Meta app's Valid OAuth Redirect URIs) |
| `APP_URL` | `https://app.gbpninja.com` — Instagram fetches post images from `APP_URL/api/media/…` (files in `~/gbpninja-data/media`) |
| `NEXT_PUBLIC_FIREBASE_*` | same 6 values as the GitHub variables (server code reads the project id) |

Save → *Restart*. The app creates its database tables on start (`src/instrumentation-node.ts` runs `prisma/schema.sql`).

## 3. Firebase + Google (once)

- Firebase → Authentication → Settings → **Authorized domains**: add `app.gbpninja.com`.
- Google Cloud → Credentials → OAuth client: **Authorized redirect URIs** include `https://app.gbpninja.com/`.

## Notes

- **Restart / stale code:** each deploy writes a new `tmp/restart.txt`. If a deploy doesn't take effect, press *Restart* in Setup Node.js App.
- **Process limit:** CloudLinux counts every thread toward the account's *Number Of Processes* (225), shared with PHP for all sites.
  The app uses Node's built-in `node:sqlite` (no Prisma engine, which started a thread per CPU core and filled the limit → PHP 503s on
  every site) and the loader sets `UV_THREADPOOL_SIZE=2`; it runs on ~12 threads. Watch cPanel → Resource Usage after changes.
- **Schema changes:** edit `prisma/schema.prisma`, run `npm run db:sql` (and `npm run db:push` locally). New tables/indexes are created on the
  next start; changing existing columns needs a manual migration.
- **Health:** `https://app.gbpninja.com/api/health` shows the app's threads and memory (expect ~9 threads, ~200 MB).
- **Smoke test:** `https://app.gbpninja.com/privacy` (public) loads, `/dashboard` redirects to `/login`, sign-in works, Settings → connect Gmail.
- **Logs:** cPanel → Setup Node.js App → the app's `stderr.log` in the app root.
