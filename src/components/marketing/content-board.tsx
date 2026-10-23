"use client";

// Content calendar (week / month / list) with drag-and-drop rescheduling,
// ported from TasksBook CRM (src/pages/marketing/MarketingContent.tsx).

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { addMonths, addWeeks, format, isSameDay, isSameMonth, isToday, parseISO, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, GripVertical, Plus, Search } from "lucide-react";
import { Card, StatStrip, buttonClass, inputClass } from "@/components/ui";
import { Segmented } from "@/components/ui-client";
import { ChannelStack } from "@/components/marketing/channel-icon";
import { PostComposer, type ComposerLocation } from "@/components/marketing/post-composer";
import { reschedulePost } from "@/app/(app)/actions";
import { MOVABLE, POST_STATUS, monthGrid, postDate, weekDays, type Channel, type Post, type PostStatus } from "@/lib/posts";
import { cn } from "@/lib/utils";

type View = "week" | "month" | "list";

/** Mouse/touch: the day under the pointer. Keyboard drags have no pointer, so use the day the card overlaps. */
const collision: CollisionDetection = (args) => (args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args));
const VIEW_KEY = "gbp-content-view";

export function ContentBoard({
  posts: serverPosts,
  connected,
  locations,
  currentLocationId,
}: {
  posts: Post[];
  connected: Channel[];
  locations: ComposerLocation[];
  currentLocationId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  // Optimistic moves while the server confirms a drag (id → ISO date).
  const [moved, setMoved] = useState<Record<string, string>>({});
  useEffect(() => setMoved({}), [serverPosts]);
  const posts = useMemo(() => serverPosts.map((p) => (moved[p.id] ? { ...p, scheduled_at: moved[p.id] } : p)), [serverPosts, moved]);

  const [view, setViewState] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | PostStatus>("all");
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [composer, setComposer] = useState(false);
  const [newDate, setNewDate] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "week" || v === "month" || v === "list") setViewState(v);
    } catch {}
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  // Deep links: ?compose=1 (&date=yyyy-MM-dd) opens the composer, ?post=<id> opens that post.
  useEffect(() => {
    const id = params.get("post");
    const date = params.get("date");
    if (params.get("compose") === "1") {
      setOpenPost(null);
      setNewDate(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseISO(date) : null);
      setComposer(true);
    } else if (id) {
      const p = serverPosts.find((x) => x.id === id);
      if (!p) return;
      setOpenPost(p);
      setComposer(true);
      setAnchor(parseISO(postDate(p)));
    } else return;
    const next = new URLSearchParams(params);
    ["compose", "date", "post"].forEach((k) => next.delete(k));
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [params, pathname, router, serverPosts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => !q || [p.title, p.body, p.label].some((v) => v?.toLowerCase().includes(q)));
  }, [posts, search]);

  const stats = useMemo(() => {
    const now = Date.now();
    const monthStart = startOfMonth(new Date()).getTime();
    const upcoming = posts
      .filter((p) => p.status === "scheduled" && p.scheduled_at && new Date(p.scheduled_at).getTime() >= now)
      .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
    return {
      next: upcoming[0] ?? null,
      scheduled: upcoming.length,
      published: posts.filter((p) => (p.status === "published" || p.status === "partially_failed") && p.published_at && new Date(p.published_at).getTime() >= monthStart).length,
      failed: posts.filter((p) => p.status === "failed" || p.status === "partially_failed").length,
    };
  }, [posts]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: filtered.length };
    for (const p of filtered) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [filtered]);

  const open = (p: Post) => {
    setOpenPost(p);
    setNewDate(null);
    setComposer(true);
  };
  const create = (day?: Date | null) => {
    setOpenPost(null);
    setNewDate(day && day.getTime() >= new Date().setHours(0, 0, 0, 0) ? day : null);
    setComposer(true);
  };

  const step = (dir: -1 | 1) => setAnchor((a) => (view === "week" ? addWeeks(a, dir) : addMonths(a, dir)));
  const days = view === "week" ? weekDays(anchor) : monthGrid(anchor);

  // ---- drag & drop: move drafts / scheduled posts to another day (keeps the time of day)
  const [dragging, setDragging] = useState<{ post: Post; width: number } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const onDragStart = (e: DragStartEvent) => {
    const post = posts.find((p) => p.id === e.active.id);
    if (post) setDragging({ post, width: e.active.rect.current.initial?.width ?? 180 });
  };
  const move = async (post: Post, iso: string, undo: string | null) => {
    setMoved((m) => ({ ...m, [post.id]: iso }));
    const res = await reschedulePost(post.id, iso);
    if (!res.ok) {
      setMoved((m) => {
        const { [post.id]: _, ...rest } = m;
        void _;
        return rest;
      });
      toast.error(res.error);
      return;
    }
    startTransition(() => router.refresh());
    if (undo) toast.success(`Moved to ${format(new Date(iso), "EEE d MMM")}`, { action: { label: "Undo", onClick: () => void move(post, undo, null) } });
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const post = posts.find((p) => p.id === e.active.id);
    const day = e.over?.id ? String(e.over.id) : null;
    if (!post || !day) return;
    const from = parseISO(postDate(post));
    if (format(from, "yyyy-MM-dd") === day) return;
    const target = parseISO(`${day}T${format(post.scheduled_at ? from : new Date(new Date().setHours(9, 0, 0, 0)), "HH:mm")}:00`);
    if (post.status === "scheduled" && target.getTime() < Date.now()) {
      toast.error("Scheduled posts can't move into the past");
      return;
    }
    void move(post, target.toISOString(), post.scheduled_at ?? from.toISOString());
  };

  const byDay = (d: Date) => filtered.filter((p) => isSameDay(parseISO(postDate(p)), d)).sort((a, b) => postDate(a).localeCompare(postDate(b)));
  const periodLabel = view === "week" ? `${format(days[0], "d MMM")} – ${format(days[6], "d MMM yyyy")}` : format(anchor, "MMMM yyyy");
  const listRows = useMemo(() => filtered.filter((p) => status === "all" || p.status === status).sort((a, b) => postDate(b).localeCompare(postDate(a))), [filtered, status]);
  const showList = (s: "all" | PostStatus) => {
    setView("list");
    setStatus(s);
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">Plan and publish posts to Google, Facebook, Instagram and LinkedIn</p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search posts…" className={cn(inputClass, "h-9 py-1.5 pl-9")} aria-label="Search posts" />
          </div>
          <button type="button" className={buttonClass("default", "sm", "h-9")} onClick={() => create(null)}>
            <Plus /> New post
          </button>
        </div>
      </div>

      <StatStrip
        items={[
          {
            label: "Next post",
            value: stats.next?.scheduled_at ? format(parseISO(stats.next.scheduled_at), "EEE d MMM") : "—",
            hint: stats.next ? `${format(parseISO(stats.next.scheduled_at as string), "h:mm a")} · ${stats.next.title || "Untitled"}` : "Nothing scheduled",
            onClick: stats.next ? () => open(stats.next as Post) : undefined,
          },
          { label: "Scheduled", value: stats.scheduled, hint: "Upcoming", onClick: () => showList("scheduled"), active: view === "list" && status === "scheduled" },
          { label: "Published", value: stats.published, hint: "This month", onClick: () => showList("published"), active: view === "list" && status === "published" },
          {
            label: "Failed",
            value: stats.failed,
            hint: stats.failed ? "Needs a retry" : "All good",
            alert: stats.failed > 0,
            onClick: () => showList("failed"),
            active: view === "list" && status === "failed",
          },
        ]}
      />

      <Card className="min-w-0 overflow-hidden">
        <div className="flex flex-col gap-2 border-b px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between lg:px-5">
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
              { value: "list", label: "List" },
            ]}
          />
          {view !== "list" && (
            <div className="flex items-center gap-1">
              <span className="mr-2 min-w-0 flex-1 truncate text-sm font-semibold sm:flex-none">{periodLabel}</span>
              <button type="button" className={buttonClass("ghost", "icon", "h-8 w-8")} aria-label="Previous" onClick={() => step(-1)}>
                <ChevronLeft />
              </button>
              <button
                type="button"
                className={buttonClass("outline", "sm", "h-8")}
                onClick={() => {
                  setAnchor(new Date());
                  setSelectedDay(new Date());
                }}
              >
                Today
              </button>
              <button type="button" className={buttonClass("ghost", "icon", "h-8 w-8")} aria-label="Next" onClick={() => step(1)}>
                <ChevronRight />
              </button>
            </div>
          )}
        </div>

        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          {view === "list" ? (
            <ListView rows={listRows} counts={counts} status={status} setStatus={setStatus} onOpen={open} />
          ) : view === "week" ? (
            <div className="grid grid-cols-1 divide-y md:grid-cols-7 md:divide-x md:divide-y-0">
              {days.map((d) => {
                const items = byDay(d);
                return (
                  <DayDrop key={d.toISOString()} day={d} className="group min-h-[88px] min-w-0 md:min-h-[420px]">
                    <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
                      <span className={cn("text-xs", isToday(d) ? "font-semibold text-primary" : "text-muted-foreground")}>
                        <span className="label-caps mr-1.5">{format(d, "EEE")}</span>
                        <span className={cn("tabular-nums", isToday(d) && "rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground")}>{format(d, "d")}</span>
                      </span>
                      <AddButton onClick={() => create(d)} />
                    </div>
                    <ul className="space-y-1.5 px-2 pb-3">
                      {items.map((p) => (
                        <li key={p.id}>
                          <DragChip post={p} onClick={() => open(p)} />
                        </li>
                      ))}
                    </ul>
                  </DayDrop>
                );
              })}
            </div>
          ) : (
            <MonthView
              days={days}
              anchor={anchor}
              byDay={byDay}
              onOpen={open}
              onCreate={create}
              selected={selectedDay}
              onSelect={setSelectedDay}
              onMore={(d) => {
                setAnchor(d);
                setView("week");
              }}
            />
          )}
          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
            {dragging && (
              <div style={{ width: dragging.width }} className="rotate-[1.5deg] scale-[1.03] cursor-grabbing rounded-md shadow-lg ring-1 ring-primary/30">
                <PostChip post={dragging.post} onClick={() => undefined} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </Card>

      <p className="text-xs text-muted-foreground">Tip: drag a draft or scheduled post to another day to reschedule it. The time of day is kept.</p>

      <PostComposer open={composer} onOpenChange={setComposer} post={openPost} defaultDate={newDate} connected={connected} locations={locations} currentLocationId={currentLocationId} />
    </div>
  );
}

