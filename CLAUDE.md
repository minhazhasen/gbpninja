# GBPNinja (Google Business Profile Manager)

GBPNinja is a web app for managing Google Business Profiles (GBP): performance insights, reviews + replies,
a content calendar for posts, and a profile audit with in-app fixes.

## Stack
- Next.js 15 (App Router, Server Components, Server Actions), React 19, TypeScript (strict)
- Tailwind CSS v4 — HSL theme tokens in `src/app/globals.css` (see Design below)
- Sign-in: Firebase Authentication, Login with Google (see Auth below). Auth.js v5 (`next-auth@beta`, `src/auth.ts`) is kept only for the
  Google OAuth connection with the `business.manage` scope (live GBP data), not for app sign-in.
- SQLite via Node's built-in `node:sqlite` at runtime (`src/lib/db.ts`, Node 22.13+); Prisma 6 only for the schema and tools
  (`prisma/schema.prisma`, db push, `npm run db:sql`). Don't reintroduce the Prisma client at runtime: its engine starts a thread per
  CPU core and fills the cPanel account's process limit (see `DEPLOY.md`)
- Recharts for charts, lucide-react for icons, zod for input validation

## Commands
- `npm run setup` — create `.env.local`, install, push DB schema (runs automatically on session start)
- `npm run dev` — http://localhost:3000 (Turbopack; pages compile in ~0.3 s on first visit vs 1–3 s with webpack)
- `npm run typecheck` / `npm run lint` / `npm run build` — run all three before committing
- `npm run db:sql` — regenerate `prisma/schema.sql` after changing `prisma/schema.prisma` (the server creates missing tables from it)
- Deploy: push to `main` → `.github/workflows/deploy.yml` builds `output: "standalone"` and uploads over FTPS to the cPanel Node.js app
  (`~/app.gbpninja.com/deploy`, startup `server.js`, Node 22). Setup, secrets and server env vars: `DEPLOY.md`.

## Auth
- `/login` (`src/app/login/`, `?mode=signup` opens Sign up): left = `app-preview.tsx` (real Dashboard screenshots `public/brand/app-preview-light/dark.webp`, 1440×900 @2× cropped above the sidebar user card, swapped by `.dark`, fills the full-height panel with object-cover from the top-left; retake after big UI changes), right =
  `auth-card.tsx` Sign in / Sign up tabs — Google (`signInWithPopup`) or email + password (`createUserWithEmailAndPassword` + name +
  `sendEmailVerification` → "Verify your email" screen, "I've verified" reloads the user; unverified sign-ins land there too; Forgot password →
  `sendPasswordResetEmail`). Needs Email/Password enabled in Firebase. Every path: Firebase ID token (`src/lib/firebase.ts`, `NEXT_PUBLIC_FIREBASE_*`) →
  `startSession(idToken)` verifies the Firebase ID token with `jose` against Google's securetoken keys (issuer/audience = project id,
  verified email; no service account) → signed HS256 cookie `gbpn_session` (`SESSION_SECRET`, httpOnly, 14 days) — `src/lib/session.ts`.
- `src/middleware.ts` redirects every page without a valid session to `/login?next=…` (`safeNext` blocks open redirects); `/api`, `/invite`,
  static files are open. Only active when `authEnabled()` (Firebase project id + `SESSION_SECRET` set) — otherwise the open demo.
- Server side: `getSessionUser()` (`src/lib/current-user.ts`); the sidebar user card shows the Google name/photo; `platformAdmin()` uses the
  session email. `signOutAction` deletes the cookie → `/login` (which also signs Firebase out). Google must be enabled in Firebase
  (Authentication → Sign-in method) and the domain listed under Authorized domains (localhost is by default).
