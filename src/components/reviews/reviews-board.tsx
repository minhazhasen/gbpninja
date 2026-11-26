"use client";

// Reviews dashboard, ported from TasksBook CRM (src/pages/ReviewsDashboard.tsx).

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown, Download, Eye, EyeOff, Link2, MessageSquareReply, MoreHorizontal, Search, Star, Wrench } from "lucide-react";
import { Card, PanelHeader, StatStrip, buttonClass, inputClass } from "@/components/ui";
import { Menu, SelectBox } from "@/components/ui-client";
import { ReviewTrendChart } from "./review-trend-chart";
import { DateRangePicker } from "@/components/date-range-picker";
import { LocationMultiSelect } from "@/components/location-multi-select";
import { GoogleIcon } from "@/components/marketing/channel-icon";
import { ReviewAvatar, ReviewStars, StarBars } from "@/components/reviews/review-bits";
import { ReviewDialog, type ReviewRow } from "@/components/reviews/review-dialogs";
import { updateReview } from "@/app/(app)/actions";
import { makeRange, previousRange, rangeLabel, type DateRangeValue } from "@/lib/date-ranges";
import type { MessageTemplate, TeamMember } from "@/lib/gbp/types";
import { csvFilename } from "@/lib/csv";
import { serializeLocationScope } from "@/lib/location-scope";
import {
  FOLLOW_UP_LABEL,
  downloadCsv,
  isReplied,
  needsAttention,
  needsReply,
  pctDelta,
  responseRate,
  reviewLink,
  reviewState,
  starDistribution,
  summarize,
} from "@/lib/reviews";
import { cn } from "@/lib/utils";

type SortKey = "date" | "client" | "rating" | "member";
type Sort = { key: SortKey; dir: 1 | -1 };
const PAGE = 50;

const fmtDate = (iso?: string | null) => (iso ? format(parseISO(iso), "MMM d, yyyy") : "—");

export interface BoardLocation {
  id: string;
  title: string;
  placeId?: string;
}