/** A calendar day that accepts dropped posts; highlights while a post hovers over it. */
function DayDrop({ day, className, children }: { day: Date; className?: string; children: React.ReactNode }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: format(day, "yyyy-MM-dd") });
  return (
    <div ref={setNodeRef} className={cn(className, "transition-colors duration-150", active && isOver && "bg-accent/70 ring-2 ring-inset ring-primary/40")}>
      {children}
    </div>
  );
}

/** Drafts and scheduled posts can be dragged to another day; others behave like a normal chip. */
function DragChip({ post, onClick }: { post: Post; onClick: () => void }) {
  const movable = MOVABLE.includes(post.status);
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: post.id, disabled: !movable });
  return (
    <div
      ref={setNodeRef}
      {...(movable ? attributes : {})}
      {...(movable ? listeners : {})}
      className={cn("touch-manipulation transition-opacity duration-150", movable && "cursor-grab active:cursor-grabbing", isDragging && "opacity-30")}
    >
      <PostChip post={post} onClick={onClick} movable={movable} />
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="New post on this day"
      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}

function PostChip({ post, onClick, movable }: { post: Post; onClick: () => void; movable?: boolean }) {
  const st = POST_STATUS[post.status];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/chip flex w-full min-w-0 flex-col gap-1 rounded-md border bg-card px-2 py-1.5 text-left text-xs transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`${post.title || "Untitled"} · ${st.label}${movable ? " · drag to reschedule" : ""}`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", st.dot)} aria-label={st.label} />
        <span className="min-w-0 flex-1 truncate font-semibold">{post.title || post.body || "Untitled"}</span>
        {movable && <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover/chip:opacity-100" />}
      </span>
      <span className="flex items-center justify-between gap-1 pl-3">
        <span className="truncate tabular-nums text-muted-foreground">{format(parseISO(postDate(post)), "h:mma").toLowerCase()}</span>
        <ChannelStack channels={post.channels} size="h-3 w-3" />
      </span>
    </button>
  );
}

