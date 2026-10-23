// Which networks this app can connect to, and how. Server-only (reads env).
import type { Channel } from "./posts";

export const isDemo = () => process.env.GBP_DATA_SOURCE !== "google";

/** Env vars each network's OAuth app needs in live mode. */
export const CHANNEL_ENV: Record<Channel, string[]> = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  facebook: ["META_APP_ID", "META_APP_SECRET"],
  instagram: ["META_APP_ID", "META_APP_SECRET"],
  linkedin: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
};

/** Demo mode simulates every network; live mode needs that network's OAuth app credentials. */
export const channelAvailable = (ch: Channel) => isDemo() || CHANNEL_ENV[ch].every((k) => !!process.env[k]);
