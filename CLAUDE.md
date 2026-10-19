# Google Business Profile Manager

Web app for managing Google Business Profiles (GBP): performance insights, reviews + replies,
a content calendar for posts, and a profile audit with in-app fixes.

## Stack
- Next.js 15 (App Router, Server Components, Server Actions), React 19, TypeScript (strict)
- Tailwind CSS v4 — theme tokens in `src/app/globals.css` (`bg-surface`, `text-muted`, `border-border`, `text-accent`)
- Auth.js v5 (`next-auth@beta`) with Google OAuth, scope `business.manage` — `src/auth.ts`
- Prisma 6 + SQLite in dev (`prisma/schema.prisma`)
- Recharts for charts, lucide-react for icons, zod for input validation

## Commands
- `npm run setup` — create `.env.local`, install, push DB schema (runs automatically on session start)
- `npm run dev` — http://localhost:3000
- `npm run typecheck` / `npm run lint` / `npm run build` — run all three before committing

## Architecture
- `src/lib/gbp/types.ts` — domain types and the `GbpProvider` interface. **All data access goes through `getProvider()`** (`src/lib/gbp/index.ts`).
  - `mock.ts` — in-memory demo data (default, `GBP_DATA_SOURCE=mock`). Resets on restart.
  - `google.ts` — real Google API provider. Methods are stubs; endpoints are documented at the top of the file.
- `src/lib/audit.ts` — rule-based profile audit (weighted score 0–100). Add rules to the `rules` array.
- `src/lib/reply-templates.ts` — suggested review replies.
- `src/app/(app)/` — feature pages sharing the sidebar layout: `dashboard`, `performance`, `reviews`, `calendar`, `audit`.
- `src/app/(app)/actions.ts` — server actions (reply, create post, apply audit fixes). Validate with zod.
- Selected location is in the URL: `?location=locations/123`. Use `resolveLocation(searchParams)` from `src/lib/location.ts`.

## Conventions
- Server Components by default; add `"use client"` only for interactivity (charts, pickers).
- Mutations via server actions + `revalidatePath`, not API routes (API routes only for auth/webhooks/cron).
- Keep the mock provider in sync with any new `GbpProvider` method so the app always runs without credentials.
- Never commit `.env*` files or real tokens.

## Google API notes
- GBP APIs require an approved access request for the Cloud project (quota is 0 until approved).
- Performance: `businessprofileperformance.googleapis.com` `fetchMultiDailyMetricsTimeSeries`.
- Reviews and local posts are still on the v4 `mybusiness.googleapis.com` API.
- Posts can't be scheduled natively — store in `ScheduledPost` and publish via a cron route.

## Roadmap
1. Implement `google.ts` provider (accounts → locations → reviews → metrics → posts).
2. Persist scheduled posts in Prisma + `/api/cron/publish-posts` route.
3. AI-generated review replies and post drafts (Claude API).
4. Audit history (`AuditSnapshot`) and score trend chart.
5. Multi-account / agency mode, roles, and Postgres for production.