function MonthView({
  days,
  anchor,
  byDay,
  onOpen,
  onCreate,
  selected,
  onSelect,
  onMore,
}: {
  days: Date[];
  anchor: Date;
  byDay: (d: Date) => Post[];
  onOpen: (p: Post) => void;
  onCreate: (d: Date) => void;
  selected: Date;
  onSelect: (d: Date) => void;
  onMore: (d: Date) => void;
}) {
  const selectedItems = byDay(selected);
  return (
    <>
      <div className="grid grid-cols-7 border-b text-center">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d} className="label-caps py-2">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const items = byDay(d);
          const inMonth = isSameMonth(d, anchor);
          return (
            <DayDrop key={d.toISOString()} day={d} className={cn("group min-w-0 border-b", i % 7 !== 0 && "border-l", !inMonth && "bg-muted/30", i >= 35 && "border-b-0")}>
              {/* Phones: a compact day cell; tap shows the day below. */}
              <button
                type="button"
                onClick={() => onSelect(d)}
                className={cn("flex h-14 w-full flex-col items-center justify-center gap-1 md:hidden", isSameDay(d, selected) && "bg-accent")}
                aria-label={`${format(d, "EEEE d MMMM")}, ${items.length} posts`}
              >
                <span className={cn("text-xs tabular-nums", !inMonth && "text-muted-foreground/60", isToday(d) && "rounded-full bg-primary px-1.5 font-semibold text-primary-foreground")}>{format(d, "d")}</span>
                <span className="flex h-1.5 gap-0.5">
                  {items.slice(0, 3).map((p) => (
                    <span key={p.id} className={cn("h-1.5 w-1.5 rounded-full", POST_STATUS[p.status].dot)} />
                  ))}
                </span>
              </button>
              <div className="hidden min-h-[124px] md:block">
                <div className="flex items-center justify-between px-2 pt-1.5">
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      !inMonth ? "text-muted-foreground/60" : "text-muted-foreground",
                      isToday(d) && "rounded-full bg-primary px-1.5 font-semibold text-primary-foreground",
                    )}
                  >
                    {format(d, "d")}
                  </span>
                  <AddButton onClick={() => onCreate(d)} />
                </div>
                <ul className="space-y-1 px-1.5 pb-1.5 pt-1">
                  {items.slice(0, 2).map((p) => (
                    <li key={p.id}>
                      <DragChip post={p} onClick={() => onOpen(p)} />
                    </li>
                  ))}
                  {items.length > 2 && (
                    <li>
                      <button type="button" onClick={() => onMore(d)} className="px-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                        +{items.length - 2} more
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            </DayDrop>
          );
        })}
      </div>
      <div className="border-t md:hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-sm font-semibold">{format(selected, "EEEE d MMMM")}</span>
          <button type="button" className={buttonClass("ghost", "sm", "h-8")} onClick={() => onCreate(selected)}>
            <Plus /> Add
          </button>
        </div>
        {selectedItems.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">No posts</p>
        ) : (
          <ul className="space-y-1.5 px-3 pb-3">
            {selectedItems.map((p) => (
              <li key={p.id}>
                <PostChip post={p} onClick={() => onOpen(p)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ListView({
  rows,
  counts,
  status,
  setStatus,
  onOpen,
}: {
  rows: Post[];
  counts: Record<string, number>;
  status: "all" | PostStatus;
  setStatus: (s: "all" | PostStatus) => void;
  onOpen: (p: Post) => void;
}) {
  const order: PostStatus[] = ["scheduled", "draft", "published", "failed", "partially_failed", "publishing"];
  const pills: { key: "all" | PostStatus; label: string; dot?: string }[] = [{ key: "all", label: "All" }, ...order.map((k) => ({ key: k, label: POST_STATUS[k].label, dot: POST_STATUS[k].dot }))];
  return (
    <>
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b px-3 py-3">
        {pills
          .filter((p) => p.key === "all" || (counts[p.key] ?? 0) > 0 || p.key === status)
          .map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setStatus(p.key)}
              aria-pressed={status === p.key}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors",
                status === p.key ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {p.dot && <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />}
              {p.label}
              <span className="text-xs tabular-nums opacity-70">{counts[p.key] ?? 0}</span>
            </button>
          ))}
      </div>
      {rows.length === 0 ? (
        <p className="py-14 text-center text-sm text-muted-foreground">No posts</p>
      ) : (
        <>
          <ul className="divide-y md:hidden">
            {rows.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onOpen(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
                  <ChannelStack channels={p.channels} className="w-11" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.title || p.body || "Untitled"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{format(parseISO(postDate(p)), "EEE d MMM, h:mm a")}</span>
                  </span>
                  <StatusLabel status={p.status} />
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b text-left">
                <tr>
                  {["Post", "Channels", "Campaign", "Date", "Status"].map((h, i) => (
                    <th key={h} className={cn("label-caps px-3 py-3 font-semibold", i === 0 && "pl-5", i === 4 && "pr-5")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((p) => (
                  <tr key={p.id} onClick={() => onOpen(p)} className="cursor-pointer transition-colors hover:bg-muted/40">
                    <td className="max-w-0 py-3 pl-5 pr-3">
                      <p className="truncate font-semibold">{p.title || "Untitled"}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.body}</p>
                    </td>
                    <td className="px-3 py-3">
                      <ChannelStack channels={p.channels} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{p.label || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{format(parseISO(postDate(p)), "EEE d MMM yyyy, h:mm a")}</td>
                    <td className="px-3 py-3 pr-5">
                      <StatusLabel status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function StatusLabel({ status }: { status: PostStatus }) {
  const st = POST_STATUS[status];
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", st.tone)}>{st.label}</span>;
}
