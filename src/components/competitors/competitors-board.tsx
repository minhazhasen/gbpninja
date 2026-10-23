"use client";

// Competitors: this profile next to nearby businesses with the same main category — name, location, category, sub-categories,
// reviews and rating — plus the sub-categories competitors use that this profile doesn't. Competitors can be added (search) and removed
// (they go to a hidden list and can be restored).
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ArrowDown, ArrowUp, Check, ChevronDown, ExternalLink, EyeOff, Loader2, MapPin, MoreHorizontal, Pencil, Plus, RefreshCw, RotateCcw, Search, Star, TriangleAlert } from "lucide-react";
import { addCompetitor, checkCompetitorsNow, deleteCompetitor, setCompetitorHidden, updateProfile } from "@/app/(app)/actions";
import { Badge, Card, EmptyState, PageHeader, PanelHeader, buttonClass, inputClass } from "@/components/ui";
import { CompetitorStats, RatingValue, type StandingMetric } from "./competitor-stats";
import { Menu } from "@/components/ui-client";
import { CompetitorDialog } from "./add-competitor-dialog";
import { ReviewGrowthChart } from "./review-growth-chart";
import type { Competitor } from "@/lib/gbp/types";
import { MAX_COMPETITORS, categoryUsage, changeOver } from "@/lib/competitors";
import { MAX_SECONDARY_CATEGORIES } from "@/lib/profile";
import { cn } from "@/lib/utils";

type Row = Competitor & { you?: boolean };
type SortKey = "name" | "distance" | "reviews" | "rating";

const mapsUrl = (r: Row) => r.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.address}`)}`;
const km = (r: Row) => (r.distanceKm == null ? "—" : `${r.distanceKm.toFixed(1)} km`);
const avg = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null);

/** Gap to the nearby average as a pill: "+12" good, "−0.4" bad, "Even" within `tolerance`. */
function delta(diff: number, fmt: (n: number) => string, tolerance: number): StandingMetric["delta"] {
  if (Math.abs(diff) < tolerance) return { tone: "even", text: "Even" };
  return { tone: diff > 0 ? "good" : "bad", text: `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))}` };
}

