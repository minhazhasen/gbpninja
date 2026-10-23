"use client";

// Reviews dashboard, ported from TasksBook CRM (src/pages/ReviewsDashboard.tsx).

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronsUpDown,
  Download,
  Eye,
  EyeOff,
  Link2,
  MessageSquare,
  MessageSquareReply,
  MoreHorizontal,
  Search,
  Send,
  Star,
  Wrench,
} from "lucide-react";
import { Card, PanelHeader, StatStrip, buttonClass, inputClass } from "@/components/ui";
import { Menu, Segmented, SelectBox } from "@/components/ui-client";
import { DateRangePicker } from "@/components/date-range-picker";
import { LocationMultiSelect } from "@/components/location-multi-select";
import { GoogleIcon } from "@/components/marketing/channel-icon";
import { ReviewAvatar, ReviewStars, StarBars } from "@/components/reviews/review-bits";
import { RequestReviewDialog, ReviewDialog, type ReviewRow } from "@/components/reviews/review-dialogs";
import { updateReview, updateReviewRequest } from "@/app/(app)/actions";
import { makeRange, previousRange, rangeLabel, type DateRangeValue } from "@/lib/date-ranges";
import type { EmailSender, MessageTemplate, ReviewRequest, ReviewRequestStatus, TeamMember } from "@/lib/gbp/types";
import { serializeLocationScope } from "@/lib/location-scope";
import {
  FOLLOW_UP_LABEL,
  METHOD_LABEL,
  REQUEST_STATUSES,
  STATUS_ACTION_LABEL,
  downloadCsv,
  isReplied,
  monthlyByYear,
  needsAttention,
  needsReply,
  nextStatuses,
  pctDelta,
  requestInfo,
  responseRate,
  reviewLink,
  reviewState,
  starDistribution,
  summarize,
} from "@/lib/reviews";
import { cn } from "@/lib/utils";

