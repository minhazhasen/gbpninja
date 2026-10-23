import { differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import { daysBetween, previousRange, type DateRangeValue } from "./date-ranges";
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

/** How far back "All time" goes: Google keeps about 18 months of performance data. */
export const MAX_DAYS = 540;

/** Days of history to fetch for a range (including the previous period when comparing). */
export function daysNeeded(range: DateRangeValue, now = new Date()) {
  const prev = range.compare ? previousRange(range) : null;
  const earliest = prev?.from ?? range.from;
  return Math.min(MAX_DAYS * 2, earliest ? differenceInCalendarDays(startOfDay(now), earliest) + 1 : MAX_DAYS);
}

/** Add several locations' daily points together, day by day. */
export function sumByDate(perLocation: MetricPoint[][]): Map<string, MetricPoint> {
  const byDate = new Map<string, MetricPoint>();
  for (const points of perLocation)
    for (const p of points) {
      const c = byDate.get(p.date);
      byDate.set(
        p.date,
        c
          ? {
              date: p.date,
              impressions: c.impressions + p.impressions,
              searchImpressions: c.searchImpressions + p.searchImpressions,
              mapsImpressions: c.mapsImpressions + p.mapsImpressions,
              calls: c.calls + p.calls,
              websiteClicks: c.websiteClicks + p.websiteClicks,
              directions: c.directions + p.directions,
            }
          : { ...p },
      );
    }
  return byDate;
}

/** Totals for the range (and the previous period when comparing) plus a day-aligned chart. */
export function rangeView(perLocation: MetricPoint[][], range: DateRangeValue, series: SeriesKey, now = new Date()) {
  const byDate = sumByDate(perLocation);
  const today = startOfDay(now);
  const prev = range.compare ? previousRange(range) : null;
  const firstDay = [...byDate.keys()].sort()[0];
  const curDays = daysBetween(range.from ?? (firstDay ? parseISO(firstDay) : today), range.to);
  const prevDays = prev ? daysBetween(prev.from, prev.to) : [];
  const pick = (list: string[]) => list.map((d) => byDate.get(d)).filter((p): p is MetricPoint => !!p);
  const chart: ComparePoint[] = curDays.map((d, i) => {
    const c = byDate.get(d);
    const p = prevDays[i] ? byDate.get(prevDays[i]) : undefined;
    return {
      date: d,
      label: format(parseISO(d), curDays.length > 120 ? "MMM yy" : "MMM d"),
      current: c ? value(c, series) : 0,
      previous: p ? value(p, series) : undefined,
      previousDate: p?.date,
    };
  });
  return {
    cur: totals(pick(curDays)),
    before: prev ? totals(pick(prevDays)) : null,
    chart,
    start: curDays[0] ? parseISO(curDays[0]) : today,
  };
}

/** "Sep 20 – Oct 19, 2026" (start year shown when it differs). */
export const periodLabel = (start: Date, end: Date) => `${format(start, start.getFullYear() === end.getFullYear() ? "MMM d" : "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
