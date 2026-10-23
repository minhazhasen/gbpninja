// The signed-in user for server components and actions (null in the open demo or when signed out).
import { cookies } from "next/headers";
import { SESSION_COOKIE, readSession, type SessionUser } from "./session";

export async function getSessionUser(): Promise<SessionUser | null> {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value);
}
