// What the server is configured with (env) and whether its scheduled jobs are running, for Admin → Integrations.
// Only booleans, names and non-secret values leave the server — never keys or passwords.
// The page describes the server it runs on: on a local dev server, live-only settings (cron secret, public address, redirect
// links) count as fine and say so.
import { formatDistanceToNowStrict } from "date-fns";
import { CHANNEL_ENV, isDemo } from "@/lib/connections";
import { platformAdminEmails } from "@/lib/admin";
import { lastJobRun, type JobName } from "@/lib/job-runs";
import { latestBackup } from "@/lib/backup";

/** The apps the platform runs on (one card each on Admin → Integrations), the server itself, and the scheduled jobs. */
export type SetupGroup = "Google" | "Firebase" | "Meta" | "LinkedIn" | "Server" | "Scheduled jobs";
export const APP_GROUPS = ["Google", "Firebase", "Meta", "LinkedIn"] as const;
export type AppGroup = (typeof APP_GROUPS)[number];

export interface SetupItem {
  label: string;
  ok: boolean;
  /** Not needed for the app to work (a network nobody has to use). */
  optional?: boolean;
  /** Env vars to set, or the job's address and schedule (names only). */
  hint: string;
  /** What it's for, or what was found ("Last run 3 min ago"). */
  note?: string;
  /** Short status word on the right; defaults to Set / Missing. */
  status?: string;
  group: SetupGroup;
}

const live = () => process.env.NODE_ENV === "production";
const has = (...keys: string[]) => keys.every((k) => !!process.env[k]);
const isLocalUrl = (v: string | undefined) => !v || /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(v);
const ago = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

/** An env var holding a public link: required on the live site (and not a localhost one), fine to skip locally. */
function publicUrl(group: SetupGroup, label: string, key: string, what: string, optional = false): SetupItem {
  const v = process.env[key];
  if (!live()) return { group, label, hint: key, ok: true, optional, status: v ? "Set" : "Not needed locally", note: what };
  return { group, label, hint: key, ok: !isLocalUrl(v), optional, status: !v ? "Missing" : isLocalUrl(v) ? "Points to localhost" : "Set", note: what };
}

/** A cron job: fine when it was called within `withinHours`. Locally it isn't scheduled, so it only reports. */
function job(label: string, name: JobName, path: string, schedule: string, withinHours: number, what: string): SetupItem {
  const run = lastJobRun(name);
  const fresh = !!run && run.ok && Date.now() - new Date(run.at).getTime() < withinHours * 3_600_000;
  const note = run ? `Last call ${ago(run.at)}${run.note ? ` · ${run.note}` : ""}` : `${what} No call recorded yet.`;
  if (!live()) return { group: "Scheduled jobs", label, hint: `${path} · ${schedule}`, ok: true, status: run ? "Ran" : "Not needed locally", note };
  return { group: "Scheduled jobs", label, hint: `${path} · ${schedule}`, ok: fresh, status: !run ? "Not called yet" : !run.ok ? "Failed" : fresh ? "Running" : "Late", note };
}

export async function setupChecklist(): Promise<SetupItem[]> {
  const firebase = ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_APP_ID"];
  const backup = await latestBackup().catch(() => null);
  const backupRun = lastJobRun("backup");
  const backupFresh = !!backup && Date.now() - new Date(backup.at).getTime() < 26 * 3_600_000;
  return [
    // ---------------------------------------------------------------- apps and the server
    { group: "Server", label: "Session secret", ok: has("SESSION_SECRET"), hint: "SESSION_SECRET", note: "Signs sign-in cookies and encrypts saved Google, Meta and LinkedIn tokens." },
    { group: "Firebase", label: "Firebase sign-in", ok: has(...firebase), hint: "NEXT_PUBLIC_FIREBASE_* (API key, auth domain, project id, app id)", note: "Login with Google and email. Without it the app is an open demo." },
    { group: "Google", label: "OAuth client", ok: has(...CHANNEL_ENV.google), hint: CHANNEL_ENV.google.join(" / "), note: "Connect Business Profiles, Gmail and Search Console." },
    publicUrl("Google", "Redirect link", "GOOGLE_REDIRECT_URI", "Must match the link on the Google OAuth client (the site's address + \"/\")."),
    { group: "Google", label: "Live Google data", ok: !isDemo(), hint: "GBP_DATA_SOURCE=google", note: isDemo() ? "Showing sample data." : "Real Business Profile data." },
    publicUrl("Server", "Public address", "APP_URL", "For invite links and photos/videos sent to Google and Instagram."),
    { group: "Server", label: "Database", ok: has("DATABASE_URL"), hint: "DATABASE_URL", note: "SQLite file for workspaces, tokens and settings." },
    { group: "Server", label: "Platform admins", ok: platformAdminEmails().length > 0, hint: "PLATFORM_ADMIN_EMAILS", note: `${platformAdminEmails().length} listed` },

    { group: "Meta", label: "Meta app", optional: true, ok: has(...CHANNEL_ENV.facebook, "META_LOGIN_CONFIG_ID"), hint: "META_APP_ID / META_APP_SECRET / META_LOGIN_CONFIG_ID", note: "Posting to Facebook Pages and Instagram." },
    publicUrl("Meta", "Redirect link", "META_REDIRECT_URI", "<site>/api/oauth/meta/callback, also listed in the Meta app.", true),
    { group: "LinkedIn", label: "LinkedIn app", optional: true, ok: has(...CHANNEL_ENV.linkedin), hint: CHANNEL_ENV.linkedin.join(" / "), note: "Posting to LinkedIn." },
    publicUrl("LinkedIn", "Redirect link", "LINKEDIN_REDIRECT_URI", "<site>/api/oauth/linkedin/callback, also listed in the LinkedIn app.", true),

    // ---------------------------------------------------------------- scheduled jobs
    live()
      ? { group: "Scheduled jobs", label: "Cron secret", ok: has("CRON_SECRET"), hint: "CRON_SECRET", note: "The cron jobs send it as \"Authorization: Bearer …\"." }
      : { group: "Scheduled jobs", label: "Cron secret", ok: true, hint: "CRON_SECRET", status: has("CRON_SECRET") ? "Set" : "Not needed locally", note: "Only the live site needs it." },
    job("Publish scheduled posts", "cron:publish-posts", "/api/cron/publish-posts", "every 5 minutes", 0.5, "The server also checks every minute on its own."),
    job("Competitor check", "cron:refresh-competitors", "/api/cron/refresh-competitors", "once a day", 26, "Re-reads added competitors' Google listings."),
    {
      group: "Scheduled jobs",
      label: "Database backup",
      hint: "automatic · once a day, 14 kept",
      ok: !live() || backupFresh,
      status: backup ? (backupFresh ? "Running" : "Late") : live() ? "None yet" : "Not needed locally",
      note: backup ? `Latest ${backup.name}, ${ago(backup.at)}` : backupRun && !backupRun.ok ? `Failed: ${backupRun.note}` : "Runs on the live site a minute after start, then daily.",
    },
  ];
}