export function CompetitorsBoard({ locationId, you, competitors: everyone, categoriesHref }: { locationId: string; you: Competitor; competitors: Competitor[]; categoriesHref: string }) {
  const router = useRouter();
  const competitors = useMemo(() => everyone.filter((c) => !c.hidden), [everyone]);
  const hidden = useMemo(() => everyone.filter((c) => c.hidden), [everyone]);
  const [addOpen, setAddOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const tracked = everyone.filter((c) => c.source === "added");
  const addedCount = tracked.length;
  const atLimit = addedCount >= MAX_COMPETITORS;
  const linked = tracked.filter((c) => c.mapsUrl);
  const lastCheck =
    linked
      .map((c) => c.checkedAt)
      .filter((x): x is string => !!x)
      .sort()
      .at(-1) ?? null;
  const checkNow = async () => {
    setChecking(true);
    const res = await checkCompetitorsNow(locationId);
    setChecking(false);
    if (!res.ok) return void toast.error(res.error);
    if (res.failed) toast.warning(`Checked ${res.updated} of ${res.checked}`, { description: "Some Google profiles couldn't be read. They'll be tried again tomorrow." });
    else toast.success(`Updated ${res.updated} competitor${res.updated === 1 ? "" : "s"} from Google`);
    router.refresh();
  };
  const [editing, setEditing] = useState<Competitor | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "reviews", desc: true });
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  const all: Row[] = useMemo(() => [{ ...you, you: true }, ...competitors], [you, competitors]);
  // Your business always stays on top; the sort and search apply to competitors.
  const rows = useMemo((): Row[] => {
    const needle = q.trim().toLowerCase();
    const value = (r: Row) =>
      sort.key === "name" ? r.name.toLowerCase() : sort.key === "distance" ? (r.distanceKm ?? Number.POSITIVE_INFINITY) : sort.key === "reviews" ? r.reviewCount : (r.rating ?? 0);
    const others = competitors
      .filter((r) => !needle || [r.name, r.address, r.primaryCategory, ...r.additionalCategories].some((s) => s.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const [x, y] = [value(a), value(b)];
        const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
        return sort.desc ? -c : c;
      });
    return [all[0], ...others];
  }, [all, competitors, q, sort]);

  // Summary: where you stand on reviews and rating among everyone listed.
  const rated = competitors.filter((c) => c.rating != null);
  // Rounded like it is shown, so "0.4 below 4.6" adds up.
  const rawRating = avg(rated.map((c) => c.rating!));
  const avgRating = rawRating == null ? null : Math.round(rawRating * 10) / 10;
  const avgReviews = avg(competitors.map((c) => c.reviewCount));
  const maxReviews = Math.max(1, ...all.map((r) => r.reviewCount));
  // Review pace: reviews gained in the last 30 days (competitors with enough history only).
  const yourPace = changeOver(you.history, 30)?.reviews ?? 0;
  const paced = competitors.flatMap((c) => {
    const pace = changeOver(c.history, 30)?.reviews;
    return pace == null ? [] : [{ name: c.name, pace }];
  });
  const avgPace = avg(paced.map((p) => p.pace));

  // Sub-categories nearby businesses use, most common first; flag the ones this profile is missing.
  const yours = useMemo(() => new Set([you.primaryCategory, ...you.additionalCategories].map((c) => c.toLowerCase())), [you]);
  const categories = useMemo(() => categoryUsage(competitors).map((c) => ({ ...c, have: yours.has(c.name.toLowerCase()) })), [competitors, yours]);
  const missing = categories.filter((c) => !c.have);
  const full = you.additionalCategories.length >= MAX_SECONDARY_CATEGORIES;

  /** Add a competitor's category to this profile's additional categories (undo removes it again). */
  const save = (list: string[]) => updateProfile(locationId, { additionalCategories: list });
  const addCategory = async (name: string) => {
    setAdding(name);
    const res = await save([...you.additionalCategories, name]);
    setAdding(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`Added "${name}" to your profile`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: async () => {
          const undo = await save(you.additionalCategories);
          if (!undo.ok) return void toast.error(undo.error);
          router.refresh();
        },
      },
    });
    router.refresh();
  };

  /** Remove from the comparison (with undo) or restore from the hidden list. */
  /** Delete a competitor you added; Undo adds it back with the same details. */
  const remove = async (c: Competitor) => {
    if (c.source !== "added") return setHidden(c, true);
    const res = await deleteCompetitor(locationId, c.id);
    if (!res.ok) return void toast.error(res.error);
    const { name, address, primaryCategory, additionalCategories, rating, reviewCount, websiteUri, mapsUrl, cid, distanceKm } = c;
    toast.success(`Removed ${c.name}`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () =>
          void addCompetitor(locationId, {
            name,
            address,
            primaryCategory,
            additionalCategories,
            rating,
            reviewCount,
            websiteUri: websiteUri ?? null,
            mapsUrl: mapsUrl ?? null,
            cid: cid ?? null,
            distanceKm,
          }).then(() => router.refresh()),
      },
    });
    router.refresh();
  };
  const setHidden = async (c: Competitor, hide: boolean) => {
    const res = await setCompetitorHidden(locationId, c.id, hide);
    if (!res.ok) return void toast.error(res.error);
    if (hide)
      toast.success(`Removed ${c.name}`, {
        duration: 8000,
        action: { label: "Undo", onClick: () => void setCompetitorHidden(locationId, c.id, false).then(() => router.refresh()) },
      });
    else toast.success(`${c.name} is back in your list`);
    router.refresh();
  };
  const rowMenu = (r: Row) =>
    r.you ? (
      <span />
    ) : (
      <Menu
        label={`${r.name} actions`}
        trigger={(p) => (
          <button type="button" {...p} className={buttonClass("ghost", "icon", "h-8 w-8 text-muted-foreground")} aria-label={`${r.name} actions`}>
            <MoreHorizontal />
          </button>
        )}
        items={[
          ...(r.source === "added" ? [{ label: "Edit details", icon: Pencil, onSelect: () => setEditing(r) }] : []),
          { label: "Open in Google Maps", icon: MapPin, onSelect: () => window.open(mapsUrl(r), "_blank", "noopener") },
          { label: "Remove from list", icon: EyeOff, onSelect: () => remove(r), tone: "danger", separator: true },
        ]}
      />
    );

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" && key !== "distance" }));
  const header = (key: SortKey, label: string, right = false) => (
    <button type="button" onClick={() => toggle(key)} className={cn("label-caps inline-flex items-center gap-1 hover:text-foreground", right && "ml-auto", sort.key === key && "text-foreground")}>
      {label}
      {sort.key === key && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
    </button>
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Competitors">
        {you.name} vs {competitors.length} nearby {you.primaryCategory.toLowerCase()} business{competitors.length === 1 ? "" : "es"}
      </PageHeader>

      <CompetitorStats
        metrics={[
          {
            label: "Rating",
            value: <RatingValue value={you.rating} />,
            delta: you.rating != null && avgRating != null ? delta(you.rating - avgRating, (n) => n.toFixed(1), 0.05) : null,
            sub: avgRating != null ? `Nearby avg ${avgRating.toFixed(1)}` : "No nearby ratings yet",
          },
          {
            label: "Reviews",
            value: you.reviewCount.toLocaleString(),
            delta: avgReviews != null ? delta(you.reviewCount - avgReviews, (n) => Math.round(n).toLocaleString(), 0.5) : null,
            sub: avgReviews != null ? `Nearby avg ${Math.round(avgReviews).toLocaleString()}` : "No competitors yet",
          },
          {
            label: "New · 30 days",
            value: `+${yourPace}`,
            delta: avgPace != null ? delta(yourPace - avgPace, (n) => String(Math.round(n)), 0.5) : null,
            sub: avgPace != null ? `Nearby avg +${Math.round(avgPace)}` : "Reviews gained",
          },
        ]}
        missing={missing.length}
        totalCategories={categories.length}
        onAddCategories={() => document.getElementById("nearby-categories")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

      <ReviewGrowthChart series={[{ ...you, you: true }, ...competitors].map((c) => ({ id: c.id, name: c.name, you: c.id === you.id, reviewCount: c.reviewCount, history: c.history }))} />

      <Card className="overflow-hidden">
        <PanelHeader
          title="You vs competitors"
          meta={competitors.length}
          action={
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, category, area…" aria-label="Search competitors" className={cn(inputClass, "h-9 pl-9")} />
              </label>
              <button
                type="button"
                className={buttonClass("default", "sm", "h-9")}
                onClick={() => setAddOpen(true)}
                disabled={atLimit}
                title={atLimit ? `You can track up to ${MAX_COMPETITORS} competitors. Remove one to add another.` : undefined}
              >
                <Plus /> <span className="hidden sm:inline">Add competitor</span>
                <span className="sm:hidden">Add</span>
                <span className="text-xs font-normal opacity-80">
                  {addedCount}/{MAX_COMPETITORS}
                </span>
              </button>
            </div>
          }
        />
        {!competitors.length ? (
          <EmptyState title="No competitors yet">We look for nearby businesses with the same main category. Use Add competitor to add one yourself.</EmptyState>
        ) : (
          <>
            {/* lg and up: table */}
            <div className="hidden lg:block">
              <div className="grid grid-cols-[minmax(0,2.2fr)_80px_minmax(0,1fr)_minmax(0,1.6fr)_150px_96px_32px] items-center gap-4 border-b bg-muted/30 px-6 py-2.5 text-muted-foreground">
                {header("name", "Business")}
                {header("distance", "Distance")}
                <span className="label-caps">Category</span>
                <span className="label-caps">Sub-categories</span>
                {header("reviews", "Reviews")}
                {header("rating", "Rating")}
                <span />
              </div>
              <ul className="divide-y">
                {rows.map((r) => (
                  <li key={r.id} className={cn("grid grid-cols-[minmax(0,2.2fr)_80px_minmax(0,1fr)_minmax(0,1.6fr)_150px_96px_32px] items-center gap-4 px-6 py-3 text-sm", r.you && "bg-accent/40")}>
                    <Business row={r} />
                    <span className="tabular-nums text-muted-foreground">{r.you ? "—" : km(r)}</span>
                    <span className="truncate">{r.primaryCategory}</span>
                    <SubCategories list={r.additionalCategories} yours={r.you ? undefined : yours} />
                    <Reviews count={r.reviewCount} max={maxReviews} you={r.you} change={changeOver(r.history, 7)} />
                    <Rating value={r.rating} change={changeOver(r.history, 30)?.rating ?? null} />
                    {rowMenu(r)}
                  </li>
                ))}
              </ul>
            </div>
            {/* Below lg: stacked cards */}
            <ul className="divide-y lg:hidden">
              {rows.map((r) => (
                <li key={r.id} className={cn("space-y-2 px-4 py-3 sm:px-5", r.you && "bg-accent/40")}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Business row={r} />
                    </div>
                    {!r.you && <div className="-mr-2 -mt-1">{rowMenu(r)}</div>}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{r.primaryCategory}</span>
                    {!r.you && r.distanceKm != null && <span>{km(r)} away</span>}
                  </p>
                  {r.additionalCategories.length > 0 && <SubCategories list={r.additionalCategories} yours={r.you ? undefined : yours} />}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <Rating value={r.rating} change={changeOver(r.history, 30)?.rating ?? null} />
                    <span className="text-sm tabular-nums">
                      <span className="font-semibold">{r.reviewCount.toLocaleString()}</span> <span className="text-muted-foreground">reviews</span>
                      <ReviewChange change={changeOver(r.history, 7)} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {q && rows.length === 1 && <p className="border-t px-5 py-4 text-center text-sm text-muted-foreground">No competitors match &ldquo;{q}&rdquo;.</p>}
          </>
        )}
        {linked.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-5 py-2.5 text-xs text-muted-foreground lg:px-6">
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="min-w-0 flex-1" suppressHydrationWarning>
              Ratings and reviews of added competitors update daily from Google
              {lastCheck && ` · last checked ${formatDistanceToNow(parseISO(lastCheck), { addSuffix: true })}`}
            </span>
            <button type="button" className={buttonClass("outline", "sm", "h-7 px-2 text-xs")} onClick={checkNow} disabled={checking}>
              {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} {checking ? "Checking…" : "Check now"}
            </button>
          </div>
        )}
        {hidden.length > 0 && (
          <div className="border-t">
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              aria-expanded={showHidden}
              className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm text-muted-foreground hover:bg-muted/40 lg:px-6"
            >
              <EyeOff className="h-4 w-4" />
              <span className="flex-1">
                {hidden.length} removed competitor{hidden.length === 1 ? "" : "s"}
              </span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", showHidden && "rotate-180")} />
            </button>
            {showHidden && (
              <ul className="divide-y border-t bg-muted/20">
                {hidden.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-2.5 lg:px-6">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.primaryCategory} · {c.address}
                      </span>
                    </span>
                    <button type="button" className={buttonClass("outline", "sm")} onClick={() => setHidden(c, false)}>
                      <RotateCcw /> Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
      <CompetitorDialog open={addOpen || !!editing} editing={editing} onClose={() => (setAddOpen(false), setEditing(null))} locationId={locationId} defaultCategory={you.primaryCategory} />

      {categories.length > 0 && (
        <Card id="nearby-categories" className="scroll-mt-20 overflow-hidden">
          <PanelHeader
            title="Categories nearby businesses use"
            meta={missing.length ? `${missing.length} you don't have` : undefined}
            action={
              <Link href={categoriesHref} className="text-sm font-semibold text-primary hover:underline">
                Manage categories
              </Link>
            }
          />
          <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((c) => (
              <li key={c.name} className="flex items-center gap-3 border-b px-5 py-2.5 text-sm lg:px-6">
                {c.have ? (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/10 text-success" title="On your profile">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => addCategory(c.name)}
                    disabled={!!adding || full}
                    aria-label={`Add ${c.name} to your profile`}
                    title={full ? `Google allows up to ${MAX_SECONDARY_CATEGORIES} additional categories` : "Add to your profile"}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-accent text-accent-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-50"
                  >
                    {adding === c.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  </button>
                )}
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {c.count} of {competitors.length}
                </span>
              </li>
            ))}
          </ul>
          <p className="px-5 py-2.5 text-xs text-muted-foreground lg:px-6">Tap + to add a category to your profile. Only add the ones that truly describe your business.</p>
        </Card>
      )}
    </div>
  );
}

function Business({ row: r }: { row: Row }) {
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 items-center gap-2">
        <a href={mapsUrl(r)} target="_blank" rel="noreferrer" className="truncate font-semibold hover:underline" title="Open in Google Maps">
          {r.name}
        </a>
        {r.you ? (
          <Badge variant="default" pill>
            You
          </Badge>
        ) : r.source === "added" ? (
          <>
            <Badge variant="secondary" pill>
              Added
            </Badge>
            {r.checkError && (
              <span className="shrink-0 text-warning" title={`${r.checkError}. It'll be tried again tomorrow.`}>
                <TriangleAlert className="h-3.5 w-3.5" />
              </span>
            )}
          </>
        ) : (
          r.websiteUri && (
            <a href={r.websiteUri} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={`${r.name} website`}>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )
        )}
      </p>
      <p className="truncate text-xs text-muted-foreground">{r.address}</p>
    </div>
  );
}

/** Up to 2 sub-categories, then "+N"; categories you don't have are tinted (competitor rows). */
function SubCategories({ list, yours }: { list: string[]; yours?: Set<string> }) {
  if (!list.length) return <span className="text-muted-foreground">—</span>;
  const shown = list.slice(0, 2);
  return (
    <span className="flex min-w-0 flex-wrap gap-1" title={list.join(", ")}>
      {shown.map((c) => (
        <span key={c} className={cn("truncate rounded-md px-1.5 py-0.5 text-xs", yours && !yours.has(c.toLowerCase()) ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground")}>
          {c}
        </span>
      ))}
      {list.length > shown.length && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">+{list.length - shown.length}</span>}
    </span>
  );
}

type Change = ReturnType<typeof changeOver>;

/** "+14 in 7 days" next to the review count (daily-checked competitors). */
function ReviewChange({ change }: { change: Change }) {
  if (!change || change.reviews === 0) return null;
  return (
    <span className={cn("ml-1.5 text-xs font-semibold", change.reviews > 0 ? "text-success" : "text-destructive")} title={`Since ${change.since}`}>
      {change.reviews > 0 ? "+" : ""}
      {change.reviews.toLocaleString()}
      <span className="font-normal text-muted-foreground"> /7d</span>
    </span>
  );
}

function Reviews({ count, max, you, change }: { count: number; max: number; you?: boolean; change?: Change }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex w-16 shrink-0 flex-col items-end leading-tight">
        <span className="font-semibold tabular-nums">{count.toLocaleString()}</span>
        {change && change.reviews !== 0 && (
          <span className={cn("text-[11px] font-semibold tabular-nums", change.reviews > 0 ? "text-success" : "text-destructive")} title={`Change since ${change.since}`}>
            {change.reviews > 0 ? "+" : ""}
            {change.reviews.toLocaleString()} /7d
          </span>
        )}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", you ? "bg-primary" : "bg-muted-foreground/40")} style={{ width: `${(count / max) * 100}%` }} />
      </span>
    </span>
  );
}

function Rating({ value, change }: { value: number | null; change?: number | null }) {
  if (value == null) return <span className="text-sm text-muted-foreground">No reviews</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
      {value.toFixed(1)}
      {!!change && (
        <span className={cn("inline-flex items-center text-[11px]", change > 0 ? "text-success" : "text-destructive")} title="Change over 30 days">
          {change > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(change).toFixed(1)}
        </span>
      )}
    </span>
  );
}
