"use client";

// Admin → Meetings: every meeting booked from an offer, in one place. Requests (new time / cancel) first, then upcoming,
// then past; filters via ?filter=, `?meeting=<id>` opens one.
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { toast } from "sonner";
import { CalendarClock, CalendarX, Check, ChevronRight, ListTodo, MoreHorizontal, Search, Trash2, Trophy, Video, X } from "lucide-react";
import { MeetingDialog } from "./meeting-dialog";
import { Badge, Card, EmptyState, StatStrip, buttonClass, inputClass } from "@/components/ui";
import { Menu, useConfirm } from "@/components/ui-client";
import { createLinkedTask, deleteMeeting, setLeadStatus } from "@/app/admin/actions";
import { LEAD_STATUS, isUpcomingMeeting, type LeadStatus, type MeetingFilter, type OfferLead } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

const when = (iso: string) => {
  const d = parseISO(iso);
  return `${isToday(d) ? "Today" : isTomorrow(d) ? "Tomorrow" : format(d, "EEE d MMM")}, ${format(d, "HH:mm")}`;
};
const hasRequest = (l: OfferLead) => l.status === "booked" && !!(l.changeRequest || l.cancelRequest);

export function MeetingsBoard({ leads, filter, openId: initialOpen }: { leads: OfferLead[]; filter: MeetingFilter; openId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { confirm, dialog } = useConfirm();
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  const [search, setSearch] = useState("");
  const openLead = leads.find((l) => l.id === openId) ?? null;

  const upcoming = leads.filter((l) => isUpcomingMeeting(l)).sort((a, b) => a.meetingAt.localeCompare(b.meetingAt));
  const requests = leads.filter(hasRequest);
  const past = leads.filter((l) => !isUpcomingMeeting(l)).sort((a, b) => b.meetingAt.localeCompare(a.meetingAt));
  const noLink = upcoming.filter((l) => !l.meetSharedAt).length;
  const won = leads.filter((l) => l.status === "won").length;
  const met = leads.filter((l) => l.status === "met" || l.status === "won").length;

  const base = { upcoming, requests, past, all: [...leads].sort((a, b) => b.meetingAt.localeCompare(a.meetingAt)) }[filter];
  const q = search.trim().toLowerCase();
  const shown = q ? base.filter((l) => [l.name, l.email, l.profileTitle, l.workspaceName, l.offerTitle].some((v) => v?.toLowerCase().includes(q))) : base;

  const setFilter = (f: MeetingFilter) => {
    const next = new URLSearchParams(params.toString());
    if (f === "upcoming") next.delete("filter");
    else next.set("filter", f);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const open = (id: string | null) => {
    setOpenId(id);
    if (!id && params.get("meeting")) {
      const next = new URLSearchParams(params.toString());
      next.delete("meeting");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    }
  };

  const mark = async (l: OfferLead, status: LeadStatus) => {
    const res = await setLeadStatus(l.id, status);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`Marked ${LEAD_STATUS[status].label.toLowerCase()}`);
    router.refresh();
  };
  const remove = async (l: OfferLead) => {
    const ok = await confirm({
      title: "Delete this meeting?",
      description: `${l.profileTitle} · ${l.name}. It's removed from the lists and the client's Dashboard. This can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    const res = await deleteMeeting(l.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Meeting deleted");
    if (openId === l.id) open(null);
    router.refresh();
  };
  const addTask = async (l: OfferLead) => {
    const res = await createLinkedTask("meeting", l.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Task added", { action: { label: "Open", onClick: () => router.push(`/admin/tasks?task=${res.id}`) } });
    router.refresh();
  };

  const tabs: { key: MeetingFilter; label: string; count: number }[] = [
    { key: "upcoming", label: "Upcoming", count: upcoming.length },
    { key: "requests", label: "Requests", count: requests.length },
    { key: "past", label: "Past", count: past.length },
    { key: "all", label: "All", count: leads.length },
  ];

  return (
    <>
      {dialog}
      <StatStrip
        items={[
          { label: "Upcoming", value: upcoming.length, hint: upcoming[0] ? `Next: ${when(upcoming[0].meetingAt)}` : "Nothing booked", onClick: () => setFilter("upcoming"), active: filter === "upcoming" },
          { label: "Requests", value: requests.length, hint: "New time or cancel", alert: requests.length > 0, onClick: () => setFilter("requests"), active: filter === "requests" },
          { label: "Link not sent", value: noLink, hint: "Upcoming without a Meet link", alert: noLink > 0 },
          { label: "Won", value: won, hint: met ? `${Math.round((won / met) * 100)}% of meetings held` : "No meetings held yet" },
        ]}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <nav aria-label="Meetings" className="no-scrollbar flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              aria-current={filter === t.key ? "page" : undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors",
                filter === t.key ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {t.label}
              <span className="text-xs tabular-nums opacity-70">{t.count}</span>
            </button>
          ))}
        </nav>
        <div className="relative min-w-0 lg:ml-auto lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, workspace" aria-label="Search meetings" className={cn(inputClass, "h-9 py-1.5 pl-9")} />
        </div>
      </div>

      <Card className="overflow-hidden">
        {shown.length ? (
          <ul className="divide-y">
            {shown.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5 lg:px-6">
                <button type="button" onClick={() => open(l.id)} className="flex min-w-0 flex-1 basis-64 items-start gap-3 text-left">
                  <span className="flex w-12 shrink-0 flex-col items-center rounded-lg border bg-card py-1 leading-none" suppressHydrationWarning>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">{format(parseISO(l.meetingAt), "MMM")}</span>
                    <span className="text-base font-semibold tabular-nums">{format(parseISO(l.meetingAt), "d")}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold" suppressHydrationWarning>
                      {when(l.meetingAt)} · {l.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {l.profileTitle} · {l.workspaceName} · {l.offerTitle}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-medium">
                      {l.status === "booked" && (
                        <span className={cn("inline-flex items-center gap-1", l.meetSharedAt ? "text-success" : l.meetUrl ? "text-warning" : "text-muted-foreground")}>
                          <Video className="h-3.5 w-3.5" /> {l.meetSharedAt ? "Link sent" : l.meetUrl ? "Link not sent" : "No meeting link"}
                        </span>
                      )}
                      {l.cancelRequest && l.status === "booked" && (
                        <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                          <CalendarX className="h-3.5 w-3.5" /> Wants to cancel
                        </span>
                      )}
                      {l.changeRequest && l.status === "booked" && (
                        <span className="inline-flex items-center gap-1 font-semibold text-warning" suppressHydrationWarning>
                          <CalendarClock className="h-3.5 w-3.5" /> Wants {when(l.changeRequest.at)}
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground sm:hidden" />
                </button>
                <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto">
                  {l.status === "booked" && isUpcomingMeeting(l) && (
                    <>
                      <button type="button" className={buttonClass("outline", "sm", "h-8")} onClick={() => mark(l, "met")}>
                        <Check /> Met
                      </button>
                      <button type="button" className={buttonClass("ghost", "sm", "h-8 text-muted-foreground")} onClick={() => mark(l, "lost")}>
                        <X /> No-show
                      </button>
                    </>
                  )}
                  {l.status === "met" && (
                    <button type="button" className={buttonClass("outline", "sm", "h-8")} onClick={() => mark(l, "won")}>
                      <Trophy /> Won
                    </button>
                  )}
                  {l.status !== "booked" && (
                    <Badge variant={LEAD_STATUS[l.status].variant} pill>
                      {LEAD_STATUS[l.status].label}
                    </Badge>
                  )}
                  <Menu
                    label="Meeting actions"
                    trigger={(p) => (
                      <button type="button" {...p} className={buttonClass("ghost", "icon", "h-8 w-8 text-muted-foreground")} aria-label="Meeting actions">
                        <MoreHorizontal />
                      </button>
                    )}
                    items={[
                      { label: "Open", icon: ChevronRight, onSelect: () => open(l.id) },
                      { label: "Add task", icon: ListTodo, onSelect: () => addTask(l) },
                      { label: "Delete", icon: Trash2, onSelect: () => remove(l), tone: "danger", separator: true },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={q ? "No meetings match" : filter === "requests" ? "No open requests" : filter === "upcoming" ? "No upcoming meetings" : "No meetings yet"}>
            {q ? "Try another name or email." : "Meetings appear when someone books from an offer."}{" "}
            {!q && (
              <Link href="/admin/offers" className="font-medium text-primary hover:underline">
                Manage offers
              </Link>
            )}
          </EmptyState>
        )}
      </Card>

      {openLead && <MeetingDialog key={openLead.id} lead={openLead} onClose={() => open(null)} onDelete={() => remove(openLead)} />}
    </>
  );
}