- TODO: map the signed-in email to a workspace member/role (roles still come from `getCurrentMember()`).
- Connecting Google accounts (separate from sign-in): `src/lib/google/oauth.ts` — our own OAuth client (`GOOGLE_CLIENT_ID/SECRET`,
  redirect `GOOGLE_REDIRECT_URI` = `http://localhost:3001/`, handled by `src/app/route.ts` at "/"). Purposes `gbp` (business.manage) and
  `gmail` (gmail.send); signed `state` + nonce cookie; tokens in Prisma `GoogleToken` (AES-256-GCM via SESSION_SECRET), auto-refresh,
  revoke on disconnect. `connectGmail` / `connectChannel("google")` return `{ redirect }` to Google's consent page; back at Settings
  (`?connected=` / `?oauth_error=`, `settings/oauth-return.tsx`). With the client set, even demo mode uses the real Google account:
  Gmail sends for real (`src/lib/google/gmail.ts`), the Google location picker lists real Business Profiles (`src/lib/google/business.ts`,
  quota-0 / API-disabled errors explained). Profile data itself is still mock until `google.ts` is implemented (GBP_DATA_SOURCE=google).

- Legal pages (public, no sign-in; excluded in middleware): `/privacy` and `/terms` in `src/app/(legal)/` (shared `legal.tsx`: `LEGAL`
  product / homepage / contact email / date, `Section`, `LegalLinks`). The Privacy Policy carries Google's required Limited Use statement
  and describes each scope (business.manage, gmail.send, webmasters.readonly) — keep it in sync when scopes change. Linked from the login
  page and the Sign up agreement line; these URLs go on the Google OAuth consent screen (Branding).

## Architecture
- **Workspaces (multi-tenant SaaS) — never break this.** Every signed-in person works in exactly one workspace: the one they were
  invited to, or their own, created on first sign-in (they're its admin). `src/lib/gbp/tenancy.ts` (directory email → workspace,
  `workspaceIdFor`, `resolveTenant`, `forEachWorkspace`, `tenantForInvite`, `assignUserWorkspace`, migration of the old shared
  workspace) + `tenant-context.ts` (AsyncLocalStorage). `getProvider()` binds every call to the caller's workspace and saves it
  (`AppState "workspace:<id>"`); mock.ts state is a per-workspace view (`current()`), and in live mode a call outside a workspace
  throws instead of falling back to shared data. Google tokens are keyed `<workspace id>:gbp|gmail` (oauth.ts `tokenKey`); the OAuth
  callback, invite page, cron (`forEachWorkspace`) and `after()` jobs run inside the right workspace explicitly. Platform store:
  `currentWorkspaceId()` is async and per workspace (offers, meetings); real workspaces appear in Admin → Workspaces; suspended
  workspaces are blocked in the app layout. Anything new that stores workspace data must go through the provider (or take the
  workspace id) — never module-level state. Demo with sign-in: each user gets their own in-memory copy of the sample data.
- `src/lib/gbp/types.ts` — domain types and the `GbpProvider` interface. **All data access goes through `getProvider()`** (`src/lib/gbp/index.ts`).
  - `mock.ts` — demo data (default, `GBP_DATA_SOURCE=mock`), kept on `globalThis`. Resets on server restart. Also the workspace
    provider in live mode: there it starts empty (`liveMode()`, `emptyState()`) and its `workspace` state is loaded from SQLite.
  - `live.ts` — live mode (`GBP_DATA_SOURCE=google`): `createLiveProvider()` = mock's workspace methods + real Google APIs for the
    picked locations (connection targets `accounts/{a}/locations/{l}`): locations (Business Information, 15 min cache, merged in
    place so Google-less fields like products/attributes/photos stay ours), reviews + replies (v4, 10 min), insights (Performance API,
    6 h), keywords (monthly, 12 h), profile edits (PATCH with updateMask; categories looked up via categories.list), Google posts
    (v4 localPosts; other channels fail honestly), photos (v4 `media` + `media/customers`, 30 min, refreshed in `listLocations`; Google
    categories mapped via `MEDIA_CATEGORY`, `Photo.googleName` for PATCH category / DELETE, `fromCustomer` photos are read-only; `Photo.views` = media `insights.viewCount` when Google returns it (viewer row, tile badge,
    "Most viewed" sort — all hidden when Google sends no count);
    photos uploaded in the app stay local until upload-to-Google is built; load errors show as a "photos" sync issue on the audit page). A Proxy saves the workspace after every call (`persist.ts` → `AppState` table).
    Access: `liveMember()` — the signed-in person's member record in their own workspace (invites are accepted on sign-in). No locations → `resolveLocation` redirects to `/welcome` (connect Google → pick profiles);
    Settings works without a location. Full profile sync (no guessing): attributes from Business Information `locations/{l}/attributes` + Google's attribute list for
    the profile (`attributes?parent=` — no languageCode with parent, Google rejects it; cached a day) → `Location.attributeCatalog` / `attributeValues` (More tab renders Google's
    groups/labels/types: yes/no/—, choice, multi-choice, link), social links / booking / chat (WhatsApp, text) are URL attributes;
    extra hours (`moreHours`, keeps `typeId`), services keep `serviceTypeId` + `currencyCode`. Saves go to Google: attributes PATCH with
    `attributeMask`, address (`storefrontAddress`), holiday hours (`specialHours`), services (`serviceItems`), extra hours; the profile is
    re-read after every PATCH. Products aren't in Google's API: `notInApi: ["products"]` → audit skips product checks, Products tab says
    so. Service area / hide address edits are refused with "change it on Google" (Google needs place ids). Not real yet: uploading new photos to Google, attributes/services push, Search Console, Facebook/
    Instagram/LinkedIn/X publishing, Google returns quota 0 until the Cloud project's
    GBP API access is approved (`gbpErrorMessage`).
  - `google.ts` — older stub provider kept for its endpoint notes; not used.
