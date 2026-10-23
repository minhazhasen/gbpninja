// What the server is configured with (env), for the platform admin's Integrations page.
// Only booleans and non-secret values leave the server — never keys or passwords.
import { CHANNEL_ENV, isDemo } from "@/lib/connections";
import { platformAdminEmails } from "@/lib/admin";

export interface SetupItem {
  label: string;
  ok: boolean;
  /** Env vars to set (names only). */
  hint: string;
  group: "Sign-in & data" | "Social networks" | "Jobs";
}

const has = (...keys: string[]) => keys.every((k) => !!process.env[k]);

export function setupChecklist(): SetupItem[] {
  return [
    { group: "Sign-in & data", label: "Auth secret", ok: has("AUTH_SECRET"), hint: "AUTH_SECRET" },
    { group: "Sign-in & data", label: "Google OAuth client", ok: has(...CHANNEL_ENV.google), hint: CHANNEL_ENV.google.join(" / ") },
    { group: "Sign-in & data", label: "Live Google data", ok: !isDemo(), hint: "GBP_DATA_SOURCE=google" },
    { group: "Sign-in & data", label: "Platform admins", ok: platformAdminEmails().length > 0, hint: "PLATFORM_ADMIN_EMAILS" },
    { group: "Social networks", label: "Meta app (Facebook + Instagram)", ok: has(...CHANNEL_ENV.facebook), hint: CHANNEL_ENV.facebook.join(" / ") },
    { group: "Social networks", label: "LinkedIn app", ok: has(...CHANNEL_ENV.linkedin), hint: CHANNEL_ENV.linkedin.join(" / ") },
    { group: "Jobs", label: "Cron secret (daily competitor check)", ok: has("CRON_SECRET"), hint: "CRON_SECRET → /api/cron/refresh-competitors" },
  ];
}
