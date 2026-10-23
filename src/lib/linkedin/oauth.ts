// LinkedIn connection: "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" (scopes openid profile email
// w_member_social) — people post as themselves (their profile). Company Pages need LinkedIn's Community Management API (separate
// approval), not wired yet. Tokens last ~60 days and aren't refreshable for most apps: the connection shows the expiry and the user
// reconnects. Stored encrypted per workspace as "<workspace>:linkedin" (email = name, name = member id).
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { currentTenant } from "@/lib/gbp/tenant-context";
import { open, seal } from "@/lib/google/oauth";

const STATE_COOKIE = "gbpn_li_oauth";
const SCOPES = "openid profile email w_member_social";

export const linkedinConfigured = () => !!process.env.LINKEDIN_CLIENT_ID && !!process.env.LINKEDIN_CLIENT_SECRET && !!process.env.SESSION_SECRET;
const redirectUri = () => process.env.LINKEDIN_REDIRECT_URI || "http://localhost:3001/api/oauth/linkedin/callback";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET);
const key = () => {
  const t = currentTenant();
  return t ? `${t.id}:linkedin` : "linkedin";
};

export async function linkedinAuthUrl(returnTo: string) {
  const nonce = randomBytes(16).toString("base64url");
  const state = await new SignJWT({ returnTo, nonce }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("15m").sign(secret());
  (await cookies()).set(STATE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 900 });
  const p = new URLSearchParams({ response_type: "code", client_id: process.env.LINKEDIN_CLIENT_ID!, redirect_uri: redirectUri(), state, scope: SCOPES });
  return `https://www.linkedin.com/oauth/v2/authorization?${p}`;
}

export async function finishLinkedinAuth(url: URL): Promise<{ returnTo: string; name?: string; error?: string }> {
  let returnTo = "/settings?tab=accounts";
  try {
    const { payload } = await jwtVerify(url.searchParams.get("state") ?? "", secret(), { algorithms: ["HS256"] });
    returnTo = typeof payload.returnTo === "string" && payload.returnTo.startsWith("/") && !payload.returnTo.startsWith("//") ? payload.returnTo : returnTo;
    const jar = await cookies();
    const nonce = jar.get(STATE_COOKIE)?.value;
    jar.delete(STATE_COOKIE);
    if (!nonce || nonce !== payload.nonce) return { returnTo, error: "The LinkedIn sign-in expired. Try connecting again." };
  } catch {
    return { returnTo, error: "The LinkedIn sign-in expired. Try connecting again." };
  }
  const denied = url.searchParams.get("error");
  if (denied)
    return {
      returnTo,
      error:
        denied === "user_cancelled_login" || denied === "user_cancelled_authorize"
          ? "LinkedIn access wasn't granted."
          : `LinkedIn returned an error (${url.searchParams.get("error_description") ?? denied}).`,
    };

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: url.searchParams.get("code") ?? "",
      redirect_uri: redirectUri(),
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  });
  const tok = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string; error_description?: string };
  if (!res.ok || !tok.access_token) return { returnTo, error: tok.error_description ?? "LinkedIn didn't accept the sign-in. Try again." };
  if (!(tok.scope ?? "").includes("w_member_social")) return { returnTo, error: "LinkedIn didn't grant posting access. Add “Share on LinkedIn” to the app's Products, then connect again." };

  const me = (await (await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } })).json().catch(() => ({}))) as { sub?: string; name?: string };
  if (!me.sub) return { returnTo, error: "Couldn't read your LinkedIn profile. Try again." };
  const data = {
    email: me.name ?? "LinkedIn member",
    name: me.sub,
    scope: tok.scope ?? "",
    accessToken: seal(tok.access_token),
    refreshToken: tok.refresh_token ? seal(tok.refresh_token) : null,
    expiresAt: new Date(Date.now() + (tok.expires_in ?? 60 * 86_400) * 1000),
  };
  await db.googleToken.upsert({ where: { purpose: key() }, create: { purpose: key(), ...data }, update: data });
  return { returnTo, name: data.email };
}

/** The connected LinkedIn member (null when not connected / not set up). */
export async function linkedinAccount() {
  if (!linkedinConfigured()) return null;
  try {
    const t = await db.googleToken.findUnique({ where: { purpose: key() } });
    return t ? { name: t.email, memberId: t.name ?? "", connectedAt: t.createdAt.toISOString(), expiresAt: t.expiresAt.toISOString() } : null;
  } catch {
    return null;
  }
}

export async function linkedinToken(): Promise<string> {
  const t = await db.googleToken.findUnique({ where: { purpose: key() } });
  if (!t) throw new Error("Connect LinkedIn in Settings → Accounts first");
  if (t.expiresAt.getTime() < Date.now()) throw new Error("LinkedIn access expired (it lasts 60 days). Reconnect LinkedIn in Settings → Accounts.");
  return open(t.accessToken);
}

/** Revoke at LinkedIn and forget the token. */
export async function disconnectLinkedin() {
  const t = await db.googleToken.findUnique({ where: { purpose: key() } });
  if (!t) return;
  await fetch("https://www.linkedin.com/oauth/v2/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: open(t.accessToken), client_id: process.env.LINKEDIN_CLIENT_ID!, client_secret: process.env.LINKEDIN_CLIENT_SECRET! }),
  }).catch(() => {});
  await db.googleToken.delete({ where: { purpose: key() } });
}