- `src/lib/posts.ts` — multi-channel post model (Google / Facebook / Instagram / LinkedIn / X), ported from TasksBook's
  `lib/marketing.ts`: `PostDraft`, `validatePost` (shared by composer and server actions), per-channel text/media rules.
  Posts are workspace-wide; `google.locations` ([] = all) decides which locations' calendars show them.
- `src/components/marketing/` — `post-composer.tsx` (two-pane modal + live previews), `post-previews.tsx`,
  `content-board.tsx` (week/month/list calendar, @dnd-kit drag-to-reschedule with undo toast), `channel-icon.tsx`.
  Images are resized client-side and stored as data: URLs until real file storage exists.
  Posts made outside the app: `Post.imported` ({ channel, external_id }) — live mode imports Google local posts (`importGooglePosts`,
  v4 localPosts, 30 min, per location; skips posts whose id is in an app post's `results.google.external_ids`, which publish now records);
  demo seeds imported posts for every network. Read-only in the composer ("Imported" pill + note), ↓ marker on calendar chips.
  Performance (`post-performance.tsx`, shown for published posts): `Post.stats` per channel (`PostStats`: views, reach, clicks, likes,
  comments, shares, saves — filled when Facebook/Instagram/LinkedIn/X sync is real; demo has numbers), list view "Performance" column via
  `postEngagement`. Only networks whose API reports per-post stats are shown (`STATS_CHANNELS`, `postStatChannels`); Google isn't: its per-post views
  are only in Google's own dashboard (back since Sept 2026), not its API. Product rule: performance is never typed in or estimated —
  if a network can't report it automatically, don't show it. Add Google when its API exposes post views.
- `src/lib/audit.ts` — section-by-section profile audit (basics, categories, description, hours, services, attributes, photos,
  reviews, activity). Each check has points; "warn" earns half; score = earned/max. Pass posts in so scores match across pages.
- `src/lib/profile.ts` — Google limits, attribute labels, suggested-description template. Suggestions (secondary categories,
  website/market services, products, attributes) come from `provider.getProfileSuggestions()`; the audit page edits via `updateProfile`.
  Audit page (`src/components/audit/`): `audit-board.tsx` (header, StatStrip, tabs via `?tab=` / `AUDIT_TABS`, numbered checklist with
  dismiss → localStorage). Tabs mirror Google's Business information editor; audit sections = tabs (about, contact, location, hours,
  more, services, products, photos). `fields.tsx` = Google-style field rows (value → click → inline editor, one at a time) for
  About/Contact/Location/Hours/More; `editors.tsx` = services/products (modals with all Google fields); `photos-panel.tsx` =
  logo/cover/gallery upload (`Location.photos`, Google media categories; provider `addPhotos/updatePhoto/deletePhoto`, counts derived);
  attributes catalogue is `ATTRIBUTE_GROUPS` in `profile.ts`; days can have several `regularHours` periods (split shifts).
  `profile-preview.tsx` (Google Maps phone mock, shows unsaved drafts; Checklist tab only), `guide-panel.tsx` (right column on
  editor tabs: recommended / avoid / example for the open field) — examples come from this profile's own data (services, hours, links, Google's unanswered
  attributes); with nothing set, a neutral format hint — never another business or a fixed city, `shared.tsx`. Services are `ServiceItem[]` (category, price type,
  price, description); `Location.products` is optional `Product[]`.
