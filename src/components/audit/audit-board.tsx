"use client";

import type { CategoryUsage } from "@/lib/competitors";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  Info,
  ListPlus,
  MapPin,
  Package,
  Phone,
  RotateCcw,
  SlidersHorizontal,
  Star,
  Wrench,
  X,
} from "lucide-react";
import { Card, PageHeader, StatStrip, buttonClass } from "@/components/ui";
import { Segmented } from "@/components/ui-client";
import { AUDIT_TABS, pointsGain, type AuditCheck, type AuditResult, type AuditSection, type AuditTab, type SectionId } from "@/lib/audit";
import type { Location, ProfileSuggestions } from "@/lib/gbp/types";
import { cn, withLocation } from "@/lib/utils";
import { ProductsEditor, ServicesEditor } from "./editors";
import { PhotosPanel } from "./photos-panel";
import { AboutFields, ContactFields, HoursFields, LocationFields, MoreFields } from "./fields";
import { GuidePanel } from "./guide-panel";
import { ProfilePreview, type PreviewView } from "./profile-preview";
import { tabOf, type Draft, type OnDraft } from "./shared";
import { CheckTaskChip, CheckTaskDialog, type CheckTask } from "./check-task-dialog";
import type { TaskMember } from "@/components/tasks/task-bits";

const SECTION_ICON: Record<SectionId, React.ElementType> = {
  about: Info,
  contact: Phone,
  location: MapPin,
  hours: Clock,
  more: SlidersHorizontal,
  services: Wrench,
  products: Package,
  photos: ImageIcon,
  reviews: Star,
  activity: CalendarDays,
};
const TAB_LABEL: Record<AuditTab, { label: string }> = {
  overview: { label: "Checklist" },
  about: { label: "About" },
  contact: { label: "Contact" },
  location: { label: "Location" },
  hours: { label: "Hours" },
  more: { label: "More" },
  services: { label: "Services" },
  products: { label: "Products" },
  photos: { label: "Photos" },
};
const PREVIEW_FOR: Record<AuditTab, PreviewView> = {
  overview: "overview",
  about: "about",
  contact: "overview",
  location: "overview",
  hours: "overview",
  more: "about",
  services: "services",
  products: "products",
  photos: "overview",
};
const SECTION_TITLE: Record<SectionId, string> = {
  about: "About",
  contact: "Contact",
  location: "Location",
  hours: "Hours",
  more: "More",
  services: "Services",
  products: "Products",
  photos: "Photos",
  reviews: "Reviews",
  activity: "Posts",
};

const grade = (score: number) => (score >= 90 ? "Excellent" : score >= 80 ? "Strong" : score >= 60 ? "Good, with gaps" : score >= 40 ? "Needs work" : "Weak");
const GOOGLE_URL = "https://business.google.com/";