type View = "reviews" | "requests";
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
  requests: allRequests,
  members,
  locations,
  scope,
  initialStatus = "all",
  initialReviewId,
  templates,
  sender,
  settingsHref,
}: {
  templates: MessageTemplate[];
  sender: EmailSender;
  settingsHref: string;
  reviews: ReviewRow[];
  requests: (ReviewRequest & { locationTitle: string })[];
  members: TeamMember[];
  locations: BoardLocation[];
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
  const requests = useMemo(() => allRequests.filter((r) => scope.includes(r.locationId)), [allRequests, scope]);

  const [range, setRange] = useState<DateRangeValue>(() => makeRange("last90", true));
  const [view, setView] = useState<View>("reviews");
  const [status, setStatus] = useState(initialStatus);
  const [search, setSearch] = useState("");
  const [member, setMember] = useState("all");
  const [rating, setRating] = useState("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState<Sort>({ key: "date", dir: -1 });
  const [limit, setLimit] = useState(PAGE);
  const [reqStatus, setReqStatus] = useState("all");
  const [reqSearch, setReqSearch] = useState("");

  const [openReview, setOpenReview] = useState<{ id: string; focus?: "reply" | "followup" } | null>(initialReviewId ? { id: initialReviewId, focus: "followup" } : null);
  const [askOpen, setAskOpen] = useState(false);
  const [completing, setCompleting] = useState<ReviewRequest | null>(null);
  const [completionRating, setCompletionRating] = useState("none");

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
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => [thisYear - 1, thisYear], [thisYear]);
  const monthly = useMemo(() => monthlyByYear(visible, years), [visible, years]);
  const allAvg = summarize(visible).avg;

  // ------------------------------------------------------------ requests view
  const reqBase = useMemo(() => {
    const q = reqSearch.trim().toLowerCase();
    return requests.filter((r) => !q || [r.name, r.email, r.phone, r.locationTitle].some((v) => v?.toLowerCase().includes(q)));
  }, [requests, reqSearch]);
  const reqCounts = useMemo(() => {
    const c: Record<string, number> = { all: reqBase.length };
    for (const r of reqBase) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [reqBase]);
  const reqRows = useMemo(() => reqBase.filter((r) => reqStatus === "all" || r.status === reqStatus).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [reqBase, reqStatus]);

  // ------------------------------------------------------------ actions
  const onSort = (k: SortKey) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: k === "client" || k === "member" ? 1 : -1 }));
  const refresh = () => router.refresh();

  const toggleHidden = async (r: ReviewRow) => {
    const res = await updateReview(r.locationId, r.id, { hidden: !r.hidden });
    if (!res.ok) return void toast.error(res.error);
    toast.success(r.hidden ? "Review shown" : "Review hidden");
    refresh();
  };

  const setRequestStatus = async (r: ReviewRequest, next: ReviewRequestStatus, rt?: number | null) => {
    if (next === "completed" && rt === undefined) {
      setCompletionRating("none");
      setCompleting(r);
      return;
    }
    const res = await updateReviewRequest(r.id, next, rt);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`Marked as ${requestInfo(next).label.toLowerCase()}`);
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
    if (view === "requests") {
      downloadCsv("review-requests.csv", [
        ["Date", "Customer", "Email", "Phone", "Method", "Location", "Status", "Rating"],
        ...reqRows.map((r) => [r.createdAt, r.name, r.email, r.phone, METHOD_LABEL[r.method], r.locationTitle, requestInfo(r.status).label, r.rating]),
      ]);
      toast.success(`Exported ${reqRows.length} rows`);
      return;
    }
    downloadCsv("reviews.csv", [
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
              { label: "Request reviews", icon: Send, onSelect: () => setAskOpen(true) },
              { label: `Copy review link${linkFor && locations.length > 1 ? ` · ${linkFor.title}` : ""}`, icon: Link2, onSelect: copyLink },
              { label: "Export CSV", icon: Download, onSelect: exportCsv, separator: true },
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
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, comment, reply…"
            aria-label="Search reviews"
            className={cn(inputClass, "h-9 py-1.5 pl-9")}
          />
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
                      <div className="flex items-center justify-end gap-1">
                        {reviewMenu(r)}
                      </div>
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

  const reqMenu = (r: ReviewRequest) => {
    const items = nextStatuses(r.status).map((st) => ({
      label: st === "sent" && r.status === "draft" ? "Mark as sent" : STATUS_ACTION_LABEL[st],
      icon: st === "sent" ? Send : MessageSquare,
      onSelect: () => void setRequestStatus(r, st),
    }));
    if (!items.length) return null;
    return (
      <Menu
        label="Request actions"
        trigger={(p) => (
          <button type="button" {...p} className={buttonClass("ghost", "icon", "h-8 w-8")} aria-label="Request actions">
            <MoreHorizontal />
          </button>
        )}
        items={items}
      />
    );
  };
  const reqBadge = (r: ReviewRequest) => (
    <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", requestInfo(r.status).tone)}>{requestInfo(r.status).label}</span>
  );

  const requestsView = (
    <>
      <div className="border-b px-3 py-3">
        {pills(
          [
            { key: "all", label: "All", count: reqCounts.all, pinned: true },
            ...REQUEST_STATUSES.map((st) => ({ key: st.key, label: st.label, count: reqCounts[st.key] ?? 0, dot: st.dot })),
          ],
          reqStatus,
          setReqStatus,
        )}
      </div>
      <div className="flex flex-col gap-2 border-b bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={reqSearch}
            onChange={(e) => setReqSearch(e.target.value)}
            placeholder="Search customer, email, phone…"
            aria-label="Search requests"
            className={cn(inputClass, "h-9 py-1.5 pl-9")}
          />
        </div>
        <button type="button" className={buttonClass("default", "sm", "h-9")} onClick={() => setAskOpen(true)}>
          <Send /> Request reviews
        </button>
      </div>
      {reqRows.length === 0 ? (
        <p className="py-14 text-center text-sm text-muted-foreground">{requests.length ? "Nothing here" : "No review requests yet — send your first one."}</p>
      ) : (
        <>
          <ul className="divide-y xl:hidden">
            {reqRows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <ReviewAvatar name={r.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {fmtDate(r.sentAt ?? r.createdAt)} · {METHOD_LABEL[r.method]}
                  </span>
                </span>
                {reqBadge(r)}
                {reqMenu(r)}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  {["Customer", "Location", "Sent by", "Date", "Status", "Rating"].map((h, i) => (
                    <th key={h} className={cn("whitespace-nowrap px-3 py-2.5 font-semibold", i === 0 && "pl-4")}>
                      {h}
                    </th>
                  ))}
                  <th className="w-[60px]" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {reqRows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-muted/40">
                    <td className="py-3 pl-4 pr-3">
                      <div className="flex items-center gap-3">
                        <ReviewAvatar name={r.name} />
                        <div className="min-w-0">
                          <p className="max-w-[200px] truncate font-semibold">{r.name}</p>
                          <p className="max-w-[200px] truncate text-xs text-muted-foreground">{r.email || r.phone || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-3 text-xs">{r.locationTitle}</td>
                    <td className="px-3 py-3 text-xs">{METHOD_LABEL[r.method]}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{fmtDate(r.sentAt ?? r.createdAt)}</td>
                    <td className="px-3 py-3">{reqBadge(r)}</td>
                    <td className="px-3 py-3">{r.rating ? <ReviewStars rating={r.rating} /> : <span className="text-muted-foreground/50">—</span>}</td>
                    <td className="pr-3 text-right">{reqMenu(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              setView("reviews");
              setStatus(status === "reply" && view === "reviews" ? "all" : "reply");
            },
            active: view === "reviews" && status === "reply",
          },
          {
            label: "Low ratings",
            value: overview.attention,
            hint: overview.attention ? "≤3★ not handled" : "All handled",
            alert: overview.attention > 0,
            onClick: () => {
              setView("reviews");
              setStatus(status === "attention" && view === "reviews" ? "all" : "attention");
            },
            active: view === "reviews" && status === "attention",
          },
        ]}
      />

      {visible.length > 0 && (
        <Card className="grid min-w-0 overflow-hidden lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div className="min-w-0 border-b lg:border-b-0 lg:border-r">
            <PanelHeader title="Ratings" meta={allAvg != null ? `${allAvg.toFixed(1)} ★ · ${visible.length.toLocaleString()}` : undefined} />
            <StarBars
              className="px-4 py-4 lg:px-5"
              dist={dist}
              active={rating === "all" ? null : Number(rating)}
              onPick={(n) => {
                setView("reviews");
                setRating(rating === String(n) ? "all" : String(n));
              }}
            />
          </div>
          <div className="min-w-0">
            <PanelHeader
              title="Reviews by month"
              action={
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/35" />
                    {years[0]}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-1)" }} />
                    {years[1]}
                  </span>
                </div>
              }
            />
            <div className="h-[220px] px-2 pb-3 pt-4 sm:px-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval={0} minTickGap={0} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as Record<string, number | string>;
                      return (
                        <div className="min-w-[130px] rounded-md border bg-popover px-3 py-2 text-xs shadow-elegant">
                          <p className="mb-1 font-semibold">{p.month}</p>
                          {years.map((y, i) => (
                            <div key={y} className="flex items-center justify-between gap-4 py-0.5">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span className={cn("h-2 w-2 rounded-sm", i === 0 && "bg-muted-foreground/40")} style={i === 1 ? { background: "var(--viz-1)" } : undefined} />
                                {y}
                              </span>
                              <span className="tabular-nums">{Number(p[String(y)] ?? 0)}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey={String(years[0])} fill="hsl(var(--muted-foreground))" fillOpacity={0.35} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                  <Bar dataKey={String(years[1])} fill="var(--viz-1)" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b px-3 py-2.5">
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              {
                value: "reviews",
                label: (
                  <>
                    <Star className="h-3.5 w-3.5" /> Reviews
                  </>
                ),
              },
              {
                value: "requests",
                label: (
                  <>
                    <Send className="h-3.5 w-3.5" /> Requests
                  </>
                ),
              },
            ]}
          />
        </div>
        {view === "requests" ? requestsView : reviewsView}
      </Card>

      <ReviewDialog review={current} open={!!current} onClose={() => setOpenReview(null)} members={members} focus={openReview?.focus} templates={templates} />
      <RequestReviewDialog
        open={askOpen}
        onClose={() => setAskOpen(false)}
        locations={locations}
        defaultLocationId={singleLocation?.id ?? locations[0]?.id ?? ""}
        templates={templates}
        sender={sender}
        settingsHref={settingsHref}
      />

      {completing &&
        (() => {
          const done = async () => {
            await setRequestStatus(completing, "completed", completionRating === "none" ? null : Number(completionRating));
            setCompleting(null);
          };
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50" onClick={() => setCompleting(null)} />
              <div role="dialog" aria-modal="true" aria-labelledby="complete-title" className="relative w-full max-w-sm space-y-4 rounded-2xl border bg-card p-5 shadow-elegant">
                <h2 id="complete-title" className="text-base font-semibold">
                  Mark as reviewed
                </h2>
                <div className="space-y-1.5">
                  <span className="label-caps block">Rating they left</span>
                  <SelectBox
                    label="Rating"
                    value={completionRating}
                    onChange={setCompletionRating}
                    options={[{ value: "none", label: "Not known" }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n > 1 ? "s" : ""}` }))]}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className={buttonClass("outline")} onClick={() => setCompleting(null)}>
                    Cancel
                  </button>
                  <button type="button" className={buttonClass()} onClick={done}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