- Settings has tabs via `?tab=` (page owns PageHeader + PillTabs): `accounts` (connections-board, Data sources), `email`
  (`settings/email-settings.tsx`: Gmail sender — provider `getEmailSender/connectGmail/updateEmailSender/disconnectGmail/sendEmail`,
  gmail.send scope, daily limit), `templates` (`settings/templates-board.tsx`: request email / text / review-reply templates,
  `src/lib/templates.ts` = kinds, merge fields `{{name}} {{full_name}} {{business}} {{link}}`, `mergeTemplate`, `replyFor`, starter set;
  provider `listTemplates/saveTemplate/deleteTemplate`, one default per kind). Reviews uses them: the reply dialog's Templates menu
  (best match for the rating first) and Request a review (template picker, editable subject/body, "Send email" through Gmail when
  connected — `createReviewRequest({ viaGmail })` — else mailto/sms/copy). Account rows share `settings/account-grid.tsx`.
- Facebook Page + Instagram (real when `META_APP_ID/SECRET/LOGIN_CONFIG_ID` are set, demo or live): `src/lib/meta/oauth.ts` — Facebook
  Login for Business with our configuration (`config_id`), callback `src/app/api/oauth/meta/callback` (`META_REDIRECT_URI`), long-lived
  user token + Page tokens (with linked Instagram business accounts) stored encrypted per workspace in the token table
  (`<ws>:meta`, `<ws>:meta:pages`; `seal/open` from google/oauth.ts), `graph()` with readable errors (190 = expired → reconnect).
  Provider (mock.ts): Facebook/Instagram rows follow the token, options = real Pages / linked Instagram accounts, disconnecting the last of
  the two revokes access, `publishMeta()` → `src/lib/meta/publish.ts`: Facebook feed / photo (direct upload of data: URLs) / multi-photo
  (unpublished photos + attached_media) / video, Instagram image / carousel / Reel (container → wait FINISHED → media_publish), optional
  first comment, permalink + id in `results[ch]`. Instagram needs public media links: `src/lib/public-media.ts` saves data: URLs beside
  the DB (`media/`, random 48-hex names) served by `/api/media/[file]` at `APP_URL` — refuses on localhost. Webhooks / App Review: later.
- `src/lib/connections.ts` + Settings (`src/components/settings/connections-board.tsx`) — connected accounts for Google,
  Facebook, Instagram, LinkedIn and X (connect → pick locations/Page/account → sync/disconnect). Demo mode simulates OAuth;
  live mode needs each network's app keys (see `.env.example`). `getConnectedChannels()` derives from connections.
- Users (`src/app/(app)/users`, `src/components/users/users-board.tsx`) — workspace members with roles `admin` (everything,
  incl. Settings and Users) or `member` (assigned locations only; `locationIds: []` = all). Invite by email → shareable
  `/invite/[token]` link (no email service yet). Server actions guard: admins only, can't remove yourself or the last admin.
  Roles are NOT enforced on other pages yet — wire `getCurrentMember()` into the provider/pages when real sign-in lands.
- Ranking (`src/app/(app)/ranking`, `src/components/ranking/`) — Google Search Console only, for every profile (no keyword tracking /
  DataForSEO): `search-console-board.tsx` shows avg position, clicks, impressions, CTR per query, `?range=` with a 2-day data lag via `scRange`
  in `src/lib/search-console.ts`. Query detail `/ranking/search?q=…` (`search-query-detail.tsx`, provider `getSearchConsoleQuery`): metric
  chart, pages, devices, by-day table; rows link there with `queryHref`. Search Console is connected in Settings → Data sources
  (`settings/search-console-card.tsx`: Connect with Google → choose a property per location); provider `getSearchConsole/
  connectSearchConsole/listSearchConsoleProperties/setSearchConsoleSites/getSearchConsoleReport`. Demo simulates it. Live (live.ts): its own OAuth purpose
  `searchconsole` (`webmasters.readonly`, token `<workspace>:searchconsole`) — Connect → Google consent → back at
  `/settings?pick=searchconsole#search-console`, which opens the website picker; properties from `webmasters/v3/sites` (verified only),
  websites auto-matched to locations (URL-prefix, then `sc-domain:`); reports via `searchAnalytics/query` (query / date / totals, previous
  period for compare; detail = query `equals` filter with date / page / device), `dataState: "final"`. Errors (API not enabled in the Cloud
  project, access removed) show on the Ranking page. Needs the "Google Search Console API" enabled and the scope on the OAuth consent screen.
