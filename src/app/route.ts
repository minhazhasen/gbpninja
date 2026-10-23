// "/" — the Google OAuth redirect URI registered on the OAuth client (GOOGLE_REDIRECT_URI). Google's callback (?code&state)
// finishes connecting Gmail / Business Profile and returns to Settings; any other visit goes to the dashboard.
import { NextResponse, type NextRequest } from "next/server";
import { finishGoogleAuth, isOAuthCallback } from "@/lib/google/oauth";
import { getProvider } from "@/lib/gbp";
import { resolveTenant } from "@/lib/gbp/tenancy";
import { runInTenant } from "@/lib/gbp/tenant-context";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!isOAuthCallback(url)) return NextResponse.redirect(new URL("/dashboard", url));

  // The tokens are stored for the signed-in person's workspace only.
  const tenant = await resolveTenant();
  const r = tenant ? await runInTenant(tenant, () => finishGoogleAuth(url)) : await finishGoogleAuth(url);
  const back = new URL(r.returnTo, url);
  if (r.error) back.searchParams.set("oauth_error", r.error);
  else {
    // Mark the account connected; Business Profile then asks which locations to manage.
    if (r.purpose === "gbp") await (await getProvider()).connectChannel("google", r.email ?? null);
    if (r.purpose === "gmail") await (await getProvider()).connectGmail(r.email ?? null);
    if (r.purpose === "searchconsole") await (await getProvider()).connectSearchConsole(r.email ?? null);
    back.searchParams.set("connected", r.purpose === "gbp" ? "google" : (r.purpose ?? "google"));
  }
  return NextResponse.redirect(back);
}
