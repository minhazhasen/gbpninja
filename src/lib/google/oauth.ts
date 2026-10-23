// Google OAuth for connecting accounts (not app sign-in — that's Firebase): Gmail (gmail.send) and Google Business Profile
// (business.manage). Authorization-code flow with offline access; tokens are stored per purpose in Prisma (`GoogleToken`),
// encrypted, and refreshed on demand. The redirect URI (GOOGLE_REDIRECT_URI, default "<origin>/") is handled by src/app/route.ts.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { currentTenant } from "@/lib/gbp/tenant-context";

export type GooglePurpose = "gbp" | "gmail" | "searchconsole";

const SCOPES: Record<GooglePurpose, string[]> = {
  gbp: ["https://www.googleapis.com/auth/business.manage"],
  gmail: ["https://www.googleapis.com/auth/gmail.send"],
  searchconsole: ["https://www.googleapis.com/auth/webmasters.readonly"],
};
const BASE_SCOPES = ["openid", "email", "profile"];
const STATE_COOKIE = "gbpn_oauth";

export const googleOAuthConfigured = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && !!process.env.SESSION_SECRET;
const redirectUri = () => process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET);

/** Tokens belong to a workspace: "<workspace id>:gbp". Without one (open demo, no sign-in) the plain purpose is used. */
const tokenKey = (purpose: GooglePurpose) => {
  const t = currentTenant();
  return t ? `${t.id}:${purpose}` : purpose;
};

// ---------------------------------------------------------------- token encryption (AES-256-GCM) — also used for Meta tokens (meta/oauth.ts)
const key = () => createHash("sha256").update(`google-token:${process.env.SESSION_SECRET}`).digest();
export function seal(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}
export function open(sealed: string) {
  const [iv, tag, data] = sealed.split(".").map((s) => Buffer.from(s, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

// ---------------------------------------------------------------- start + callback
/** Google's consent page for `purpose`. A nonce cookie ties the callback to this browser (CSRF). */
export async function googleAuthUrl(purpose: GooglePurpose, returnTo: string) {
  const nonce = randomBytes(16).toString("base64url");
  const state = await new SignJWT({ purpose, returnTo, nonce }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("15m").sign(secret());
  (await cookies()).set(STATE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 900 });
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: [...BASE_SCOPES, ...SCOPES[purpose]].join(" "),
    access_type: "offline",
    // consent: always return a refresh token, even when the account approved this app before.
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/** Is this request Google's redirect back to us? */
export const isOAuthCallback = (url: URL) => url.searchParams.has("state") && (url.searchParams.has("code") || url.searchParams.has("error"));

/** Exchange the code, store the tokens. Returns where to send the user and what happened. */
export async function finishGoogleAuth(url: URL): Promise<{ purpose: GooglePurpose | null; returnTo: string; email?: string; error?: string }> {
  let purpose: GooglePurpose | null = null;
  let returnTo = "/settings";
  try {
    const { payload } = await jwtVerify(url.searchParams.get("state")!, secret(), { algorithms: ["HS256"] });
    purpose = payload.purpose === "gbp" || payload.purpose === "gmail" || payload.purpose === "searchconsole" ? payload.purpose : null;
    returnTo = typeof payload.returnTo === "string" && payload.returnTo.startsWith("/") && !payload.returnTo.startsWith("//") ? payload.returnTo : returnTo;
    const jar = await cookies();
    const nonce = jar.get(STATE_COOKIE)?.value;
    jar.delete(STATE_COOKIE);
    if (!purpose || !nonce || nonce !== payload.nonce) return { purpose, returnTo, error: "The Google sign-in expired. Try connecting again." };
  } catch {
    return { purpose, returnTo, error: "The Google sign-in expired. Try connecting again." };
  }

  const denied = url.searchParams.get("error");
  if (denied) return { purpose, returnTo, error: denied === "access_denied" ? "Google access wasn't granted." : `Google returned an error (${denied}).` };

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code")!,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const tok = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string };
  if (!res.ok || !tok.access_token) return { purpose, returnTo, error: tok.error_description ?? "Google didn't accept the sign-in. Try again." };

  // The permission checkbox on Google's consent page can be left unticked.
  const missing = SCOPES[purpose].filter((s) => !(tok.scope ?? "").split(" ").includes(s));
  if (missing.length)
    return {
      purpose,
      returnTo,
      error:
        purpose === "gmail"
          ? "Tick “Send email on your behalf” on Google's page to connect Gmail."
          : purpose === "searchconsole"
            ? "Tick “View Search Console data for your verified sites” on Google's page to connect Search Console."
            : "Tick “See, edit, create and delete your Google business listings” to connect.",
    };

  const me = (await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } })).json()) as { email?: string; name?: string };
  const existing = await db.googleToken.findUnique({ where: { purpose: tokenKey(purpose) } });
  const data = {
    email: me.email ?? "unknown",
    name: me.name ?? null,
    scope: tok.scope ?? "",
    accessToken: seal(tok.access_token),
    // Google only sends a refresh token on consent; keep the old one if this sign-in didn't include one.
    refreshToken: tok.refresh_token ? seal(tok.refresh_token) : (existing?.refreshToken ?? null),
    expiresAt: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000),
  };
  await db.googleToken.upsert({ where: { purpose: tokenKey(purpose) }, create: { purpose: tokenKey(purpose), ...data }, update: data });
  return { purpose, returnTo, email: data.email };
}