- Competitors (`src/app/(app)/competitors`, `src/components/competitors/competitors-board.tsx`) — this profile (pinned "You" row, its own
  reviews/rating from `listReviews`) next to nearby businesses with the same main category from provider `listCompetitors` (`Competitor`:
  name, address, distance, primary + sub-categories, rating, review count, website). Sortable table (stacked cards below `lg`), stat strip
  (`competitor-stats.tsx`: rating, reviews, new reviews in 30 days — value, gap-to-average pill, "Nearby avg"; missing categories with Add → scrolls to the categories card), and "Categories nearby businesses use": + adds a missing one straight to the profile's
  additional categories (`updateProfile`, max 9, undo toast); "Manage categories" → audit About tab. Your row always stays on top of the sort.
  `src/lib/competitors.ts` `categoryUsage()` is shared with the audit: the Business category guide (`guide-panel.tsx`) lists "Used by nearby
  competitors" with + that adds to the open CategoryEditor's draft (via `ctx.categoryRequest`; Save still saves).
  Add / remove (no Places API key): "Add competitor" (`add-competitor-dialog.tsx` → `CompetitorDialog`) step 1 = paste the competitor's
  Google Maps link → `readMapsLink(locationId, link)`: `src/lib/maps-link.ts` parses it (name, coords, cid from ?cid= / ftid; short links
  followed) and `src/lib/maps-scrape.ts` reads the public profile WITHOUT an API key — the Maps page's preload `/maps/preview/place?…pb=`
  feed (cid links go via `maps?cid=`), else the `/search?tbm=map&q=` feed (works only for specific name + address queries; retries Google's
  spelling). Same array layout: [11] name, [13] categories, [39] address, [4][7] rating, [4][8] reviews, [7][0] website, [9][2..3] lat/lng,
  [10] ftid, [78] place id. Distance = haversine from this profile's coords (`lookupCoords`, cached). Unofficial scraping (against Google's
  ToS, format can change) → null falls back to the manual form. Step 2 = check / edit the filled form → `addCompetitor(locationId, input)`.
  Edit has "Refresh from Google" (re-reads the link).
  Max `MAX_COMPETITORS` (10) added per business (enforced in the provider; button shows n/10). Daily check: `src/lib/competitor-refresh.ts`
  `refreshCompetitors()` re-reads every added competitor's link older than 20 h (one at a time, 2.5–6 s apart, one retry, backs off 6 h
  after 3 failures in a row) → provider `recordCompetitorCheck` (rating, reviews, `checkedAt`, `checkError`, `history` one point/day via
  `addPoint`). Runs from `/api/cron/refresh-competitors` (Bearer `CRON_SECRET`; call daily) and via `after()` when the Competitors page
  is opened; "Check now" (`checkCompetitorsNow`) forces it. Table shows review change /7d and rating change /30d (`changeOver`).
  "Review growth" chart above the table (`review-growth-chart.tsx`, recharts): one line per business from `history` (yours = `reviewHistory()`
  from your review dates; demo found competitors get generated history in mock), Total (default) / Growth (reviews gained in range), the Performance page's `DateRangePicker` (default last 30 days), and a
  Competitors multi-select (default you + top 4 by reviews, max 8 lines; colours `--viz-1..8`, assigned to the lines on screen).
  Row ⋯: Edit details (`updateCompetitor`, added ones), Open in Google Maps, Remove (added → `deleteCompetitor` + undo re-add;
  found → `setCompetitorHidden`, "removed competitors" list with Restore). `Competitor.source` found | added, `hidden`, `mapsUrl`, `cid`,
  `distanceKm` null when unknown. Per location; mock keeps edits in `state.competitorEdits`. Mock found list = `COMPETITOR_SEEDS`.
