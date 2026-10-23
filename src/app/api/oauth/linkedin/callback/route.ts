// LinkedIn sign-in redirect (LINKEDIN_REDIRECT_URI, listed in the LinkedIn app → Auth → Authorized redirect URLs).
// Stores the token for the signed-in person's workspace, then back to Settings to confirm the profile to post as.
import { NextResponse, type NextRequest } from "next/server";
import { publicUrl } from "@/lib/public-url";
import { getProvider } from "@/lib/gbp";
import { resolveTenant } from "@/lib/gbp/tenancy";
import { runInTenant } from "@/lib/gbp/tenant-context";
import { finishLinkedinAuth } from "@/lib/linkedin/oauth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenant = await resolveTenant();
  const r = tenant ? await runInTenant(tenant, () => finishLinkedinAuth(url)) : await finishLinkedinAuth(url);
  const back = publicUrl(r.returnTo, req);
  if (r.error) back.searchParams.set("oauth_error", r.error);
  else {
    await (await getProvider()).connectChannel("linkedin", r.name ?? null);
    back.searchParams.set("connected", "linkedin");
  }
  return NextResponse.redirect(back);
}
