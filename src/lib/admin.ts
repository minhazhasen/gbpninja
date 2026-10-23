// Platform admins (the people running this app, not the businesses using it).
// Until roles exist, they're the signed-in emails listed in PLATFORM_ADMIN_EMAILS (comma-separated).
import { auth } from "@/auth";
import { getSessionUser } from "@/lib/current-user";
import { isDemo } from "@/lib/connections";

/** Placeholder identity for local demo runs, where there's no sign-in. */
const DEMO_ADMIN = "demo-admin@localhost";

export const platformAdminEmails = () =>
  (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** The signed-in platform admin's email, or null. Local demo runs (mock data, not a production build) act as one. */
export async function platformAdmin(): Promise<string | null> {
  if (isDemo() && process.env.NODE_ENV !== "production") return DEMO_ADMIN;
  const allowed = platformAdminEmails();
  if (!allowed.length) return null;
  try {
    // Firebase sign-in first (current), then Auth.js (kept for the Business Profile OAuth connection).
    const email = (await getSessionUser())?.email ?? (await auth())?.user?.email?.toLowerCase();
    return email && allowed.includes(email) ? email : null;
  } catch {
    // Auth not configured (e.g. no AUTH_SECRET) — nobody is an admin.
    return null;
  }
}

export const isPlatformAdmin = async () => !!(await platformAdmin());
