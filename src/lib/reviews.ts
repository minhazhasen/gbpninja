// Review helpers, ported from TasksBook CRM (src/lib/reviews.ts + the review parts of src/lib/marketing.ts).
import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, startOfDay, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import type { FollowUpType, Review, ReviewRequestMethod, ReviewRequestStatus } from "./gbp/types";
import { inZone } from "./time-zones";

export const isReplied = (r: Pick<Review, "reply">) => !!r.reply?.comment.trim();
export const isLow = (r: Pick<Review, "rating">) => r.rating <= 3;
/** Low rating with no reply and no follow-up yet. */
export const needsAttention = (r: Review) => !r.hidden && isLow(r) && !isReplied(r) && !r.followUp;
export const needsReply = (r: Review) => !r.hidden && !isReplied(r);

export const FOLLOW_UP_LABEL: Record<FollowUpType, string> = { called: "Called", emailed: "Emailed", resolved: "Resolved" };

export const REVIEW_STATE = {
  hidden: { label: "Hidden", tone: "bg-muted text-muted-foreground" },
  attention: { label: "Needs follow-up", tone: "bg-destructive/10 text-destructive" },
  replied: { label: "Replied", tone: "bg-success/10 text-success" },
  followed: { label: "Followed up", tone: "bg-info/10 text-info" },
  reply: { label: "Needs reply", tone: "bg-warning/10 text-warning" },
};

export function reviewState(r: Review) {
  if (r.hidden) return REVIEW_STATE.hidden;
  if (needsAttention(r)) return REVIEW_STATE.attention;
  if (isReplied(r)) return REVIEW_STATE.replied;
  if (r.followUp) return { ...REVIEW_STATE.followed, label: FOLLOW_UP_LABEL[r.followUp.type] };
  return REVIEW_STATE.reply;
}

export function summarize(items: Review[]) {
  const count = items.length;
  const avg = count ? items.reduce((s, r) => s + r.rating, 0) / count : null;
  const five = items.filter((r) => r.rating === 5).length;
  return { count, avg, fiveShare: count ? Math.round((five / count) * 100) : null };
}

/** Counts for 5★…1★ (index 0 = 5 stars). */
export function starDistribution(items: Pick<Review, "rating">[]): number[] {
  const out = [0, 0, 0, 0, 0];
  for (const r of items) if (r.rating >= 1 && r.rating <= 5) out[5 - r.rating]++;
  return out;
}

export function responseRate(items: Review[]): number | null {
  if (!items.length) return null;
  return Math.round((items.filter(isReplied).length / items.length) * 100);
}

/** Reviews per month for each year: [{ month: 'Jan', [year]: count }]. */
export type ReviewBucket = "day" | "week" | "month" | "year";

/**
 * Reviews counted per day / week / month / year across a date range (all time = from the oldest review), sized so the chart
 * stays readable: ≤ 31 days → days, ≤ 4 months → weeks, ≤ 4 years → months, longer → years. With `prev` (the previous period of the
 * same length), each bar also gets the matching bucket from that period, for a side-by-side comparison.
 */
/** `timeZone`: count in the business's own time (see time-zones.ts); omitted = the viewer's. */
export function reviewSeries(items: Pick<Review, "createTime">[], from: Date | null, to: Date, prev?: { from: Date; to: Date } | null, force?: ReviewBucket, timeZone?: string) {
  const at = (iso: string) => (timeZone ? inZone(iso, timeZone) : new Date(iso));
  const oldest = items.reduce<Date | null>((m, r) => {
    const d = at(r.createTime);
    return !m || d < m ? d : m;
  }, null);
  const start = startOfDay(from ?? oldest ?? to);
  const days = differenceInCalendarDays(to, start) + 1;
  const bucket: ReviewBucket = force ?? (days <= 31 ? "day" : days <= 124 ? "week" : days <= 4 * 366 ? "month" : "year");
  const floor = { day: startOfDay, week: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }), month: startOfMonth, year: startOfYear }[bucket];
  const step = { day: addDays, week: addWeeks, month: addMonths, year: addYears }[bucket];
  const label = { day: "d MMM", week: "d MMM", month: days > 366 ? "MMM yy" : "MMM", year: "yyyy" }[bucket];
  const tip = { day: "EEE d MMM yyyy", week: "'Week of' d MMM yyyy", month: "MMMM yyyy", year: "yyyy" }[bucket];

  const keys: Date[] = [];
  for (let d = floor(start); d <= to; d = step(d, 1)) keys.push(d);
  const index = new Map(keys.map((d, i) => [d.getTime(), i]));
  const rows = keys.map((d) => ({ key: d.toISOString(), label: format(d, label), tip: format(d, tip), count: 0, prev: 0 }));
  // The previous period lines up bucket by bucket (its first bucket next to this period's first).
  const prevStart = prev ? floor(prev.from) : null;
  const end = addDays(startOfDay(to), 1);
  for (const r of items) {
    const d = at(r.createTime);
    if (d >= start && d < end) {
      const i = index.get(floor(d).getTime());
      if (i != null) rows[i].count++;
    } else if (prev && prevStart && d >= startOfDay(prev.from) && d < addDays(startOfDay(prev.to), 1)) {
      let i = 0;
      for (let k = prevStart; floor(d) > k; k = step(k, 1)) i++;
      if (rows[i]) rows[i].prev++;
    }
  }
  return { bucket, rows };
}

