# Google OAuth: getting rid of the "unverified app" warning

GBPNinja no longer asks for Gmail (`gmail.send` was removed in Nov 2026). The Google permissions it requests now are not
"sensitive" in Google's console, so no scope review or demo video is needed — only **brand verification** (name, logo, domain,
privacy policy), which Google usually approves in a few business days.

| Scope | Purpose key (`src/lib/google/oauth.ts`) | Where the user connects it |
| --- | --- | --- |
| `https://www.googleapis.com/auth/business.manage` | `gbp` | `/welcome` → Connect Google, or Settings → Accounts → Google Business Profile |
| `https://www.googleapis.com/auth/webmasters.readonly` | `searchconsole` | Settings → Data sources → Google Search Console → Connect with Google |

Sign-in ("Login with Google" through Firebase) uses only `openid email profile`.
**Don't add another scope** (for example `gmail.send` or `calendar.events`, mentioned in `src/lib/platform/meet.ts`) without checking
whether Google marks it sensitive: that brings back the full review with scope justifications and a demo video.

## 1. Remove Gmail from the console

1. Google Auth Platform → **Data access** → delete `.../auth/gmail.send` (trash icon) → **Save**. The "Your sensitive scopes" section
   should now be empty.
2. APIs & Services → **Enabled APIs** → Gmail API → **Disable** (optional; nothing calls it any more).
3. Deploy this version. On start it revokes any Gmail tokens workspaces saved earlier (`revokeRetiredGoogleTokens`).

## 2. Before you submit

- [ ] `gbpninja.com` verified in [Google Search Console](https://search.google.com/search-console) by an account that is an **Owner** of
      the Cloud project (Add property → Domain → add the TXT record in cPanel → Zone Editor → Verify).
- [ ] `https://gbpninja.com` loads publicly, says what GBPNinja does, and links to the Privacy Policy and Terms.
- [ ] `https://app.gbpninja.com/privacy` and `/terms` load without sign-in and are deployed with this version (Gmail removed from the text).
- [ ] OAuth client → **Authorized redirect URIs**: keep `https://app.gbpninja.com/`; remove `localhost` (use a separate client for local work).
- [ ] Logo: square PNG, 120 × 120 px, under 1 MB (the ninja pin mark only).

## 3. Branding (Google Auth Platform → Branding)

| Field | Value |
| --- | --- |
| App name | `GBPNinja` |
| User support email | `support@gbpninja.com` |
| App logo | ninja pin mark, 120 × 120 |
| Application home page | `https://gbpninja.com` |
| Privacy policy link | `https://app.gbpninja.com/privacy` |
| Terms of service link | `https://app.gbpninja.com/terms` |
| Authorized domains | `gbpninja.com` |
| Developer contact | `support@gbpninja.com` (replaces the personal address on the warning screen) |

## 4. Publish and verify

1. Google Auth Platform → **Audience** → **Publish app** (status "In production").
2. **Verification center** → if it offers **Verify branding** / **Prepare for verification**, submit it. With no sensitive scopes there is
   nothing else to fill in.
3. Watch `support@gbpninja.com` for Google's email and answer in the same thread.

Until branding is verified, users may still see the warning; they can continue with **Advanced → Go to GBPNinja (unsafe)**.

## If a scope is ever flagged sensitive again

Google then asks, per scope, "How will the scopes be used?" (up to 1,000 characters) and an unlisted YouTube demo video that shows the
consent screen with the client ID in the address bar and the app using each scope. Write the justification as: what the feature does,
that the app only acts when the user clicks, why a narrower scope isn't enough, and how to disconnect.
