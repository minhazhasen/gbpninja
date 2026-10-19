import type { MetricPoint } from "./gbp/types";

export interface ComparePoint {
  date: string;
  label: string;
  current: number;
  previous?: number;
  previousDate?: string;
}

export const SERIES = {
  interactions: "Interactions",
  websiteClicks: "Website clicks",
  calls: "Calls",
  directions: "Directions",
  impressions: "Profile views",
} as const;
export type SeriesKey = keyof typeof SERIES;

export const RANGES = { "7": "Last 7 days", "28": "Last 28 days", "90": "Last 90 days" } as const;
export type RangeKey = keyof typeof RANGES;

export function value(m: MetricPoint, key: SeriesKey) {
  return key === "interactions" ? m.calls + m.websiteClicks + m.directions : m[key];
}

export function totals(points: MetricPoint[]) {
  const sum = (f: (m: MetricPoint) => number) => points.reduce((s, m) => s + f(m), 0);
  return {
    interactions: sum((m) => value(m, "interactions")),
    websiteClicks: sum((m) => m.websiteClicks),
    calls: sum((m) => m.calls),
    directions: sum((m) => m.directions),
    impressions: sum((m) => m.impressions),
    searchImpressions: sum((m) => m.searchImpressions),
    mapsImpressions: sum((m) => m.mapsImpressions),
  };
}

/** Splits a 2N-day series into previous/current halves and aligns them day by day. */
export function splitCompare(points: MetricPoint[], days: number, key: SeriesKey) {
  const previous = points.slice(-days * 2, -days);
  const current = points.slice(-days);
  const chart: ComparePoint[] = current.map((m, i) => ({
    date: m.date,
    label: new Date(`${m.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    current: value(m, key),
    previous: previous[i] ? value(previous[i], key) : undefined,
    previousDate: previous[i]?.date,
  }));
  return { current, previous, chart };
}
