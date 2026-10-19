# Google Business Profile Manager

Manage Google Business Profiles in one place:

- **Dashboard** — impressions, actions, rating, unreplied reviews and audit score at a glance
- **Performance** — 90-day impressions and customer actions (calls, website clicks, directions)
- **Reviews** — filter, see what needs a reply, and reply with suggested responses
- **Content calendar** — month view of posts; schedule updates, offers and events
- **Profile audit** — weighted 0–100 score with issues by severity, plus a quick-fix form

Runs on demo data out of the box — no Google account needed.

## Getting started

```bash
npm install
npm run setup
npm run dev
```

Open http://localhost:3000.

## Connecting real Google Business Profiles

1. In Google Cloud Console, create a project and [request GBP API access](https://developers.google.com/my-business/content/prereqs).
2. Enable: My Business Account Management, Business Information, Business Profile Performance, and Google My Business API (v4).
3. Create an OAuth client (Web) with redirect URI `http://localhost:3000/api/auth/callback/google`.
4. Put `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` in `.env.local` and set `GBP_DATA_SOURCE=google`.
5. Implement the methods in `src/lib/gbp/google.ts`.

See [CLAUDE.md](CLAUDE.md) for architecture and conventions.
