// Platform admins (the people running this app, not the businesses using it): everyone in PLATFORM_ADMIN_EMAILS
// (comma-separated, always admins) plus the team added in Admin → Team (admin or staff).
import { auth } from "@/auth";
import { getSessionUser } from "@/lib/current-user";
import { isDemo } from "@/lib/connections";
import { listTeam, teamMemberByEmail, touchTeamMember } from "@/lib/platform/store";
import type { PlatformTeamMember } from "@/lib/platform/types";

/** Placeholder identity for local demo runs, where there's no sign-in. */
const DEMO_ADMIN = "demo-admin@localhost";
const demoAdmin = () => isDemo() && process.env.NODE_ENV !== "production";

export const platformAdminEmails = () =>
  (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** Env admins (and the local demo admin) always have a team row. */
const envAdmins = () => [...platformAdminEmails(), ...(demoAdmin() ? [DEMO_ADMIN] : [])];
export const platformTeam = () => listTeam(envAdmins());

/** The signed-in person's platform team record, or null. Local demo runs (mock data, not a production build) act as an admin. */
export async function platformMember(): Promise<PlatformTeamMember | null> {
  platformTeam();
  if (demoAdmin()) {
    touchTeamMember(DEMO_ADMIN);
    return teamMemberByEmail(DEMO_ADMIN);
  }
  try {
    // Firebase sign-in first (current), then Auth.js (kept for the Business Profile OAuth connection).
    const email = (await getSessionUser())?.email ?? (await auth())?.user?.email?.toLowerCase();
    const member = email ? teamMemberByEmail(email) : null;
    if (member) touchTeamMember(member.email);
    return member;
  } catch {
    // Auth not configured (e.g. no AUTH_SECRET) — nobody is an admin.
    return null;
  }
}

/** The signed-in platform team member's email, or null. */
export async function platformAdmin(): Promise<string | null> {
  return (await platformMember())?.email ?? null;
}

export const isPlatformAdmin = async () => !!(await platformAdmin());
