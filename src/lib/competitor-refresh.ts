// Daily check of competitors added by Google Maps link: re-read each one's rating and review count (src/lib/maps-scrape.ts) and
// save a history point. Run from /api/cron/refresh-competitors (e.g. once a day) and in the background when the Competitors page
// shows stale data. Polite on purpose: one at a time with a pause in between, and a few hours' pause if Google keeps failing.
import { getProvider } from "@/lib/gbp";
import { scrapeMapsLink } from "@/lib/maps-scrape";

/** A competitor is checked again once its last check is this old. */
export const CHECK_EVERY_HOURS = 20;
const PAUSE_MS: [number, number] = [2500, 6000];
/** Failures in a row before the runner backs off (Google is probably blocking or the format changed). */
const MAX_FAILURES_IN_A_ROW = 3;
const BACKOFF_HOURS = 6;

const g = globalThis as unknown as { __competitorRefresh?: { running: boolean; blockedUntil: number } };
const run = (g.__competitorRefresh ??= { running: false, blockedUntil: 0 });

export interface RefreshSummary {
  checked: number;
  updated: number;
  failed: number;
  skipped?: "running" | "backing_off";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const due = (checkedAt: string | null | undefined, now: number) => !checkedAt || now - new Date(checkedAt).getTime() >= CHECK_EVERY_HOURS * 3_600_000;

/** Check due competitors (all locations, or one), oldest check first. `force` ignores the 20-hour rule (manual "Check now"). */
export async function refreshCompetitors({ locationId, force = false, max = 200 }: { locationId?: string; force?: boolean; max?: number } = {}): Promise<RefreshSummary> {
  const summary: RefreshSummary = { checked: 0, updated: 0, failed: 0 };
  if (run.running) return { ...summary, skipped: "running" };
  if (Date.now() < run.blockedUntil) return { ...summary, skipped: "backing_off" };
  run.running = true;
  try {
    const provider = await getProvider();
    const locations = locationId ? [locationId] : (await provider.listLocations()).map((l) => l.id);
    const now = Date.now();
    const queue = (
      await Promise.all(locations.map(async (id) => (await provider.listCompetitors(id)).filter((c) => c.source === "added" && c.mapsUrl && (force || due(c.checkedAt, now))).map((c) => ({ locationId: id, c }))))
    )
      .flat()
      .sort((a, b) => (a.c.checkedAt ?? "").localeCompare(b.c.checkedAt ?? ""))
      .slice(0, max);

    let failuresInARow = 0;
    for (const [i, { locationId: id, c }] of queue.entries()) {
      if (i > 0) await sleep(PAUSE_MS[0] + Math.random() * (PAUSE_MS[1] - PAUSE_MS[0]));
      summary.checked++;
      // One retry after a short pause: Google sometimes refuses a single request.
      const place = (await scrapeMapsLink(c.mapsUrl!)) ?? (await sleep(4000).then(() => scrapeMapsLink(c.mapsUrl!)));
      if (!place) {
        summary.failed++;
        await provider.recordCompetitorCheck(id, c.id, { error: "Couldn't read the Google profile" });
        if (++failuresInARow >= MAX_FAILURES_IN_A_ROW) {
          run.blockedUntil = Date.now() + BACKOFF_HOURS * 3_600_000;
          break;
        }
        continue;
      }
      failuresInARow = 0;
      summary.updated++;
      await provider.recordCompetitorCheck(id, c.id, { rating: place.rating, reviewCount: place.reviewCount });
    }
    return summary;
  } finally {
    run.running = false;
  }
}
