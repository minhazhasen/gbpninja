// Competitor helpers shared by the Competitors page and the audit's category guide.
import type { Competitor, CompetitorPoint, Review } from "./gbp/types";

export interface CategoryUsage {
  name: string;
  /** How many nearby competitors list it (primary or additional). */
  count: number;
}

/** Categories nearby competitors use, most common first. */
export function categoryUsage(competitors: Pick<Competitor, "primaryCategory" | "additionalCategories">[]): CategoryUsage[] {
  const counts = new Map<string, number>();
  for (const c of competitors) for (const cat of new Set([c.primaryCategory, ...c.additionalCategories])) counts.set(cat, (counts.get(cat) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Competitors a business can add (by Google Maps link). */
export const MAX_COMPETITORS = 10;

/** One history point for today, replacing an earlier one from the same day. Keeps a year. */
export function addPoint(history: CompetitorPoint[] = [], point: CompetitorPoint): CompetitorPoint[] {
  return [...history.filter((p) => p.date !== point.date), point].sort((a, b) => a.date.localeCompare(b.date)).slice(-366);
}

/** Change in reviews / rating over the last `days` (vs the latest point at or before then); null without enough history. */
export function changeOver(history: CompetitorPoint[] | undefined, days: number, now = new Date()) {
  if (!history || history.length < 2) return null;
  const latest = history[history.length - 1];
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const base = [...history].reverse().find((p) => p.date <= cutoff) ?? history[0];
  if (base === latest) return null;
  return {
    reviews: latest.reviewCount - base.reviewCount,
    rating: latest.rating != null && base.rating != null ? Math.round((latest.rating - base.rating) * 10) / 10 : null,
    since: base.date,
  };
}

/** A profile's own review history from its review dates: one point per day for the last `days` (count and average rating so far). */
export function reviewHistory(reviews: Pick<Review, "createTime" | "rating">[], days = 365, now = new Date()): CompetitorPoint[] {
  const sorted = [...reviews].sort((a, b) => a.createTime.localeCompare(b.createTime));
  const out: CompetitorPoint[] = [];
  let i = 0;
  let sum = 0;
  for (let d = days; d >= 0; d--) {
    const day = new Date(now.getTime() - d * 86_400_000);
    const date = day.toISOString().slice(0, 10);
    while (i < sorted.length && sorted[i].createTime.slice(0, 10) <= date) sum += sorted[i++].rating;
    out.push({ date, reviewCount: i, rating: i ? Math.round((sum / i) * 10) / 10 : null });
  }
  return out;
}
