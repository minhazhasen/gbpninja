import { differenceInCalendarDays, startOfDay, subDays } from "date-fns";
import { rangeFromParams, ymd } from "@/lib/date-ranges";

/** Search Console data lags ~2 days: end the picked range there, keeping its length. Default last 28 days. */
export function scRange(sp: { range?: string; from?: string; to?: string; compare?: string }) {
  const r = rangeFromParams(sp, "last28");
  const lastDay = subDays(startOfDay(new Date()), 2);
  const shift = Math.max(0, differenceInCalendarDays(r.to, lastDay));
  const to = subDays(r.to, shift);
  const from = r.from ? subDays(r.from, shift) : subDays(to, 89);
  return { from: ymd(from), to: ymd(to), compare: r.compare };
}

/** Link to a search query's detail page, keeping the location and date range. */
export function queryHref(query: string, params: URLSearchParams | Record<string, string | undefined>) {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]) ?? undefined;
  const qs = new URLSearchParams({ q: query });
  for (const k of ["location", "range", "from", "to", "compare"]) {
    const v = get(k);
    if (v) qs.set(k, v);
  }
  return `/ranking/search?${qs}`;
}
