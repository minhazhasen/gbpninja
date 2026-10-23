// Meta (Facebook Page + Instagram) connection: Facebook Login for Business with our configuration (META_LOGIN_CONFIG_ID, which
// holds the permissions: pages_show_list, pages_manage_posts, pages_read_engagement, business_management, instagram_basic,
// instagram_content_publish …). Code → short-lived user token → long-lived user token (~60 days) → the Pages it manages, each
// with its own Page token (those don't expire). Everything is stored encrypted per workspace in the token table (oauth.ts helpers):
//   "<workspace>:meta"        the user (name in `email`, long-lived token)
//   "<workspace>:meta:pages"  JSON of the Pages: id, name, category, Page token, linked Instagram business account
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { currentTenant } from "@/lib/gbp/tenant-context";
import { open, seal } from "@/lib/google/oauth";

export const GRAPH = "https://graph.facebook.com/v21.0";
const STATE_COOKIE = "gbpn_meta_oauth";

export const metaConfigured = () => !!process.env.META_APP_ID && !!process.env.META_APP_SECRET && !!process.env.META_LOGIN_CONFIG_ID && !!process.env.SESSION_SECRET;
const redirectUri = () => process.env.META_REDIRECT_URI || "http://localhost:3001/api/oauth/meta/callback";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET);
const key = (part: "meta" | "meta:pages") => {
  const t = currentTenant();
  return t ? `${t.id}:${part}` : part;
};

export type MetaChannel = "facebook" | "instagram";

export interface MetaPage {
  id: string;
  name: string;
  category: string | null;
  token: string;
  instagram: { id: string; username: string } | null;
}

/** Graph API error → readable Error (expired token, missing permission…). */
export class MetaApiError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}
export async function graph<T>(path: string, token: string, init: RequestInit & { params?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(init.params ?? {})) url.searchParams.set(k, v);
  if (token && (!init.body || init.body instanceof URLSearchParams)) url.searchParams.set("access_token", token);
  const res = await fetch(url, { ...init, headers: init.body instanceof FormData ? init.headers : { ...init.headers } });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } };
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    if (e.code === 190) throw new MetaApiError(190, "Facebook access expired or was removed. Reconnect in Settings → Accounts.");
    if (e.code === 10 || e.code === 200)
      throw new MetaApiError(e.code, `Facebook didn't allow this (${e.error_user_msg || e.message || "missing permission"}). Reconnect and allow all the requested permissions.`);
    throw new MetaApiError(e.code ?? res.status, e.error_user_msg || e.message || `Facebook error ${res.status}`);
  }
  return body as T;
}

