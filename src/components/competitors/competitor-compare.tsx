"use client";

// Compare view of the Competitors page (ported from the NWDS GBP project): you and the competitors you pick, in columns,
// one row per thing Google shows (rating, reviews, categories, services, description, hours, amenities, latest post…).
// Competitors' details come from their public Maps listings (`Competitor.details`, saved when added and by the daily check);
// yours from your own Google profile, reviews and posts (`profileDetails` in src/lib/competitors.ts).
import { useCallback, useMemo } from "react";
import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { Crown, Loader2, RefreshCw, Star } from "lucide-react";
import { Badge, buttonClass } from "@/components/ui";
import { gainIn } from "@/lib/competitors";
import { ymd } from "@/lib/date-ranges";
import type { Competitor, CompetitorDetails } from "@/lib/gbp/types";
import { cn } from "@/lib/utils";

const bizNow = () => new Date();

export function Chip({ children, missing, strong }: { children: React.ReactNode; missing?: boolean; strong?: boolean }) {
  return (
    <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs", missing ? "bg-warning/10 text-warning" : strong ? "bg-accent text-accent-foreground" : "bg-muted text-foreground")}>
      {children}
    </span>
  );
}

const Empty = ({ children = "Not listed" }: { children?: React.ReactNode }) => <span className="text-sm text-muted-foreground">{children}</span>;

/** Your column's data: your Google profile in the same shape as a competitor's listing. */
export type YouDetails = CompetitorDetails;

type Col = { c: Competitor; d: CompetitorDetails | null; you: boolean };
type RowDef = { label: string; cell: (col: Col) => React.ReactNode };

