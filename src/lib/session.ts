// Sign-in sessions. Login with Google runs through Firebase Authentication in the browser (src/lib/firebase.ts); the server
// verifies the Firebase ID token against Google's public keys (no service account needed) and sets its own signed, httpOnly
// session cookie. No next/headers here so middleware can use it — server components read the cookie via current-user.ts.
import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";

export const SESSION_COOKIE = "gbpn_session";
export const SESSION_DAYS = 14;

export interface SessionUser {
  uid: string;
  email: string;
  name: string | null;
  picture: string | null;
}

/** Sign-in is required once Firebase and the session secret are configured; without them the app runs as an open demo. */
export const authEnabled = () => !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && !!process.env.SESSION_SECRET;

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET);

export async function signSession(user: SessionUser) {
  return new SignJWT({ email: user.email, name: user.name, picture: user.picture })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.uid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

/** The user in a session cookie, or null when it's missing, expired or tampered with. */
export async function readSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token || !process.env.SESSION_SECRET) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { uid: payload.sub, email: payload.email, name: (payload.name as string | null) ?? null, picture: (payload.picture as string | null) ?? null };
  } catch {
    return null;
  }
}

// Firebase ID tokens are RS256 JWTs signed by Google's securetoken service account.
const firebaseKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

/** Verify a Firebase ID token from the browser (signature, project, expiry, verified email). Throws when it isn't valid. */
export async function verifyFirebaseIdToken(idToken: string): Promise<SessionUser> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
  const { payload } = await jwtVerify(idToken, firebaseKeys, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ["RS256"] });
  if (!payload.sub || typeof payload.email !== "string") throw new Error("No email on this account");
  if (payload.email_verified !== true) throw new Error("Email not verified");
  return {
    uid: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}

/** Only same-site paths after sign-in (no open redirects). */
export const safeNext = (next: string | null | undefined) => (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/dashboard");
