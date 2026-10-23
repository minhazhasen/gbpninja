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
| `DATABASE_URL` | `file:/home/minhazho/gbpninja-data/app.db` — outside the upload folder, so deploys never touch it |
| `SESSION_SECRET` | a new random value: `openssl rand -base64 32` (don't reuse the local one) |
| `GOOGLE_CLIENT_ID` | the OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | the OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `https://app.gbpninja.com/` (must be listed on the OAuth client) |
| `GBP_DATA_SOURCE` | `mock` until the Google provider is implemented |
| `PLATFORM_ADMIN_EMAILS` | your sign-in email(s), comma-separated |
| `CRON_SECRET` | a random value; daily cron: `curl -H "Authorization: Bearer <CRON_SECRET>" https://app.gbpninja.com/api/cron/refresh-competitors` |
| `NEXT_PUBLIC_FIREBASE_*` | same 6 values as the GitHub variables (server code reads the project id) |

Save → *Restart*. The app creates its database tables on start (`src/instrumentation-node.ts` runs `prisma/schema.sql`).

## 3. Firebase + Google (once)

- Firebase → Authentication → Settings → **Authorized domains**: add `app.gbpninja.com`.
- Google Cloud → Credentials → OAuth client: **Authorized redirect URIs** include `https://app.gbpninja.com/`.

## Notes

- **Restart / stale code:** each deploy writes a new `tmp/restart.txt`. If a deploy doesn't take effect, press *Restart* in Setup Node.js App.
- **Prisma engine:** `prisma/schema.prisma` builds the `rhel-openssl-1.1.x` engine for this server (CloudLinux, OpenSSL 1.1.1).
- **Schema changes:** edit `prisma/schema.prisma`, run `npm run db:sql` (and `npm run db:push` locally). New tables/indexes are created on the
  next start; changing existing columns needs a manual migration.
- **Smoke test:** `https://app.gbpninja.com/privacy` (public) loads, `/dashboard` redirects to `/login`, sign-in works, Settings → connect Gmail.
- **Logs:** cPanel → Setup Node.js App → the app's `stderr.log` in the app root.
