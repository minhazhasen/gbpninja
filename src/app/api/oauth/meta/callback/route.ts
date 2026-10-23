// Facebook Login for Business redirect (META_REDIRECT_URI, registered in the Meta app under Valid OAuth Redirect URIs).
// Stores the tokens for the signed-in person's workspace, then back to Settings, where the Page / Instagram picker opens.
import { NextResponse, type NextRequest } from "next/server";
import { getProvider } from "@/lib/gbp";
import { resolveTenant } from "@/lib/gbp/tenancy";
import { runInTenant } from "@/lib/gbp/tenant-context";
import { finishMetaAuth } from "@/lib/meta/oauth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenant = await resolveTenant();
  const r = tenant ? await runInTenant(tenant, () => finishMetaAuth(url)) : await finishMetaAuth(url);
  const back = new URL(r.returnTo, url);
  if (r.error) back.searchParams.set("oauth_error", r.error);
  else {
    await (await getProvider()).connectChannel(r.channel, r.name ?? null);
    back.searchParams.set("connected", r.channel);
  }
  return NextResponse.redirect(back);
}
