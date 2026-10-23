"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { SESSION_COOKIE, SESSION_DAYS, authEnabled, signSession, verifyFirebaseIdToken } from "@/lib/session";

/** After Login with Google in the browser: verify the Firebase ID token and start a session. */
export async function startSession(idToken: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!authEnabled()) return { ok: false, error: "Sign-in isn't set up on this server." };
  const token = z.string().min(20).max(5000).safeParse(idToken);
  if (!token.success) return { ok: false, error: "Sign-in failed. Try again." };
  let user;
  try {
    user = await verifyFirebaseIdToken(token.data);
  } catch {
    return { ok: false, error: "We couldn't verify your Google sign-in. Try again." };
  }
  (await cookies()).set(SESSION_COOKIE, await signSession(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return { ok: true };
}