// ---------------------------------------------------------------- start + callback
/** Facebook's sign-in for our configuration. `channel` says which row to continue with on the way back. */
export async function metaAuthUrl(channel: MetaChannel, returnTo: string) {
  const nonce = randomBytes(16).toString("base64url");
  const state = await new SignJWT({ channel, returnTo, nonce }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("15m").sign(secret());
  (await cookies()).set(STATE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 900 });
  const p = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: redirectUri(),
    state,
    config_id: process.env.META_LOGIN_CONFIG_ID!,
    response_type: "code",
    override_default_response_type: "true",
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${p}`;
}

/** Exchange the code, keep a long-lived token and the Pages. Returns where to go and which channel was being connected. */
export async function finishMetaAuth(url: URL): Promise<{ channel: MetaChannel; returnTo: string; name?: string; error?: string }> {
  let channel: MetaChannel = "facebook";
  let returnTo = "/settings?tab=accounts";
  try {
    const { payload } = await jwtVerify(url.searchParams.get("state") ?? "", secret(), { algorithms: ["HS256"] });
    channel = payload.channel === "instagram" ? "instagram" : "facebook";
    returnTo = typeof payload.returnTo === "string" && payload.returnTo.startsWith("/") && !payload.returnTo.startsWith("//") ? payload.returnTo : returnTo;
    const jar = await cookies();
    const nonce = jar.get(STATE_COOKIE)?.value;
    jar.delete(STATE_COOKIE);
    if (!nonce || nonce !== payload.nonce) return { channel, returnTo, error: "The Facebook sign-in expired. Try connecting again." };
  } catch {
    return { channel, returnTo, error: "The Facebook sign-in expired. Try connecting again." };
  }
  const denied = url.searchParams.get("error_reason") ?? url.searchParams.get("error");
  if (denied) return { channel, returnTo, error: denied === "user_denied" ? "Facebook access wasn't granted." : `Facebook returned an error (${denied}).` };

  const app = { client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET! };
  try {
    const short = await graph<{ access_token: string }>("oauth/access_token", "", { params: { ...app, redirect_uri: redirectUri(), code: url.searchParams.get("code") ?? "" } });
    const long = await graph<{ access_token: string; expires_in?: number }>("oauth/access_token", "", {
      params: { ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token },
    });
    const me = await graph<{ id: string; name?: string }>("me", long.access_token, { params: { fields: "id,name" } });
    const data = {
      email: me.name ?? `Facebook user ${me.id}`,
      name: me.id,
      scope: "facebook-login-for-business",
      accessToken: seal(long.access_token),
      refreshToken: null,
      expiresAt: new Date(Date.now() + (long.expires_in ?? 60 * 86_400) * 1000),
    };
    await db.googleToken.upsert({ where: { purpose: key("meta") }, create: { purpose: key("meta"), ...data }, update: data });
    await refreshMetaPages(long.access_token);
    return { channel, returnTo, name: data.email };
  } catch (e) {
    return { channel, returnTo, error: e instanceof Error ? e.message : "Facebook didn't accept the sign-in. Try again." };
  }
}

// ---------------------------------------------------------------- use
/** The connected Facebook account (null when not connected or Meta isn't set up). */
export async function metaAccount() {
  if (!metaConfigured()) return null;
  try {
    const t = await db.googleToken.findUnique({ where: { purpose: key("meta") } });
    return t ? { name: t.email, connectedAt: t.createdAt.toISOString(), expiresAt: t.expiresAt.toISOString() } : null;
  } catch {
    return null;
  }
}

/** Re-read the Pages (and their linked Instagram accounts) with the user token and store them. */
export async function refreshMetaPages(userToken?: string): Promise<MetaPage[]> {
  let token = userToken;
  if (!token) {
    const t = await db.googleToken.findUnique({ where: { purpose: key("meta") } });
    if (!t) throw new Error("Connect Facebook in Settings → Accounts first");
    token = open(t.accessToken);
  }
  const pages: MetaPage[] = [];
  let next: string | null = "me/accounts";
  for (let i = 0; next && i < 20; i++) {
    type Res = { data?: { id: string; name: string; category?: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[]; paging?: { next?: string } };
    const r: Res = await graph<Res>(next, token, i === 0 ? { params: { fields: "id,name,category,access_token,instagram_business_account{id,username}", limit: "100" } } : {});
    for (const p of r.data ?? [])
      pages.push({
        id: p.id,
        name: p.name,
        category: p.category ?? null,
        token: p.access_token,
        instagram: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? p.instagram_business_account.id } : null,
      });
    next = r.paging?.next ?? null;
  }
  const data = { email: "pages", name: null, scope: "pages", accessToken: seal(JSON.stringify(pages)), refreshToken: null, expiresAt: new Date(Date.now() + 365 * 86_400_000) };
  await db.googleToken.upsert({ where: { purpose: key("meta:pages") }, create: { purpose: key("meta:pages"), ...data }, update: data });
  return pages;
}

/** Stored Pages (fresh from Facebook when `refresh`). */
export async function metaPages(refresh = false): Promise<MetaPage[]> {
  if (refresh) return refreshMetaPages();
  const t = await db.googleToken.findUnique({ where: { purpose: key("meta:pages") } });
  return t ? (JSON.parse(open(t.accessToken)) as MetaPage[]) : refreshMetaPages();
}

/** Revoke our access at Facebook and forget the tokens. */
export async function disconnectMeta() {
  const t = await db.googleToken.findUnique({ where: { purpose: key("meta") } });
  if (t) await graph("me/permissions", open(t.accessToken), { method: "DELETE" }).catch(() => {});
  for (const k of ["meta", "meta:pages"] as const) await db.googleToken.delete({ where: { purpose: key(k) } });
}