// ---------------------------------------------------------------- use
export async function googleAccount(purpose: GooglePurpose) {
  if (!googleOAuthConfigured()) return null;
  try {
    const t = await db.googleToken.findUnique({ where: { purpose: tokenKey(purpose) } });
    return t ? { email: t.email, name: t.name, connectedAt: t.createdAt.toISOString() } : null;
  } catch {
    return null;
  }
}

/** A valid access token for `purpose` (refreshed when it's about to expire). Throws when not connected. */
export async function googleAccessToken(purpose: GooglePurpose): Promise<string> {
  const t = await db.googleToken.findUnique({ where: { purpose: tokenKey(purpose) } });
  if (!t)
    throw new Error(
      purpose === "gmail" ? "Connect Gmail in Settings → Email first" : purpose === "searchconsole" ? "Connect Google Search Console first" : "Connect Google Business Profile in Settings first",
    );
  if (t.expiresAt.getTime() - Date.now() > 60_000) return open(t.accessToken);
  if (!t.refreshToken) throw new Error("Google access expired. Disconnect and connect again.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: open(t.refreshToken), grant_type: "refresh_token" }),
  });
  const tok = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !tok.access_token) throw new Error(tok.error === "invalid_grant" ? "Google access was removed. Disconnect and connect again." : "Couldn't refresh Google access. Try again.");
  await db.googleToken.update({ where: { purpose: tokenKey(purpose) }, data: { accessToken: seal(tok.access_token), expiresAt: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000) } });
  return tok.access_token;
}

/** Call a Google API with the stored token; turns Google's error JSON into a readable Error. */
export async function googleFetch<T>(purpose: GooglePurpose, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await googleAccessToken(purpose)}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (body as { error?: { message?: string; status?: string } }).error;
    throw new GoogleApiError(res.status, e?.status ?? "", e?.message ?? `Google API error ${res.status}`);
  }
  return body as T;
}

export class GoogleApiError extends Error {
  constructor(
    public code: number,
    public status: string,
    message: string,
  ) {
    super(message);
  }
}

/** Revoke at Google and forget the tokens. */
export async function disconnectGoogle(purpose: GooglePurpose) {
  const t = await db.googleToken.findUnique({ where: { purpose: tokenKey(purpose) } });
  if (!t) return;
  const token = t.refreshToken ? open(t.refreshToken) : open(t.accessToken);
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
  await db.googleToken.delete({ where: { purpose: tokenKey(purpose) } });
}