/**
 * January–December of this year, each month next to the same month last year, plus a forecast for the current month only
 * (`forecast` = expected total; `extra` = forecast minus what's in so far, drawn as the light part of the bar).
 * Forecast = last year's same month × this year's pace vs last year (Jan → last full month); with no history, the average of this
 * year's full months. The current month blends its own daily pace in as the month goes on.
 */
export function monthlyComparison(items: Pick<Review, "createTime">[], timeZone?: string, real = new Date()) {
  const at = (iso: string | Date) => (timeZone ? inZone(iso, timeZone) : new Date(iso));
  const now = at(real);
  const first = startOfYear(now);
  const month = now.getMonth();
  const rows = Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(first, i);
    return { key: m.toISOString(), label: format(m, "MMM"), tip: format(m, "MMMM yyyy"), prevTip: format(addYears(m, -1), "MMMM yyyy"), count: 0, prev: 0, forecast: null as number | null, extra: 0 };
  });
  const prevFirst = addYears(first, -1);
  for (const r of items) {
    const d = at(r.createTime);
    if (d >= first) {
      const i = (d.getFullYear() - first.getFullYear()) * 12 + d.getMonth() - first.getMonth();
      if (rows[i]) rows[i].count++;
    } else if (d >= prevFirst) {
      const i = (d.getFullYear() - prevFirst.getFullYear()) * 12 + d.getMonth() - prevFirst.getMonth();
      if (rows[i]) rows[i].prev++;
    }
  }
  // Pace vs last year over the full months so far (clamped so one odd month can't explode it).
  const done = rows.slice(0, month);
  const ytd = done.reduce((a, r) => a + r.count, 0);
  const lastYtd = done.reduce((a, r) => a + r.prev, 0);
  const ratio = lastYtd > 0 && done.length ? Math.min(3, Math.max(0.3, ytd / lastYtd)) : null;
  const avg = done.length ? ytd / done.length : null;
  const expect = (r: (typeof rows)[number]) => (ratio != null && r.prev > 0 ? r.prev * ratio : (avg ?? r.prev));
  // This month: blend last year's pattern with its own daily pace, trusting the pace more as the days pass.
  const r = rows[month];
  const day = now.getDate();
  const days = new Date(now.getFullYear(), month + 1, 0).getDate();
  const w = Math.min(1, day / days);
  r.forecast = Math.round(Math.max(r.count, (r.count / day) * days * w + expect(r) * (1 - w)));
  r.extra = Math.max(0, r.forecast - r.count);
  return rows;
}

/** % change; null when there is no baseline. */
export const pctDelta = (cur: number, prev: number | null) => (prev == null ? null : prev === 0 ? (cur ? 100 : 0) : Math.round(((cur - prev) / prev) * 100));

// Reply and request templates live in src/lib/templates.ts (editable in Settings → Templates).

// ---------------------------------------------------------------- requests
export const REQUEST_STATUSES: { key: ReviewRequestStatus; label: string; tone: string; dot: string }[] = [
  { key: "draft", label: "Draft", tone: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  { key: "sent", label: "Sent", tone: "bg-info/10 text-info", dot: "bg-info" },
  { key: "clicked", label: "Clicked", tone: "bg-warning/10 text-warning", dot: "bg-warning" },
  { key: "completed", label: "Reviewed", tone: "bg-success/10 text-success", dot: "bg-success" },
  { key: "declined", label: "Declined", tone: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
];
export const requestInfo = (k: string) => REQUEST_STATUSES.find((s) => s.key === k) ?? REQUEST_STATUSES[0];

export const STATUS_ACTION_LABEL: Record<ReviewRequestStatus, string> = {
  draft: "Draft",
  sent: "Mark as sent",
  clicked: "Mark as clicked",
  completed: "Mark as reviewed",
  declined: "Mark as declined",
};
export const nextStatuses = (status: ReviewRequestStatus): ReviewRequestStatus[] =>
  status === "draft" ? ["sent"] : status === "sent" ? ["clicked", "completed", "declined"] : status === "clicked" ? ["completed", "declined"] : [];

export const METHOD_LABEL: Record<ReviewRequestMethod, string> = { email: "Email", sms: "Text", link: "Link" };

/** Google's "write a review" link for a place. */
export const reviewLink = (placeId?: string | null) => (placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}` : null);

// CSV export lives in lib/csv.ts (shared with Performance and Ranking).
export { downloadCsv } from "@/lib/csv";
