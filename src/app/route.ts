// "/" — the Google OAuth redirect URI registered on the OAuth client (GOOGLE_REDIRECT_URI). Google's callback (?code&state)
// finishes connecting Gmail / Business Profile and returns to Settings; any other visit goes to the dashboard.
import { NextResponse, type NextRequest } from "next/server";
import { finishGoogleAuth, isOAuthCallback } from "@/lib/google/oauth";
import { getProvider } from "@/lib/gbp";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!isOAuthCallback(url)) return NextResponse.redirect(new URL("/dashboard", url));

  const r = await finishGoogleAuth(url);
  const back = new URL(r.returnTo, url);
  if (r.error) back.searchParams.set("oauth_error", r.error);
  else {
    // Mark the account connected; Business Profile then asks which locations to manage.
    if (r.purpose === "gbp") await (await getProvider()).connectChannel("google", r.email ?? null);
    if (r.purpose === "gmail") await (await getProvider()).connectGmail(r.email ?? null);
    back.searchParams.set("connected", r.purpose === "gbp" ? "google" : "gmail");
  }
  return NextResponse.redirect(back);
}
