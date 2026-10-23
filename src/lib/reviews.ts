// Review helpers, ported from TasksBook CRM (src/lib/reviews.ts + the review parts of src/lib/marketing.ts).
import { format } from "date-fns";
import type { FollowUpType, Review, ReviewRequestMethod, ReviewRequestStatus } from "./gbp/types";

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
export function monthlyByYear(items: Pick<Review, "createTime">[], years: number[]) {
  const rows = Array.from({ length: 12 }, (_, m) => {
    const row: Record<string, number | string> = { month: format(new Date(2000, m, 1), "MMM") };
    for (const y of years) row[String(y)] = 0;
    return row;
  });
  for (const r of items) {
    const d = new Date(r.createTime);
    const y = d.getFullYear();
    if (!years.includes(y)) continue;
    rows[d.getMonth()][String(y)] = Number(rows[d.getMonth()][String(y)]) + 1;
  }
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

// ---------------------------------------------------------------- CSV
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    // Review text is public input: stop spreadsheets from running it as a formula.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
