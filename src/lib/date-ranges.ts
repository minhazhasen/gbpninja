// Date ranges, ported from TasksBook CRM (src/lib/dateRanges.ts), plus URL (de)serialisation
// so pages can keep the range in the query string and stay server-rendered.
import { differenceInCalendarDays, endOfMonth, endOfYear, format, isValid, parseISO, startOfDay, startOfMonth, startOfWeek, startOfYear, subDays, subMonths, subYears } from "date-fns";

export type RangePreset = "today" | "yesterday" | "last7" | "thisWeek" | "lastWeek" | "last28" | "last30" | "last90" | "thisMonth" | "lastMonth" | "thisYear" | "lastYear" | "all" | "custom";

/** Inclusive day range. `from` is null for "All time". */
export interface DateRangeValue {
  preset: RangePreset;
  from: Date | null;
  to: Date;
  compare: boolean;
}

export const RANGE_PRESETS: { key: Exclude<RangePreset, "custom">; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "thisWeek", label: "This week" },
  { key: "lastWeek", label: "Last week" },
  { key: "last28", label: "Last 28 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "last90", label: "Last 3 months" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "thisYear", label: "This year" },
  { key: "lastYear", label: "Last year" },
  { key: "all", label: "All time" },
];

/** Presets shown in the picker, in order. */
export const MENU_PRESETS: Exclude<RangePreset, "custom">[] = ["today", "last7", "last30", "thisMonth", "last90", "thisYear", "all"];

export function presetRange(key: Exclude<RangePreset, "custom">, now = new Date()): { from: Date | null; to: Date } {
  const today = startOfDay(now);
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: subDays(today, 1), to: subDays(today, 1) };
    case "last7":
      return { from: subDays(today, 6), to: today };
    case "thisWeek":
      return { from: startOfWeek(today, { weekStartsOn: 1 }), to: today };
    case "lastWeek": {
      const mon = subDays(startOfWeek(today, { weekStartsOn: 1 }), 7);
      return { from: mon, to: subDays(mon, -6) };
    }
    case "last28":
      return { from: subDays(today, 27), to: today };
    case "last30":
      return { from: subDays(today, 29), to: today };
    case "last90":
      return { from: subDays(today, 89), to: today };
    case "thisMonth":
      return { from: startOfMonth(today), to: today };
    case "lastMonth": {
      const m = subMonths(today, 1);
      return { from: startOfMonth(m), to: startOfDay(endOfMonth(m)) };
    }
    case "thisYear":
      return { from: startOfYear(today), to: today };
    case "lastYear": {
      const y = subYears(today, 1);
      return { from: startOfYear(y), to: startOfDay(endOfYear(y)) };
    }
    default:
      return { from: null, to: today };
  }
}

export const makeRange = (preset: Exclude<RangePreset, "custom">, compare = false): DateRangeValue => ({ preset, compare, ...presetRange(preset) });

export const rangeLabel = (v: DateRangeValue) => (v.preset === "custom" ? "Custom range" : (RANGE_PRESETS.find((p) => p.key === v.preset)?.label ?? ""));

/** Same-length window right before the range (null for All time). */
export function previousRange(v: Pick<DateRangeValue, "from" | "to">): { from: Date; to: Date } | null {
  if (!v.from) return null;
  const days = differenceInCalendarDays(v.to, v.from) + 1;
  return { from: subDays(v.from, days), to: subDays(v.from, 1) };
}

export const ymd = (d: Date) => format(d, "yyyy-MM-dd");

/** Inclusive list of yyyy-MM-dd days. */
export function daysBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let d = startOfDay(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(ymd(d));
  return out;
}

// ---------------------------------------------------------------- URL state
type Params = Record<string, string | undefined>;

/** ?range=last30&compare=1, or ?range=custom&from=2026-09-01&to=2026-09-30. Presets resolve against today. */
export function rangeFromParams(p: Params, fallback: Exclude<RangePreset, "custom"> = "last30", now = new Date()): DateRangeValue {
  const compare = p.compare !== "0";
  const today = startOfDay(now);
  if (p.range === "custom") {
    const from = p.from ? parseISO(p.from) : null;
    const to = p.to ? parseISO(p.to) : null;
    if (from && to && isValid(from) && isValid(to)) {
      const [a, b] = from <= to ? [from, to] : [to, from];
      return { preset: "custom", from: startOfDay(a), to: startOfDay(b > today ? today : b), compare };
    }
  }
  const key = RANGE_PRESETS.some((x) => x.key === p.range) ? (p.range as Exclude<RangePreset, "custom">) : fallback;
  const r = makeRange(key, compare);
  return { ...r, compare: compare && !!r.from };
}

export function rangeToParams(v: DateRangeValue): Record<string, string> {
  const out: Record<string, string> = { range: v.preset, compare: v.compare ? "1" : "0" };
  if (v.preset === "custom" && v.from) {
    out.from = ymd(v.from);
    out.to = ymd(v.to);
  }
  return out;
}