const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86_400_000));
/** "today", "3 days ago", "2 months ago" for a yyyy-MM-dd date. */
function ago(day: string) {
  const d = parseISO(day.slice(0, 10));
  const n = differenceInCalendarDays(bizNow(), d);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  return formatDistanceToNowStrict(d, { addSuffix: true, roundingMethod: "floor", unit: n < 30 ? "day" : n < 365 ? "month" : "year" });
}
/** The last day the daily check saw this competitor's review count go up. */
function lastIncrease(c: Competitor) {
  const h = [...(c.history ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = h.length - 1; i > 0; i--) if (h[i].reviewCount > h[i - 1].reviewCount) return h[i].date;
  return null;
}
type Score = { total: number; partial: boolean; parts: { label: string; got: number; max: number }[] };
const daysSince = (day: string | null | undefined) => (day ? differenceInCalendarDays(bizNow(), parseISO(day.slice(0, 10))) : null);
/** Freshness: full marks within a week, fading to nothing after the given number of days. */
const fresh = (days: number | null, zeroAfter: number) => (days == null ? 0 : days <= 7 ? 1 : Math.max(0, 1 - (days - 7) / (zeroAfter - 7)));

/**
 * 0–100 for each business in the comparison, from what the table shows. Review count and growth are scored
 * against the best in the table, so the score says how a business stands among these competitors.
 *   Rating 25 · Review count 20 · New reviews (30 days) 15 · Last review 10 · Posting 10 · Profile completeness 20
 */
function scoreAll(cols: Col[], lastReview: (col: Col) => { day: string } | null): Map<string, Score> {
  const today = daysAgo(0);
  const gain = (c: Competitor) => Math.max(0, gainIn(c.history, daysAgo(29), today) ?? 0);
  const maxReviews = Math.max(1, ...cols.map((x) => x.c.reviewCount));
  const maxGain = Math.max(1, ...cols.map((x) => gain(x.c)));
  const out = new Map<string, Score>();
  for (const col of cols) {
    const { c, d } = col;
    const profile = d
      ? (d.description ? 4 : 0) + (d.hours.length ? 4 : 0) + (d.websiteUri || c.websiteUri ? 3 : 0) + (d.phone ? 2 : 0) +
        (c.additionalCategories.length ? 4 : 0) + (d.claimed ? 3 : 0)
      : 0;
    const parts = [
      { label: "Rating", max: 25, got: c.rating == null ? 0 : 25 * Math.min(1, Math.max(0, (c.rating - 3) / 2)) },
      { label: "Review count", max: 20, got: (20 * Math.log1p(c.reviewCount)) / Math.log1p(maxReviews) },
      { label: "New reviews · 30 days", max: 15, got: (15 * gain(c)) / maxGain },
      { label: "Last review", max: 10, got: 10 * fresh(daysSince(lastReview(col)?.day), 365) },
      { label: "Posting", max: 10, got: 10 * fresh(daysSince(d?.latestPost?.date), 90) },
      { label: "Profile completeness", max: 20, got: profile },
    ].map((x) => ({ ...x, got: Math.round(x.got) }));
    out.set(c.id, { total: Math.min(100, parts.reduce((a, x) => a + x.got, 0)), partial: !d, parts });
  }
  return out;
}

export function CompetitorCompare({ you, youDetails, competitors, yours, onReadNow, reading }: {
  you: Competitor;
  youDetails: YouDetails;
  competitors: Competitor[];
  /** Your categories (lower case): competitors' ones you don't have are highlighted. */
  yours: Set<string>;
  /** Row labels to show (null = all); chosen in the panel header. */
  /** Read the competitors' Google Maps listings now (the panel's "Check now"). */
  onReadNow: () => void;
  reading: boolean;
}) {
  // Same shape as the NWDS version's fetched data: everything is already on the page here.
  const data = useMemo(() => ({ you: { details: youDetails as CompetitorDetails, lastReview: youDetails.latestReview } }), [youDetails]);

  const shown = competitors;

  const cols: Col[] = useMemo(
    () => [
      { c: you, d: data.you.details, you: true },
      ...shown.map((c) => ({ c, d: c.details ?? null, you: false })),
    ],
    [you, shown, data],
  );

  const lastReview = useCallback((col: Col): { day: string; exact: boolean } | null => {
    if (col.you) return data.you.lastReview ? { day: data.you.lastReview, exact: true } : null;
    const days = [col.d?.latestReview, lastIncrease(col.c)].filter((x): x is string => !!x).sort();
    return days.length ? { day: days[days.length - 1], exact: false } : null;
  }, [data]);
  const scores = useMemo(() => scoreAll(cols, lastReview), [cols, lastReview]);
  const leaders = useMemo(() => {
    if (!scores || cols.length < 2) return new Set<string>();
    const top = Math.max(...[...scores.values()].map((x) => x.total));
    return new Set([...scores].filter(([, v]) => v.total === top).map(([id]) => id));
  }, [scores, cols.length]);

  const rows = useMemo<RowDef[]>(() => {
    const best = (pick: (c: Competitor) => number | null) => Math.max(...cols.map((x) => pick(x.c) ?? -Infinity));
    const topRating = best((c) => c.rating);
    const topReviews = best((c) => c.reviewCount);
    const today = daysAgo(0);
    const lacks = (cat: string, col: Col) => !col.you && [...yours].some(Boolean) && !yours.has(cat.toLowerCase());
    const groups = [...new Set(cols.flatMap((x) => x.d?.attributes.map((g) => g.group) ?? []))];
    const todayName = format(bizNow(), "EEEE");
    // A cell renderer, not a component (no hooks inside).
    const needsDetails = (render: (d: CompetitorDetails, col: Col) => React.ReactNode) =>
      function cell(col: Col) {
        return col.d ? render(col.d, col) : <Empty>Not read yet</Empty>;
      };
    return [
      {
        label: "Score",
        cell: (col) => {
          const sc = scores.get(col.c.id);
          if (!sc) return <Empty>…</Empty>;
          return (
            <div title={sc.parts.map((x) => `${x.label}: ${x.got}/${x.max}`).join("\n") + (sc.partial ? "\nGoogle listing not read yet: completeness and posting count 0" : "")}>
              <p className="flex flex-wrap items-baseline gap-x-1">
                <span className={cn("text-xl font-semibold tabular-nums", leaders.has(col.c.id) && "text-warning")}>{sc.total}</span>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </p>
              {leaders.has(col.c.id) && <p className="text-[10px] font-semibold uppercase text-warning">Leader</p>}
            </div>
          );
        },
      },
      {
        label: "Rating",
        cell: ({ c }) => c.rating == null ? <Empty>—</Empty> : (
          <span className={cn("inline-flex items-center gap-1 tabular-nums", c.rating === topRating && "font-semibold text-success")}>
            {c.rating.toFixed(1)} <Star className="h-3.5 w-3.5 fill-warning text-warning" />
            {c.rating === topRating && cols.length > 1 && <span className="text-[10px] font-semibold uppercase">Best</span>}
          </span>
        ),
      },
      {
        label: "Reviews",
        cell: (col) => {
          const last = lastReview(col);
          return (
            <div>
              <span className={cn("tabular-nums", col.c.reviewCount === topReviews && "font-semibold text-success")}>
                {col.c.reviewCount.toLocaleString()}
                {col.c.reviewCount === topReviews && cols.length > 1 && <span className="ml-1 text-[10px] font-semibold uppercase">Most</span>}
              </span>
              {last && (
                <span
                  className="mt-1 block w-max rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  title={last.exact ? format(parseISO(last.day), "d MMM yyyy") : `${format(parseISO(last.day), "d MMM yyyy")}: newest review Google shows on the listing, or the last day the daily check saw the count go up`}
                >
                  Last review {last.exact ? "" : "≈ "}{ago(last.day)}
                </span>
              )}
            </div>
          );
        },
      },
      { label: "New reviews · 30 days", cell: ({ c }) => { const n = gainIn(c.history, daysAgo(29), today); return n == null ? <Empty>—</Empty> : <span className="tabular-nums">{n > 0 ? "+" : ""}{n.toLocaleString()}</span>; } },
      { label: "Distance", cell: ({ c, you: me }) => me ? <Empty>You</Empty> : c.distanceKm == null ? <Empty>—</Empty> : <span className="tabular-nums">{c.distanceKm.toFixed(1)} km</span> },
      { label: "Owner-verified", cell: needsDetails((d) => d.claimed ? "Yes" : <Empty>No</Empty>) },
      { label: "Main category", cell: (col) => col.c.primaryCategory ? <Chip strong missing={lacks(col.c.primaryCategory, col)}>{col.c.primaryCategory}</Chip> : <Empty /> },
      {
        label: "Additional categories",
        cell: (col) => col.c.additionalCategories.length
          ? <div className="flex flex-wrap gap-1">{col.c.additionalCategories.map((x) => <Chip key={x} missing={lacks(x, col)}>{x}</Chip>)}</div>
          : <Empty>Not checked</Empty>,
      },
      { label: "Description", cell: needsDetails((d) => d.description ? <p className="line-clamp-6 whitespace-pre-line text-xs leading-relaxed" title={d.description}>{d.description}</p> : <Empty>No description</Empty>) },
      {
        label: "Opening hours",
        cell: needsDetails((d) => d.hours.length ? (
          <dl className="grid grid-cols-[34px_1fr] gap-x-2 gap-y-0.5 text-xs">
            {d.hours.map((h) => (
              <div key={h.day} className={cn("contents", h.day === todayName && "font-semibold")}>
                <dt className="text-muted-foreground">{h.day.slice(0, 3)}</dt>
                <dd className={cn("tabular-nums", h.text === "Closed" && "text-muted-foreground")}>{h.text}</dd>
              </div>
            ))}
          </dl>
        ) : <Empty>Not listed</Empty>),
      },
      ...groups.map<RowDef>((g) => ({
        label: g,
        cell: needsDetails((d) => { const items = d.attributes.find((x) => x.group === g)?.items ?? []; return items.length ? <div className="flex flex-wrap gap-1">{items.map((x) => <Chip key={x}>{x}</Chip>)}</div> : <Empty>Not checked</Empty>; }),
      })),
      {
        label: "Latest Google post",
        cell: needsDetails((d) => d.latestPost ? (
          <div className="text-xs">
            {d.latestPost.date && (
              <p className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", differenceInCalendarDays(bizNow(), parseISO(d.latestPost.date)) > 30 ? "bg-warning/10 text-warning" : "bg-success/10 text-success")}>
                  {ago(d.latestPost.date)}
                </span>
                <span className="text-muted-foreground">{format(parseISO(d.latestPost.date), "d MMM yyyy")}</span>
              </p>
            )}
            <p className="line-clamp-4 whitespace-pre-line leading-relaxed" title={d.latestPost.text}>{d.latestPost.text}</p>
          </div>
        ) : <Empty>No recent posts</Empty>),
      },
      {
        label: "Contact",
        cell: ({ c, d }) => {
          const web = d?.websiteUri || c.websiteUri;
          return d?.phone || web ? (
            <div className="space-y-0.5 text-xs">
              {d?.phone && <p className="tabular-nums">{d.phone}</p>}
              {web && <a href={web} target="_blank" rel="noreferrer" className="block truncate font-medium text-primary hover:underline">{web.replace(/^https?:\/\/(www\.)?/, "").replace(/[/?].*$/, "")}</a>}
            </div>
          ) : <Empty />;
        },
      },
    ];
  }, [cols, yours, scores, leaders, lastReview]);

  const bodyRows = rows;

  // Listings not read yet: added before this view existed (read on their next daily check), or without a Maps link.
  const unread = cols.filter((col) => !col.you && !col.d);
  const readable = unread.filter((col) => col.c.mapsUrl);
  return (
    <div>
      {unread.length > 0 && (
        <div className="flex flex-col gap-2 border-b bg-accent/40 px-5 py-3 text-sm sm:flex-row sm:items-center lg:px-6">
          <span className="min-w-0 flex-1">
            {unread.length === 1 ? "1 competitor's" : `${unread.length} competitors'`} Google listing {unread.length === 1 ? "hasn't" : "haven't"} been read yet, so services,
            description, hours and more show &ldquo;Not read yet&rdquo;.
            {readable.length < unread.length && " Ones without a Google Maps link need one first (⋯ → Edit details)."}
          </span>
          {readable.length > 0 && (
            <button type="button" className={buttonClass("default", "sm", "shrink-0 self-start sm:self-auto")} onClick={onReadNow} disabled={reading}>
              {reading ? <Loader2 className="animate-spin" /> : <RefreshCw />} {reading ? `Reading ${readable.length} listing${readable.length === 1 ? "" : "s"}…` : "Read now"}
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto pt-3">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-20 w-[92px] min-w-[92px] border-b bg-card px-3 py-3 text-left align-bottom sm:w-[170px] sm:min-w-[170px] sm:px-5">
                <span className="label-caps">Compare</span>
              </th>
              {cols.map((col) => (
                <th key={col.c.id} scope="col" className={cn("min-w-[210px] max-w-[300px] border-b border-l px-3 py-3 sm:min-w-[250px] text-left align-bottom font-normal", col.you && "bg-accent/40")}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {leaders.has(col.c.id) && (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning/15" title={`Highest score: ${scores?.get(col.c.id)?.total}/100`}>
                        <Crown className="h-3.5 w-3.5 fill-warning text-warning" aria-label="Leader" />
                      </span>
                    )}
                    {col.you ? (
                      <>
                        <span className="truncate font-semibold">{col.c.name}</span>
                        <Badge variant="secondary" pill>You</Badge>
                      </>
                    ) : col.c.mapsUrl ? (
                      <a href={col.c.mapsUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate text-left font-semibold hover:text-primary hover:underline" title="Open in Google Maps">
                        {col.c.name}
                      </a>
                    ) : (
                      <span className="min-w-0 truncate font-semibold">{col.c.name}</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{col.c.address || " "}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((r) => (
              <tr key={r.label} className="group">
                <th scope="row" className="sticky left-0 z-10 w-[92px] min-w-[92px] border-b bg-card px-3 py-2.5 text-left align-top text-xs font-medium sm:w-[170px] sm:min-w-[170px] text-muted-foreground group-hover:bg-muted sm:px-5">
                  {r.label}
                </th>
                {cols.map((col) => (
                  <td key={col.c.id} className={cn("max-w-[300px] border-b border-l px-3 py-2.5 align-top group-hover:bg-muted/40", col.you && "bg-accent/20")}>
                    {r.cell(col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
