// Google Business Profile search keywords (monthly), ported from TasksBook CRM (src/lib/marketing.ts).

/** One keyword in a month. Google hides small counts: `impressions` null + `threshold` (e.g. 15 → "<15"). */
export interface KeywordCount {
  keyword: string;
  impressions: number | null;
  threshold: number | null;
}
export interface KeywordMonth {
  /** yyyy-MM */
  month: string;
  keywords: KeywordCount[];
  locationId?: string | null;
}

/**
 * Per-location months → one per month (all given locations).
 * Counts add up; a hidden count ("<15") stays a threshold unless another location has an exact count.
 */
export function mergeKeywordMonths(rows: KeywordMonth[]): KeywordMonth[] {
  const months = new Map<string, Map<string, KeywordCount>>();
  for (const m of rows) {
    const kws = months.get(m.month) ?? new Map<string, KeywordCount>();
    for (const k of m.keywords) {
      const key = k.keyword.toLowerCase();
      const cur = kws.get(key);
      if (!cur) {
        kws.set(key, { ...k });
        continue;
      }
      const anyExact = cur.impressions != null || k.impressions != null;
      kws.set(key, {
        keyword: cur.keyword,
        impressions: anyExact ? (cur.impressions ?? 0) + (k.impressions ?? 0) : null,
        threshold: anyExact ? null : Math.max(cur.threshold ?? 0, k.threshold ?? 0) || null,
      });
    }
    months.set(m.month, kws);
  }
  return [...months.entries()]
    .map(([month, kws]) => ({
      month,
      keywords: [...kws.values()].sort((a, b) => (b.impressions ?? b.threshold ?? 0) - (a.impressions ?? a.threshold ?? 0) || a.keyword.localeCompare(b.keyword)),
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

/** % change, 'new' (no prior row) or null (nothing meaningful to compare). */
export type KeywordChange = number | "new" | null;
export interface KeywordRow {
  keyword: string;
  prior: KeywordCount | null;
  active: KeywordCount | null;
  change: KeywordChange;
}
export type KeywordSortKey = "keyword" | "prior" | "active" | "change";

/** Value used for sorting / maths: exact count, else the threshold. -1 when there is no row. */
export const keywordValue = (c: KeywordCount | null | undefined) => (c ? (c.impressions ?? c.threshold ?? 0) : -1);

/** "1,234", "<15" or "—". */
export const keywordLabel = (c: KeywordCount | null | undefined) => (!c ? "—" : c.impressions != null ? c.impressions.toLocaleString() : c.threshold != null ? `<${c.threshold}` : "0");

export function keywordChange(active: KeywordCount | null, prior: KeywordCount | null): KeywordChange {
  if (!active) return null;
  if (!prior) return "new";
  if (active.impressions == null && prior.impressions == null) return null;
  const a = keywordValue(active);
  const b = keywordValue(prior);
  return b === 0 ? null : Math.round(((a - b) / b) * 100);
}

/** Union of both months' keywords (case-insensitive), active-month rows first. */
export function compareKeywords(active: KeywordCount[] = [], prior: KeywordCount[] = []): KeywordRow[] {
  const p = new Map(prior.map((k) => [k.keyword.toLowerCase(), k]));
  const seen = new Set<string>();
  const rows: KeywordRow[] = [];
  for (const k of active) {
    const key = k.keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const pr = p.get(key) ?? null;
    rows.push({ keyword: k.keyword, prior: pr, active: k, change: keywordChange(k, pr) });
  }
  for (const k of prior) {
    const key = k.keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ keyword: k.keyword, prior: k, active: null, change: null });
  }
  return rows;
}

/** Sort rows; rows with nothing to show for the key always go last. */
export function sortKeywordRows(rows: KeywordRow[], key: KeywordSortKey, dir: 1 | -1): KeywordRow[] {
  const val = (r: KeywordRow): number | string | null => {
    if (key === "keyword") return r.keyword.toLowerCase();
    if (key === "change") return r.change === "new" ? Number.POSITIVE_INFINITY : r.change;
    const c = key === "active" ? r.active : r.prior;
    return c ? keywordValue(c) : null;
  };
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x == null || y == null) return x == null && y == null ? a.keyword.localeCompare(b.keyword) : x == null ? 1 : -1;
    if (x === y) return a.keyword.localeCompare(b.keyword);
    return (x < y ? -1 : 1) * dir;
  });
}

/** Case-insensitive "contains every word" filter. */
export function filterKeywordRows(rows: KeywordRow[], q: string): KeywordRow[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? rows.filter((r) => words.every((w) => r.keyword.toLowerCase().includes(w))) : rows;
}

/** Default months: latest available vs the one before it. */
export function defaultKeywordMonths(months: string[]): { active: string | null; compare: string | null } {
  const sorted = [...months].sort().reverse();
  return { active: sorted[0] ?? null, compare: sorted[1] ?? null };
}
