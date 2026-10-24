// Scheduled posts: Google, Facebook, Instagram and LinkedIn can't hold a post until a set time through their APIs, so the app
// keeps it ("scheduled") and publishes it when it's due. Runs from /api/cron/publish-posts (every few minutes) and, as a
// fallback, after app page loads (at most once a minute per server process).
import { getProvider } from "@/lib/gbp";
import { forEachWorkspace } from "@/lib/gbp/tenancy";

/** Posts more than this late aren't published any more (e.g. "open this weekend" a week later); they stay scheduled in the past. */
const MAX_LATE_MS = 24 * 60 * 60_000;

const g = globalThis as unknown as { __gbpnPublishing?: Promise<unknown> | null; __gbpnPublishedAt?: number };

/** Publish the current workspace's due posts. Returns the ids it published (or tried to). */
export async function publishDuePosts(now = Date.now()) {
  const provider = await getProvider();
  const due = (await provider.listPosts()).filter((p) => {
    if (p.status !== "scheduled" || p.imported || !p.scheduled_at) return false;
    const at = new Date(p.scheduled_at).getTime();
    return at <= now && now - at <= MAX_LATE_MS;
  });
  const done: { id: string; status: string }[] = [];
  for (const p of due) {
    try {
      const res = await provider.publishPost(p.id);
      done.push({ id: p.id, status: res.status });
    } catch (e) {
      done.push({ id: p.id, status: `error: ${e instanceof Error ? e.message : "failed"}` });
    }
  }
  return done;
}

/** Every workspace's due posts, one run at a time per process (overlapping cron calls wait for the running one). */
export async function publishDueEverywhere() {
  if (g.__gbpnPublishing) return g.__gbpnPublishing as Promise<Record<string, { id: string; status: string }[]>>;
  const run = (async () => {
    const results: Record<string, { id: string; status: string }[]> = {};
    await forEachWorkspace(async (t) => {
      const done = await publishDuePosts();
      if (done.length) results[t.id] = done;
    });
    return results;
  })();
  g.__gbpnPublishing = run;
  try {
    return await run;
  } finally {
    g.__gbpnPublishing = null;
    g.__gbpnPublishedAt = Date.now();
  }
}

/** Fallback while people use the app: at most once a minute. */
export function publishDueSoon() {
  if (g.__gbpnPublishing || Date.now() - (g.__gbpnPublishedAt ?? 0) < 60_000) return Promise.resolve();
  g.__gbpnPublishedAt = Date.now();
  return publishDueEverywhere().then(() => undefined, () => undefined);
}