export function AuditBoard({
  location,
  audit,
  suggestions,
  rating,
  initialTab,
  checkTasks,
  members,
  competitorCategories,
}: {
  location: Location;
  audit: AuditResult;
  suggestions: ProfileSuggestions;
  rating: { avg: number | null; count: number };
  initialTab: AuditTab;
  /** Open tasks created from checklist items, by check id. */
  checkTasks: Record<string, CheckTask>;
  members: TaskMember[];
  /** Categories nearby competitors use (for the category guide). */
  competitorCategories: { total: number; list: CategoryUsage[] };
}) {
  const total = useMemo(() => audit.sections.reduce((s, x) => s + x.max, 0), [audit]);
  const sectionById = useMemo(() => new Map(audit.sections.map((s) => [s.id, s])), [audit]);
  const missing = audit.issues.filter((c) => c.status === "fail").length;
  const checksTotal = audit.issues.length + audit.passed.length;

  // Tab lives in ?tab= but switches instantly on the client.
  const [tab, setTabState] = useState<AuditTab>(initialTab);
  const [view, setView] = useState<PreviewView>(PREVIEW_FOR[initialTab]);
  const setTab = useCallback((next: AuditTab) => {
    setTabState(next);
    setView(PREVIEW_FOR[next]);
    setFocus(null);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const [draft, setDraft] = useState<Draft>({});
  const onDraft = useCallback<OnDraft>((patch) => setDraft((d) => ({ ...d, ...patch })), []);
  const preview: Location = useMemo(() => {
    const merged = { ...location };
    for (const [k, v] of Object.entries(draft)) if (v !== undefined) (merged as Record<string, unknown>)[k] = v;
    return merged;
  }, [location, draft]);
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "") || (Array.isArray(a) && !a.length && b == null);
  const dirty = Object.entries(draft).some(([k, v]) => v !== undefined && !same(v, location[k as keyof Draft]));

  const issuesIn = (t: AuditTab) => (t === "overview" ? audit.issues : audit.issues.filter((c) => c.section === t)).length;
  const checkById = useMemo(() => new Map(audit.sections.flatMap((s) => s.checks.map((c) => [c.id, c] as const))), [audit]);
  const [focus, setFocus] = useState<string | null>(null);
  const [categoryRequest, setCategoryRequest] = useState<{ name: string; n: number } | null>(null);
  const addCategory = useCallback((name: string) => setCategoryRequest((r) => ({ name, n: (r?.n ?? 0) + 1 })), []);
  const ctx = { location, checks: checkById, total, onDraft, suggestions, onFocusField: setFocus, categoryRequest };
  const mapsUrl = location.placeId ? `https://www.google.com/maps/place/?q=place_id:${location.placeId}` : null;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Profile audit"
        actions={
          mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}>
              View on Google Maps <ExternalLink />
            </a>
          )
        }
      >
        {location.title} · {location.primaryCategory}
      </PageHeader>

      <StatStrip
        items={[
          {
            label: "Profile score",
            value: (
              <>
                {audit.score}
                <span className="text-base font-normal text-muted-foreground">/100</span>
              </>
            ),
            hint: grade(audit.score),
          },
          { label: "Checks passed", value: `${audit.passed.length}/${checksTotal}`, hint: `${Math.round((audit.passed.length / checksTotal) * 100)}% complete` },
          { label: "To fix", value: audit.issues.length, hint: missing ? `${missing} missing · ${audit.issues.length - missing} need work` : "All partly done", onClick: () => setTab("overview") },
          { label: "Points available", value: `+${100 - audit.score}`, hint: "if every item is fixed" },
        ]}
      />

      <nav aria-label="Audit sections" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b px-1">
        {AUDIT_TABS.map((id) => {
          const n = issuesIn(id);
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm transition-colors",
                active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABEL[id].label}
              {n ? (
                <span className={cn("min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums", active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                  {n}
                </span>
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label="All done" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {tab === "overview" ? (
            <Checklist audit={audit} total={total} location={location} onGo={setTab} checkTasks={checkTasks} members={members} />
          ) : tab === "about" ? (
            <AboutFields key={location.id} section={sectionById.get("about")!} ctx={ctx} />
          ) : tab === "contact" ? (
            <ContactFields section={sectionById.get("contact")!} ctx={ctx} />
          ) : tab === "location" ? (
            <LocationFields section={sectionById.get("location")!} ctx={ctx} />
          ) : tab === "hours" ? (
            <HoursFields section={sectionById.get("hours")!} ctx={ctx} />
          ) : tab === "more" ? (
            <MoreFields section={sectionById.get("more")!} ctx={ctx} />
          ) : (
            <SectionPanel section={sectionById.get(tab)!} total={total} defaultOpen>
              <SectionBody id={tab} location={location} suggestions={suggestions} />
            </SectionPanel>
          )}
        </div>
        <div className="xl:sticky xl:top-20 xl:self-start">
          {tab === "overview" ? (
            <ProfilePreview location={preview} rating={rating} view={view} onView={setView} onGo={setTab} dirty={dirty} />
          ) : (
            <GuidePanel
              tab={tab}
              focus={focus}
              location={location}
              suggestions={suggestions}
              competitorCategories={competitorCategories}
              draftCategories={[preview.primaryCategory, ...preview.additionalCategories]}
              onAddCategory={addCategory}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- checklist
function CheckAction({ check, location, onGo, primary }: { check: AuditCheck; location: Location; onGo: (t: AuditTab) => void; primary?: boolean }) {
  const cls = buttonClass(primary ? "default" : "outline", "sm");
  if (check.section === "reviews")
    return (
      <Link href={withLocation("/reviews", location.id)} className={cls}>
        Open reviews <ChevronRight />
      </Link>
    );
  if (check.section === "activity")
    return (
      <Link href={withLocation("/calendar", location.id, { compose: "1" })} className={cls}>
        Create a post <ChevronRight />
      </Link>
    );
  const target = tabOf(check.section);
  if (!check.fixable && check.section !== "photos")
    return (
      <a href={GOOGLE_URL} target="_blank" rel="noreferrer" className={cls}>
        Fix in Google <ExternalLink />
      </a>
    );
  return (
    <button type="button" className={cls} onClick={() => target && onGo(target)}>
      Fix in {TAB_LABEL[target ?? "overview"].label} <ChevronRight />
    </button>
  );
}

const IMPACT = { high: "High impact", medium: "Medium impact", low: "Low impact" } as const;

/** Dismissed checks are a per-browser preference, so they live in localStorage. */
function useDismissed(locationId: string) {
  const key = `audit:dismissed:${locationId}`;
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      setIds(JSON.parse(localStorage.getItem(key) ?? "[]"));
    } catch {
      setIds([]);
    }
  }, [key]);
  const update = (next: string[]) => {
    setIds(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* private mode: keep it for this visit only */
    }
  };
  return { ids, dismiss: (id: string) => update([...ids, id]), restore: (id: string) => update(ids.filter((x) => x !== id)) };
}

type Filter = "todo" | "done" | "dismissed";

function Checklist({
  audit,
  total,
  location,
  onGo,
  checkTasks,
  members,
}: {
  audit: AuditResult;
  total: number;
  location: Location;
  onGo: (t: AuditTab) => void;
  checkTasks: Record<string, CheckTask>;
  members: TaskMember[];
}) {
  const { ids: dismissedIds, dismiss, restore } = useDismissed(location.id);
  const [tasking, setTasking] = useState<AuditCheck | null>(null);
  const memberOf = (id: string | null) => members.find((m) => m.id === id) ?? null;
  const [filter, setFilter] = useState<Filter>("todo");
  const [open, setOpen] = useState<string | null>(null);
  const todo = audit.issues.filter((c) => !dismissedIds.includes(c.id));
  const dismissed = audit.issues.filter((c) => dismissedIds.includes(c.id));
  const list = filter === "todo" ? todo : filter === "done" ? audit.passed : dismissed;
  const doneCount = audit.passed.length;
  const all = doneCount + audit.issues.length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 lg:px-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Optimization checklist</h2>
          <p className="text-xs text-muted-foreground">
            {doneCount} of {all} done · sorted by score impact
          </p>
        </div>
        <Segmented
          size="sm"
          label="Show"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setOpen(null);
          }}
          options={[
            { value: "todo", label: `To do · ${todo.length}` },
            { value: "done", label: `Done · ${doneCount}` },
            ...(dismissed.length || filter === "dismissed" ? [{ value: "dismissed" as Filter, label: `Dismissed · ${dismissed.length}` }] : []),
          ]}
        />
      </div>
      <div className="h-1 bg-muted">
        <div className="h-full bg-success transition-[width] duration-500" style={{ width: `${(doneCount / all) * 100}%` }} />
      </div>

      {list.length ? (
        <ol className="divide-y">
          {list.map((c, i) => {
            const isOpen = open === c.id;
            const Icon = SECTION_ICON[c.section];
            const pass = c.status === "pass";
            return (
              <li key={c.id} className={cn(isOpen && "bg-muted/30")}>
                <div className="flex items-center gap-3 pr-3 lg:pr-4">
                  <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-4 py-3.5 pl-5 text-left lg:pl-6">
                    {pass ? (
                      <CheckCircle2 className="h-6 w-6 shrink-0 text-success" />
                    ) : (
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                          filter === "dismissed" ? "border-dashed text-muted-foreground" : c.status === "fail" ? "border-destructive/40 text-destructive" : "border-warning/40 text-warning",
                        )}
                      >
                        {i + 1}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm font-semibold", filter === "dismissed" && "text-muted-foreground")}>{c.title}</span>
                      <span className={cn("mt-0.5 block text-xs text-muted-foreground", !isOpen && "truncate")}>
                        {!pass && <span className={c.status === "fail" ? "text-destructive" : "text-warning"}>{c.status === "fail" ? "Missing" : "Needs work"} · </span>}
                        {c.detail}
                      </span>
                    </span>
                    {!pass && <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">+{pointsGain(c, total)} pts</span>}
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {filter === "todo" &&
                    (checkTasks[c.id] ? (
                      <span className="hidden sm:inline-flex">
                        <CheckTaskChip task={checkTasks[c.id]} locationId={location.id} member={memberOf(checkTasks[c.id].assigneeId)} />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTasking(c)}
                        className={buttonClass("ghost", "sm", "hidden h-8 px-2 text-muted-foreground sm:inline-flex")}
                        title="Add as task and assign it"
                      >
                        <ListPlus /> Add task
                      </button>
                    ))}
                  {filter === "todo" && (
                    <button type="button" onClick={() => dismiss(c.id)} className={buttonClass("ghost", "icon", "h-8 w-8 text-muted-foreground")} aria-label={`Dismiss ${c.title}`} title="Dismiss">
                      <X />
                    </button>
                  )}
                  {filter === "dismissed" && (
                    <button type="button" onClick={() => restore(c.id)} className={buttonClass("ghost", "sm", "h-8 text-muted-foreground")}>
                      <RotateCcw /> Restore
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="flex flex-col gap-3 pb-4 pl-[60px] pr-5 sm:flex-row sm:items-center sm:justify-between lg:pl-[64px] lg:pr-6">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-medium text-foreground">
                        <Icon className="h-3.5 w-3.5" /> {SECTION_TITLE[c.section]}
                      </span>
                      <span>·</span>
                      <span>
                        {IMPACT[c.severity]} ({c.points} of {total} points)
                      </span>
                    </p>
                    {!pass && filter === "todo" && (
                      <div className="flex flex-wrap items-center gap-2">
                        {checkTasks[c.id] ? (
                          <CheckTaskChip task={checkTasks[c.id]} locationId={location.id} member={memberOf(checkTasks[c.id].assigneeId)} />
                        ) : (
                          <button type="button" className={buttonClass("outline", "sm")} onClick={() => setTasking(c)}>
                            <ListPlus /> Add as task
                          </button>
                        )}
                        <CheckAction check={c} location={location} onGo={onGo} primary />
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="px-5 py-12 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
          <p className="mt-2 text-sm font-semibold">{filter === "todo" ? "Nothing left to fix" : filter === "done" ? "Nothing completed yet" : "No dismissed items"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{filter === "todo" ? "Keep posting and replying to reviews to stay on top." : "Fix items from the To do list to see them here."}</p>
        </div>
      )}
      <CheckTaskDialog check={tasking} locationId={location.id} members={members} onClose={() => setTasking(null)} />
    </Card>
  );
}

// ---------------------------------------------------------------- section tabs
/** Collapsible section card. Collapsed cards keep their editor mounted so unsaved edits survive. */
function SectionPanel({ section, total, defaultOpen, children }: { section: AuditSection; total: number; defaultOpen: boolean; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const open = section.checks.filter((c) => c.status !== "pass");
  const done = section.checks.length - open.length;
  const Icon = SECTION_ICON[section.id];
  const bodyId = `sec-body-${section.id}`;
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className={cn("flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/30 lg:px-6", expanded && "border-b")}
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-base font-semibold tracking-tight">{SECTION_TITLE[section.id]}</span>
        {open.length ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {open.length} to fix · <span className="font-semibold text-primary">+{open.reduce((n, c) => n + pointsGain(c, total), 0)} pts</span>
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> {done}/{section.checks.length} done
          </span>
        )}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      <div id={bodyId} hidden={!expanded}>
        {open.length > 0 && (
          <ul className="space-y-1.5 border-b bg-muted/30 px-5 py-3 lg:px-6">
            {open.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5 text-sm">
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", c.status === "fail" ? "bg-destructive" : "bg-warning")} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{c.title}</span>
                  <span className="text-muted-foreground"> · {c.detail}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">+{pointsGain(c, total)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="px-5 py-5 lg:px-6">{children}</div>
      </div>
    </Card>
  );
}

function SectionBody({ id, location, suggestions }: { id: SectionId; location: Location; suggestions: ProfileSuggestions }) {
  if (id === "services") return <ServicesEditor location={location} suggestions={suggestions} />;
  if (id === "products")
    return location.notInApi?.includes("products") ? (
      <Card className="flex flex-col items-start gap-3 px-5 py-5 sm:flex-row sm:items-center lg:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Package className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">Products are managed in Google Business Profile</p>
          <p className="text-muted-foreground">Google doesn&apos;t share or accept products through its API, so they aren&apos;t shown or scored here.</p>
        </div>
        <a href={GOOGLE_URL} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}>
          Open Google <ExternalLink />
        </a>
      </Card>
    ) : (
      <ProductsEditor location={location} suggestions={suggestions.products} />
    );
  if (id === "photos") return <PhotosPanel location={location} />;
  return null;
}