export function ReviewsBoard({
  reviews: allReviews,
  members,
  locations,
  timeZone,
  scope,
  initialStatus = "all",
  initialReviewId,
  templates,
}: {
  templates: MessageTemplate[];
  reviews: ReviewRow[];
  members: TeamMember[];
  locations: BoardLocation[];
  /** The business's time zone, for counting reviews per day / month in its own calendar. */
  timeZone?: string;
  /** Selected location ids (one or more). */
  scope: string[];
  /** Status pill to start on (deep links such as "Needs reply"). */
  initialStatus?: string;
  /** Review to open on load (e.g. "Open review" from a follow-up task). */
  initialReviewId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const reviews = useMemo(() => allReviews.filter((r) => scope.includes(r.locationId)), [allReviews, scope]);

  const [range, setRange] = useState<DateRangeValue>(() => makeRange("last90", true));
  const [status, setStatus] = useState(initialStatus);
  const [search, setSearch] = useState("");
  const [member, setMember] = useState("all");
  const [rating, setRating] = useState("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState<Sort>({ key: "date", dir: -1 });
  const [limit, setLimit] = useState(PAGE);

  const [openReview, setOpenReview] = useState<{ id: string; focus?: "reply" | "followup" } | null>(initialReviewId ? { id: initialReviewId, focus: "followup" } : null);

  useEffect(() => setLimit(PAGE), [status, search, member, rating, source, scope]);

  const nameOf = (id?: string | null) => (id ? (members.find((m) => m.id === id)?.name ?? "Teammate") : null);
  const sources = ["Google"];
  const current = openReview ? (reviews.find((r) => r.id === openReview.id) ?? null) : null;
  const singleLocation = scope.length === 1 ? locations.find((l) => l.id === scope[0]) : undefined;

  // ------------------------------------------------------------ reviews view
  const visible = useMemo(() => reviews.filter((r) => !r.hidden), [reviews]);

  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews.filter((r) => {
      if (q && ![r.reviewer, r.comment, r.reply?.comment, r.locationTitle].some((v) => v?.toLowerCase().includes(q))) return false;
      if (member === "none" && r.assignedTo) return false;
      if (member !== "all" && member !== "none" && r.assignedTo !== member) return false;
      if (rating !== "all" && r.rating !== Number(rating)) return false;
      if (source !== "all" && source !== "Google") return false; // every review comes from Google today
      return true;
    });
  }, [reviews, search, member, rating, source]);

  const counts = useMemo(() => {
    const c = { all: 0, attention: 0, reply: 0, followed: 0, replied: 0, hidden: 0 };
    for (const r of base) {
      if (r.hidden) {
        c.hidden++;
        continue;
      }
      c.all++;
      if (needsAttention(r)) c.attention++;
      if (needsReply(r)) c.reply++;
      if (r.followUp) c.followed++;
      if (isReplied(r)) c.replied++;
    }
    return c;
  }, [base]);

  const rows = useMemo(() => {
    const filtered = base.filter((r) => {
      if (status === "hidden") return !!r.hidden;
      if (r.hidden) return false;
      if (status === "attention") return needsAttention(r);
      if (status === "reply") return needsReply(r);
      if (status === "followed") return !!r.followUp;
      if (status === "replied") return isReplied(r);
      return true;
    });
    const key = (r: ReviewRow): string | number =>
      sort.key === "client" ? r.reviewer.toLowerCase() : sort.key === "rating" ? r.rating : sort.key === "member" ? (nameOf(r.assignedTo) ?? "~").toLowerCase() : r.createTime;
    return [...filtered].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, status, sort, members]);

  // ------------------------------------------------------------ overview
  const overview = useMemo(() => {
    // Inclusive days: [from 00:00, day after `to` 00:00)
    const end = addDays(range.to, 1);
    const inWin = (iso: string, a: Date | null, b: Date) => (!a || new Date(iso) >= a) && new Date(iso) < b;
    const cur = visible.filter((r) => inWin(r.createTime, range.from, end));
    const p = range.compare ? previousRange(range) : null;
    const prev = p ? visible.filter((r) => inWin(r.createTime, p.from, addDays(p.to, 1))) : null;
    const s = summarize(cur);
    const ps = prev ? summarize(prev) : null;
    return {
      summary: s,
      avgDelta: s.avg != null && ps?.avg != null ? pctDelta(Math.round(s.avg * 100), Math.round(ps.avg * 100)) : null,
      countDelta: pctDelta(cur.length, prev ? prev.length : null),
      rate: responseRate(cur),
      replied: cur.filter(isReplied).length,
      unreplied: visible.filter(needsReply).length,
      attention: visible.filter(needsAttention).length,
    };
  }, [range, visible]);

  // All-time rating picture (not tied to the date range).
  const dist = useMemo(() => starDistribution(visible), [visible]);
  const allAvg = summarize(visible).avg;

  // ------------------------------------------------------------ actions
  const onSort = (k: SortKey) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: k === "client" || k === "member" ? 1 : -1 }));
  const refresh = () => router.refresh();

  const toggleHidden = async (r: ReviewRow) => {
    const res = await updateReview(r.locationId, r.id, { hidden: !r.hidden });
    if (!res.ok) return void toast.error(res.error);
    toast.success(r.hidden ? "Review shown" : "Review hidden");
    refresh();
  };

  const linkFor = singleLocation ?? locations[0];
  const copyLink = () => {
    const url = reviewLink(linkFor?.placeId);
    if (!url) return void toast.error("This location has no Google place id yet");
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(`Review link for ${linkFor?.title} copied`))
      .catch(() => toast.error("Could not copy link"));
  };

  const exportCsv = () => {
    const name = (what: string) => csvFilename(what, singleLocation?.title ?? (locations.length > 1 ? "all-locations" : locations[0]?.title), format(new Date(), "yyyy-MM-dd"));
    if (!rows.length) return void toast.error("Nothing to export");
    downloadCsv(name("reviews"), [
      ["Date", "Reviewer", "Location", "Rating", "Comment", "Team member", "Source", "Reply", "Replied at", "Follow-up", "Hidden"],
      ...rows.map((r) => [
        r.createTime,
        r.reviewer,
        r.locationTitle,
        r.rating,
        r.comment,
        nameOf(r.assignedTo),
        "Google",
        r.reply?.comment,
        r.reply?.updateTime,
        r.followUp ? FOLLOW_UP_LABEL[r.followUp.type] : "",
        r.hidden ? "Yes" : "",
      ]),
    ]);
    toast.success(`Exported ${rows.length} reviews`);
  };

  // ------------------------------------------------------------ header
  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        {locations.length > 1 && (
          <LocationMultiSelect
            className="w-full sm:w-60"
            locations={locations}
            value={scope}
            onChange={(ids) =>
              router.push(
                `${pathname}?location=${encodeURIComponent(
                  serializeLocationScope(
                    ids,
                    locations.map((l) => l.id),
                  ),
                )}`,
              )
            }
          />
        )}
        <div className="flex min-w-0 items-center gap-2">
          <DateRangePicker className="min-w-0 flex-1 sm:w-[300px] sm:flex-none" value={range} onChange={setRange} />
          <Menu
            label="More"
            align="end"
            width="w-56"
            trigger={(p) => (
              <button type="button" {...p} className={buttonClass("outline", "icon")} aria-label="More">
                <MoreHorizontal />
              </button>
            )}
            items={[
              { label: `Copy review link${linkFor && locations.length > 1 ? ` · ${linkFor.title}` : ""}`, icon: Link2, onSelect: copyLink },
              { label: "Export reviews (CSV)", icon: Download, onSelect: exportCsv, separator: true },
            ]}
          />
        </div>
      </div>
    </div>
  );

  // ------------------------------------------------------------ pieces
  const pills = (options: { key: string; label: string; count: number; dot?: string; pinned?: boolean }[], value: string, onChange: (k: string) => void) => {
    const shown = options.filter((o) => o.pinned || o.count > 0 || o.key === value);
    const overflow = options.filter((o) => !shown.includes(o));
    return (
      <div className="flex items-center gap-2">
        <div role="tablist" className="no-scrollbar -my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1">
          {shown.map((t) => {
            const on = value === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onChange(t.key)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.dot && <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-primary-foreground/80" : t.dot)} />}
                {t.label}
                <span className={cn("text-xs tabular-nums", on ? "text-primary-foreground/80" : "text-muted-foreground/70")}>{t.count}</span>
              </button>
            );
          })}
        </div>
        {overflow.length > 0 && (
          <Menu
            label="More filters"
            trigger={(p) => (
              <button
                type="button"
                {...p}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border bg-background px-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                More <ChevronDown className="h-3.5 w-3.5" />
              </button>
            )}
            items={overflow.map((o) => ({
              label: (
                <span className="flex items-center gap-2">
                  {o.dot && <span className={cn("h-1.5 w-1.5 rounded-full", o.dot)} />}
                  <span className="flex-1">{o.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{o.count}</span>
                </span>
              ),
              onSelect: () => onChange(o.key),
            }))}
          />
        )}
      </div>
    );
  };

  const sortTh = (label: string, k: SortKey, className?: string) => {
    const active = sort.key === k;
    const Icon = !active ? ChevronsUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th className={cn("whitespace-nowrap px-3 py-2.5 font-semibold", className)} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
        <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
          {label}
          <Icon className={cn("h-3 w-3", !active && "opacity-40")} />
        </button>
      </th>
    );
  };

  const reviewMenu = (r: ReviewRow) => (
    <Menu
      label="Review actions"
      trigger={(p) => (
        <button type="button" {...p} className={buttonClass("ghost", "icon", "h-8 w-8")} aria-label="Review actions">
          <MoreHorizontal />
        </button>
      )}
      items={[
        { label: "Open review", icon: Star, onSelect: () => setOpenReview({ id: r.id }) },
        { label: isReplied(r) ? "Edit reply" : "Reply", icon: MessageSquareReply, onSelect: () => setOpenReview({ id: r.id, focus: "reply" }) },
        { label: "Create follow-up", icon: Wrench, onSelect: () => setOpenReview({ id: r.id, focus: "followup" }) },
        { label: r.hidden ? "Show" : "Hide", icon: r.hidden ? Eye : EyeOff, onSelect: () => void toggleHidden(r), separator: true },
      ]}
    />
  );

  const statusBadge = (r: ReviewRow) => {
    const st = reviewState(r);
    return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", st.tone)}>{st.label}</span>;
  };

  const clientCell = (r: ReviewRow) => (
    <div className="flex items-center gap-3">
      <ReviewAvatar name={r.reviewer} photo={r.reviewerPhoto} />
      <div className="min-w-0">
        <p className="max-w-[200px] truncate font-semibold">{r.reviewer}</p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <GoogleIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">Google · {r.locationTitle}</span>
        </p>
      </div>
    </div>
  );

  // ------------------------------------------------------------ views
  const reviewsView = (
    <>
      <div className="border-b px-3 py-3">
        {pills(
          [
            { key: "all", label: "All", count: counts.all, pinned: true },
            { key: "attention", label: "Needs follow-up", count: counts.attention, dot: "bg-destructive" },
            { key: "reply", label: "Needs reply", count: counts.reply, dot: "bg-warning", pinned: true },
            { key: "followed", label: "Followed up", count: counts.followed, dot: "bg-info" },
            { key: "replied", label: "Replied", count: counts.replied, dot: "bg-success", pinned: true },
            { key: "hidden", label: "Hidden", count: counts.hidden, dot: "bg-muted-foreground" },
          ],
          status,
          setStatus,
        )}
      </div>
      <div className="flex flex-col gap-2 border-b bg-muted/20 px-3 py-2.5 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client, comment, reply…" aria-label="Search reviews" className={cn(inputClass, "h-9 py-1.5 pl-9")} />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex">
          <SelectBox
            label="Team member"
            className="lg:w-[180px]"
            value={member}
            onChange={setMember}
            options={[{ value: "all", label: "Everyone" }, { value: "none", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
          />
          <SelectBox
            label="Rating"
            className="lg:w-[150px]"
            value={rating}
            onChange={setRating}
            options={[{ value: "all", label: "All ratings" }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n > 1 ? "s" : ""}` }))]}
          />
          <SelectBox
            label="Source"
            className="col-span-2 lg:col-span-1 lg:w-[150px]"
            value={source}
            onChange={setSource}
            options={[{ value: "all", label: "All sources" }, ...sources.map((s) => ({ value: s, label: s }))]}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-14 text-center text-sm text-muted-foreground">{reviews.length === 0 ? "No reviews yet" : "No reviews match"}</p>
      ) : (
        <>
          {/* Phones, tablets and small laptops: cards */}
          <ul className="divide-y xl:hidden">
            {rows.slice(0, limit).map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenReview({ id: r.id })} className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-muted/40">
                  <span className="flex w-full items-start gap-3">
                    <span className="min-w-0 flex-1">{clientCell(r)}</span>
                    <ReviewStars rating={r.rating} />
                  </span>
                  {r.comment && <span className="line-clamp-2 text-sm text-muted-foreground">“{r.comment}”</span>}
                  <span className="flex w-full items-center gap-2 text-xs text-muted-foreground">
                    {fmtDate(r.createTime)}
                    {nameOf(r.assignedTo) && <span>· {nameOf(r.assignedTo)}</span>}
                    <span className="ml-auto">{statusBadge(r)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/* Wide screens (xl): table */}
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  {sortTh("Date", "date", "pl-4")}
                  {sortTh("Client", "client")}
                  {sortTh("Rating", "rating")}
                  <th className="px-3 py-2.5 font-semibold">Comment</th>
                  {sortTh("Team member", "member")}
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="w-[56px]" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.slice(0, limit).map((r) => (
                  <tr key={r.id} onClick={() => setOpenReview({ id: r.id })} className="cursor-pointer transition-colors hover:bg-muted/40">
                    <td className="whitespace-nowrap py-3 pl-4 pr-3 text-xs text-muted-foreground">{fmtDate(r.createTime)}</td>
                    <td className="px-3 py-3">{clientCell(r)}</td>
                    <td className="px-3 py-3">
                      <ReviewStars rating={r.rating} />
                    </td>
                    <td className="max-w-[300px] px-3 py-3">
                      {r.comment ? <p className="line-clamp-2 text-xs text-muted-foreground">{r.comment}</p> : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="max-w-[150px] truncate px-3 py-3 text-xs">{nameOf(r.assignedTo) ?? <span className="text-muted-foreground/50">—</span>}</td>
                    <td className="px-3 py-3">{statusBadge(r)}</td>
                    <td className="pr-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">{reviewMenu(r)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
            <span>
              {Math.min(limit, rows.length)} of {rows.length}
            </span>
            {rows.length > limit && (
              <button type="button" className={buttonClass("ghost", "sm", "h-7")} onClick={() => setLimit((n) => n + PAGE)}>
                Show more
              </button>
            )}
          </div>
        </>
      )}
    </>
  );

  const s = overview.summary;

  return (
    <div className="space-y-5 pb-8">
      {header}

      <StatStrip
        cols={5}
        items={[
          { label: "Reviews", value: s.count.toLocaleString(), delta: overview.countDelta, hint: overview.countDelta == null ? rangeLabel(range) : undefined },
          {
            label: "Average rating",
            value: s.avg != null ? s.avg.toFixed(2) : "—",
            delta: overview.avgDelta,
            hint: overview.avgDelta == null && s.fiveShare != null ? `${s.fiveShare}% five-star` : undefined,
          },
          { label: "Response rate", value: overview.rate != null ? `${overview.rate}%` : "—", hint: `${overview.replied} of ${s.count} replied` },
          {
            label: "Unreplied",
            value: overview.unreplied,
            hint: "All time",
            onClick: () => {
              setStatus(status === "reply" ? "all" : "reply");
            },
            active: status === "reply",
          },
          {
            label: "Low ratings",
            value: overview.attention,
            hint: overview.attention ? "≤3★ not handled" : "All handled",
            alert: overview.attention > 0,
            onClick: () => {
              setStatus(status === "attention" ? "all" : "attention");
            },
            active: status === "attention",
          },
        ]}
      />

      {visible.length > 0 && (
        <Card className="grid min-w-0 overflow-hidden lg:grid-cols-[minmax(0,290px)_minmax(0,1fr)]">
          <div className="min-w-0 border-b lg:border-b-0 lg:border-r">
            <PanelHeader title="Ratings" meta={allAvg != null ? `${allAvg.toFixed(1)} ★ · ${visible.length.toLocaleString()}` : undefined} />
            <StarBars
              className="px-4 py-4 lg:px-5"
              dist={dist}
              active={rating === "all" ? null : Number(rating)}
              onPick={(n) => {
                setRating(rating === String(n) ? "all" : String(n));
              }}
            />
          </div>
          <ReviewTrendChart items={visible} range={range} timeZone={timeZone} />
        </Card>
      )}

      <Card className="overflow-hidden">
        {reviewsView}
      </Card>

      <ReviewDialog review={current} open={!!current} onClose={() => setOpenReview(null)} members={members} focus={openReview?.focus} templates={templates} />
    </div>
  );
}
