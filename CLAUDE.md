# Google Business Profile Manager

Web app for managing Google Business Profiles (GBP): performance insights, reviews + replies,
a content calendar for posts, and a profile audit with in-app fixes.

## Stack
- Next.js 15 (App Router, Server Components, Server Actions), React 19, TypeScript (strict)
- Tailwind CSS v4 — HSL theme tokens in `src/app/globals.css` (see Design below)
- Auth.js v5 (`next-auth@beta`) with Google OAuth, scope `business.manage` — `src/auth.ts`
- Prisma 6 + SQLite in dev (`prisma/schema.prisma`)
- Recharts for charts, lucide-react for icons, zod for input validation

## Commands
- `npm run setup` — create `.env.local`, install, push DB schema (runs automatically on session start)
- `npm run dev` — http://localhost:3000
- `npm run typecheck` / `npm run lint` / `npm run build` — run all three before committing

## Architecture
- `src/lib/gbp/types.ts` — domain types and the `GbpProvider` interface. **All data access goes through `getProvider()`** (`src/lib/gbp/index.ts`).
  - `mock.ts` — in-memory demo data (default, `GBP_DATA_SOURCE=mock`), kept on `globalThis`. Resets on server restart.
  - `google.ts` — real Google API provider. Methods are stubs; endpoints are documented at the top of the file.
- `src/lib/audit.ts` — rule-based profile audit (weighted score 0–100). Add rules to the `rules` array.
- `src/lib/reply-templates.ts` — suggested review replies.
- `src/app/(app)/` — feature pages sharing the sidebar layout: `dashboard`, `performance`, `reviews`, `calendar` (Content), `audit`, `locations`, `settings`.
- Page state lives in the URL (`?location=`, `?range=`, `?series=`, `?filter=`, `?view=`, `?compose=1`) so pages stay Server Components.
- `src/app/(app)/actions.ts` — server actions (reply, create post, apply audit fixes). Validate with zod.
- Selected location is in the URL: `?location=locations/123`. Use `resolveLocation(searchParams)` from `src/lib/location.ts`.

## Design
The UI matches the **TasksBook CRM marketing section** (shadcn/ui look, ported to Tailwind v4 without Radix):
- Gray page `bg-background`, white `bg-card` panels with `rounded-xl border`, ONE accent blue `primary` (#3D5BE0).
  Active/selected = `bg-accent text-accent-foreground`. Status colours: `success`, `warning`, `destructive`, `info`.
- Never hard-code colours — use tokens. Charts use `var(--viz-1..4)`. Dark mode via `.dark` class (top-bar toggle).
- Font: Plus Jakarta Sans. Small uppercase field/column labels use the `label-caps` utility.
- App shell (`src/components/app-shell.tsx`): collapsible left sidebar (location switcher card, grouped nav with badges,
  user footer), sticky 56px top bar, mobile drawer. Add new pages to `sections` there.
- Building blocks in `src/components/ui.tsx`: `PageHeader`, `Card`, `PanelHeader`, `StatStrip`, `PillTabs`, `Badge`,
  `buttonClass()`, `inputClass`, `Field`, `Stars`, `StarBars`, `Avatar`, `EmptyState`. Reuse them; page pattern is
  `PageHeader` → `StatStrip` → `Card` panels with `PanelHeader`, inside `space-y-5 pb-8`.

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