- Tasks (`src/app/(app)/tasks`, `src/components/tasks/`, `src/lib/tasks.ts`) — workspace tasks with subtasks (`Task.parentId`), stage
  (todo / in_progress / in_review / done), priority, assignee (member id), due date, location (null = all). Views via `?view=`: list
  (`task-list.tsx`), Kanban (`task-kanban.tsx`, @dnd-kit/sortable, `order` floats via `orderBetween`), calendar (`task-calendar.tsx`, drag to
  reschedule / "No due date" tray). `task-dialog.tsx` creates/edits (subtasks with assignee + due). Review follow-ups are created
  automatically for unhappy reviews (`needsFollowUpTask`, `source.type = "review"`); Done resolves the review's follow-up; deleting one
  dismisses it. Audit checklist items have "Add task" (`audit/check-task-dialog.tsx`, `createTask({ auditCheckId })` →
  `source.type = "audit"`); the row then shows the assignee + stage, and the task is marked done once the check passes (mock `listTasks`).
  List view has column headers (Task / Priority / Due date / Assignee) from `lg` up. Mock keeps tasks in memory; google provider stubs → move to Prisma. `/tasks?task=<id>` opens a task; `/reviews?review=<id>` opens a review.
- Platform admin panel (`src/app/admin/`, own shell `components/admin/admin-shell.tsx`, not in the app sidebar) — for the people running
  the platform. Guarded by `platformAdmin()` in `src/lib/admin.ts` (`PLATFORM_ADMIN_EMAILS`; local demo runs = everyone, production builds
  never); non-admins get a 404. Linked from the account menu for admins. Pages: Overview, Workspaces (+ `/admin/workspaces/[id]`:
  suspend/reactivate, profiles, members, notes, delete), Integrations (env checklist,
  `src/lib/platform/setup.ts` — the developer setup lives here, not in Settings), Announcements (banner in the app shell, one live at a time,
  `components/announcement-banner.tsx`), Offers (service promos like managed Local SEO: title, info, price, button → every workspace's Dashboard
  `components/offer-card.tsx`; no plans or billing — the app is free; the button opens a booking form (date + weekday
  time slots `MEETING_SLOTS`, no double-booking via `takenSlots`) → `bookOffer` → a meeting lead booked/met/won/lost; views/clicks counted once per
  browser session via `trackOffer`; timing per offer: first shown `startAfterDays` (7) after the workspace signs up, then daily until
  the workspace closes it (✕ → `dismissOffer`, stored server-side per workspace) and again `snoozeDays` (7) later — `offerHiddenReason`;
  workspace admin page shows each offer's state + "Show again now";
  meetings: admin detail dialog (`admin/meeting-dialog.tsx`: time + client's time zone, reschedule, Google Meet link via
  `src/lib/platform/meet.ts` — demo = sample link, live = Calendar API event with Meet, needs `calendar.events` scope — or pasted; "Send to client"
  sets `meetSharedAt`), private `adminNote` (never sent to the client). Client Dashboard swaps the offer card for `meeting-card.tsx`
  (time, Join Google Meet once sent, Request new time, Request to cancel); clients can't move or cancel a meeting themselves:
  `requestMeetingTime` → `changeRequest` / `requestMeetingCancel` → `cancelRequest` (one open request at a time, `withdrawMeetingRequest`);
  admin Accept/Decline in the meeting dialog (`answerMeetingTimeRequest` / `answerMeetingCancelRequest` → `changeAnswer` / `cancelAnswer`;
  an accepted cancel sets `cancelled` and snoozes the offer). One meeting per slot: `clashes()`
  in the store checks booked times and pending requests (± meeting length) on book, request and admin move. Admin can delete meetings (`deleteMeeting`); it's a reminder: ✕ (`closeMeetingReminder`) hides it until
  1 hour before the meeting or a new link is sent (`meetingReminderVisible`); admin shows a seen → clicked → booked → met → won funnel per offer + upcoming meetings), Activity log. Data: `src/lib/platform/` (`types.ts`, `store.ts` in memory on globalThis; the current
  workspace's profiles/members/quotas come live from the GBP provider) → move to Prisma with billing. Actions: `src/app/admin/actions.ts`
  (`asAdmin` guard + activity log entry for every change).
- `src/app/(app)/` — feature pages sharing the sidebar layout: `dashboard`, `performance`, `reviews`, `calendar` (Content), `ranking`, `competitors`, `audit`, `locations`, `users`, `settings`, `profile`, `tasks`.
- Page state lives in the URL (`?location=`, `?range=`, `?series=`, `?filter=`, `?view=`, `?compose=1`) so pages stay Server Components.
- `src/app/(app)/actions.ts` — server actions (reply, create post, apply audit fixes). Validate with zod.
- Selected location is in the URL: `?location=locations/123`. Use `resolveLocation(searchParams)` from `src/lib/location.ts`.

## Design
Brand: app name **GBPNinja** (`APP_NAME`). `src/components/brand.tsx`: `BrandLogo` (wordmark; `public/brand/logo-light.webp` / `logo-dark.webp`,
swapped by `.dark`; height via className, sidebar `h-11`) and `BrandMark` (`public/brand/mark.png`, collapsed sidebar). Favicon = `src/app/icon.png`
(transparent mark), home-screen icon = `src/app/apple-icon.png`. Page titles use the `%s · GBPNinja` template in the root layout.
The UI matches the **TasksBook CRM marketing section** (shadcn/ui look, ported to Tailwind v4 without Radix):
- Gray page `bg-background`, white `bg-card` panels with `rounded-xl border`, ONE accent blue `primary` (#3D5BE0).
  Active/selected = `bg-accent text-accent-foreground`. Status colours: `success`, `warning`, `destructive`, `info`.
- Never hard-code colours — use tokens. Charts use `var(--viz-1..8)`. Dark mode via `.dark` class (top-bar toggle).
- Font: Plus Jakarta Sans. Small uppercase field/column labels use the `label-caps` utility.
- App shell (`src/components/app-shell.tsx`): collapsible left sidebar (location switcher card, grouped nav with badges,
  user footer), sticky 56px top bar, mobile drawer. Add new pages to `sections` there.
  Phones (< md): bottom tab bar (`BottomNav`/`bottomItems`: Home, Reviews, Content, Tasks, More → sliding drawer), `<main>` pads for it,
  safe-area insets via `viewport-fit=cover`. `Modal` is a bottom sheet on phones, centred from `sm`.
- Responsive rules: wide tables get a stacked card list below the width they need (`lg:` / `xl:` for 760–960px tables) instead of
  sideways scrolling; `PanelHeader` wraps its actions below the title when narrow. Check pages at 375 / 768 / 1024 / 1440. Account pages (My profile `/profile`,
  Locations, Users, Settings — the last two admin-only) live in the user-card menu (`accountItems`, `AccountMenu`), with Sign out
  (`signOutAction`; no-op message in demo). My profile (`components/profile/profile-board.tsx`): photo upload (square 256px data: URL in
  `Member.avatarUrl`, falls back to `googleAvatarUrl` from Google sign-in, then initials), name, password (`changePassword` /
  `sendPasswordReset` provider methods; mock hashes with scrypt in memory; live needs Auth.js Credentials + an email service).
- Building blocks in `src/components/ui.tsx`: `PageHeader`, `Card`, `PanelHeader`, `StatStrip`, `PillTabs`, `Badge`,
  `buttonClass()`, `inputClass`, `Field`, `Stars`, `StarBars`, `Avatar`, `EmptyState`. Reuse them; page pattern is
  `PageHeader` → `StatStrip` → `Card` panels with `PanelHeader`, inside `space-y-5 pb-8`.

## Conventions
- Server Components by default; add `"use client"` only for interactivity (charts, pickers).
- Mutations via server actions + `revalidatePath`, not API routes (API routes only for auth/webhooks/cron).
- Keep the mock provider in sync with any new `GbpProvider` method so the app always runs without credentials.
- Never commit `.env*` files or real tokens.
- Overlays (dialogs, drag previews) go through a portal on `<body>`; never leave a `transform` on `<main>` (it traps `position: fixed`).
- Toasts: `sonner` (`toast.success/error`), mounted in the root layout.
- Every `<img>` showing a photo from data (Google photos `lh3.googleusercontent.com`, post media, logos) needs `referrerPolicy="no-referrer"`:
  Google refuses those images when the browser sends our site as the referrer. (Not site-wide: Firebase API keys can be referrer-restricted.)

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
