// Competitor helpers shared by the Competitors page and the audit's category guide.
import type { Competitor, CompetitorDetails, CompetitorPoint, Location, Review } from "./gbp/types";
import type { Post } from "./posts";
import { ATTRIBUTE_GROUPS, DAYS } from "./profile";

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

/** "9 AM", "5:30 PM" from "09:00" / "17:30". */
function clock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const hour = h % 12 || 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 || h === 24 ? "AM" : "PM"}`;
}

/**
 * Your own column in the Compare view, from your Google profile (not a scraped listing): description, hours,
 * attributes as Google groups them, services you list, your newest review and your latest Google post.
 */
export function profileDetails(
  location: Location,
  reviews: Pick<Review, "createTime" | "rating" | "hidden">[],
  posts: Pick<Post, "status" | "channels" | "google" | "body" | "custom_text" | "published_at" | "imported">[],
): CompetitorDetails {
  const hours = DAYS.map((d) => {
    const periods = (location.regularHours ?? []).filter((p) => p.day === d);
    const name = d.charAt(0) + d.slice(1).toLowerCase();
    return { day: name, text: periods.length ? periods.map((p) => (p.open === "00:00" && p.close === "24:00" ? "Open 24 hours" : `${clock(p.open)}–${clock(p.close)}`)).join(", ") : "Closed" };
  });
  // Attributes: Google's catalogue and values (live), else the demo groups.
  let attributes: { group: string; items: string[] }[];
  if (location.attributeCatalog?.length) {
    const groups = new Map<string, string[]>();
    for (const def of location.attributeCatalog) {
      const v = location.attributeValues?.[def.id];
      const labels =
        v === true ? [def.label] : typeof v === "string" && def.type !== "url" ? [def.options?.find((o) => o.value === v)?.label ?? v] : Array.isArray(v) ? v.map((x) => def.options?.find((o) => o.value === x)?.label ?? x) : [];
      if (labels.length) groups.set(def.group, [...(groups.get(def.group) ?? []), ...labels]);
    }
    attributes = [...groups].map(([group, items]) => ({ group, items }));
  } else {
    const set = new Set(location.attributes);
    attributes = ATTRIBUTE_GROUPS.map((g) => ({ group: g.group, items: g.items.filter(([id]) => set.has(id)).map(([, label]) => label) })).filter((g) => g.items.length);
  }
  const shown = reviews.filter((r) => !r.hidden);
  const stars = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [String(n), shown.filter((r) => r.rating === n).length]));
  const latestReview = shown.map((r) => r.createTime).sort().at(-1)?.slice(0, 10) ?? null;
  // Latest post that went to Google for this location (posts for "all locations" count too).
  const google = posts
    .filter((p) => p.status === "published" && p.published_at && (p.imported ? p.imported.channel === "google" : p.channels.includes("google")))
    .filter((p) => !p.google.locations.length || p.google.locations.includes(location.id))
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))[0];
  const serviceNames = [...new Set(location.services.map((s) => s.name).filter(Boolean))];
  return {
    description: location.description?.trim() || null,
    phone: location.phone ?? null,
    websiteUri: location.websiteUri ?? null,
    bookingUrl: location.appointmentUri ?? null,
    hours: location.openStatus === "always_open" ? hours.map((h) => ({ ...h, text: "Open 24 hours" })) : hours,
    attributes,
    starCounts: shown.length ? stars : null,
    services: serviceNames,
    latestPost: google ? { text: ((google.custom_text && google.google.text) || google.body).slice(0, 600), date: google.published_at!.slice(0, 10) } : null,
    latestReview,
    claimed: location.verified,
  };
}

/** Reviews gained between two days (yyyy-MM-dd, inclusive) from a business's daily history; null without data. */
export function gainIn(history: CompetitorPoint[] | undefined, from: string, to: string) {
  const h = [...(history ?? [])].filter((p) => p.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  if (!h.length) return null;
  const before = [...h].reverse().find((p) => p.date < from) ?? h[0];
  return h[h.length - 1].reviewCount - before.reviewCount;
}
