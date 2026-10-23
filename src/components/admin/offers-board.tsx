"use client";

// Admin → Offers: service promotions on customers' dashboards (title, info, price, button, timing), how each one performs
// (seen → clicked → booked → met → won) and the meetings they bring in.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { toast } from "sonner";
import { CalendarClock, CalendarX, Check, ChevronRight, Loader2, MoreHorizontal, Pencil, Plus, Tag, Trash2, Trophy, Video, X } from "lucide-react";
import { MeetingDialog } from "./meeting-dialog";
import { OfferCard } from "@/components/offer-card";
import { Badge, Card, EmptyState, PanelHeader, StatStrip, buttonClass, inputClass } from "@/components/ui";
import { Menu, Modal, SelectBox, Switch, useConfirm } from "@/components/ui-client";
import { deleteMeeting, deleteOffer, saveOffer, setLeadStatus } from "@/app/admin/actions";
import { LEAD_STATUS, type LeadStatus, type Offer, type OfferLead } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

type Draft = { id: string | null; title: string; description: string; price: string; cta: string; active: boolean; startAfterDays: number; snoozeDays: number };

const TITLE_IDEAS = ["Not getting calls from Google?", "Need marketing support?", "Get up to 7x more calls from Google", "Managed Local SEO Services"];

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
/** Seen → clicked → booked → met (met or won) → won. */
function funnel(views: number, clicks: number, leads: OfferLead[]) {
  const met = leads.filter((l) => l.status === "met" || l.status === "won").length;
  return { views, clicks, booked: leads.length, met, won: leads.filter((l) => l.status === "won").length };
}
const when = (iso: string) => {
  const d = parseISO(iso);
  return `${isToday(d) ? "Today" : isTomorrow(d) ? "Tomorrow" : format(d, "EEE d MMM")}, ${format(d, "HH:mm")}`;
};

export function OffersBoard({ offers, leads }: { offers: Offer[]; leads: OfferLead[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const openLead = leads.find((l) => l.id === openId) ?? null;
  const now = Date.now();
  const upcoming = leads.filter((l) => l.status === "booked" && new Date(l.meetingAt).getTime() > now - 60 * 60_000).sort((a, b) => a.meetingAt.localeCompare(b.meetingAt));
  const total = funnel(
    offers.reduce((n, o) => n + o.views, 0),
    offers.reduce((n, o) => n + o.clicks, 0),
    leads,
  );

  const toggle = async (o: Offer) => {
    const res = await saveOffer(o.id, {
      title: o.title,
      description: o.description,
      price: o.price ?? "",
      cta: o.cta,
      active: !o.active,
      startAfterDays: o.startAfterDays,
      snoozeDays: o.snoozeDays,
    });
    if (!res.ok) return void toast.error(res.error);
    toast.success(o.active ? "Offer hidden" : "Offer is live");
    router.refresh();
  };
  const remove = async (o: Offer) => {
    if (!(await confirm({ title: "Delete this offer?", description: "Its meetings stay in the list below.", confirmLabel: "Delete", tone: "danger" }))) return;
    const res = await deleteOffer(o.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Offer deleted");
    router.refresh();
  };
  const removeMeeting = async (l: OfferLead) => {
    const ok = await confirm({
      title: "Delete this meeting?",
      description: `${l.profileTitle} · ${l.name}. It's removed from the lists and the client's Dashboard, and the numbers above update. This can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    const res = await deleteMeeting(l.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Meeting deleted");
    if (openId === l.id) setOpenId(null);
    router.refresh();
  };
  const mark = async (l: OfferLead, status: LeadStatus) => {
    const res = await setLeadStatus(l.id, status);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`Marked ${LEAD_STATUS[status].label.toLowerCase()}`);
    router.refresh();
  };

  return (
    <>
      {dialog}
      <StatStrip
        cols={5}
        items={[
          { label: "Seen", value: total.views.toLocaleString() },
          { label: "Clicked", value: total.clicks.toLocaleString(), hint: `${pct(total.clicks, total.views)}% of views` },
          { label: "Booked", value: total.booked, hint: `${pct(total.booked, total.clicks)}% of clicks` },
          { label: "Met", value: total.met, hint: `${pct(total.met, total.booked)}% of bookings` },
          { label: "Won", value: total.won, hint: `${pct(total.won, total.met)}% of meetings` },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <Card className="overflow-hidden">
          <PanelHeader
            title="Offers"
            meta={offers.length || undefined}
            action={
              <button
                type="button"
                className={buttonClass("default", "sm")}
                onClick={() =>
                  setDraft({
                    id: null,
                    title: "",
                    description: "",
                    price: "",
                    cta: "Book a meeting",
                    active: true,
                    startAfterDays: 7,
                    snoozeDays: 7,
                  })
                }
              >
                <Plus /> New offer
              </button>
            }
          />
          {offers.length ? (
            <ul className="divide-y">
              {offers.map((o) => {
                const f = funnel(
                  o.views,
                  o.clicks,
                  leads.filter((l) => l.offerId === o.id),
                );
                return (
                  <li key={o.id} className="space-y-3 px-5 py-4 lg:px-6">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <Tag className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-semibold leading-snug">{o.title}</p>
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {o.price && (
                            <Badge variant="default" pill>
                              {o.price}
                            </Badge>
                          )}
                          <span className="ml-1">
                            From day {o.startAfterDays} · closed {o.closes}× · back after {o.snoozeDays} days
                          </span>
                        </p>
                      </div>
                      <Switch checked={o.active} onChange={() => toggle(o)} label={o.active ? "Hide offer" : "Show offer"} />
                      <Menu
                        label="Offer actions"
                        trigger={(p) => (
                          <button type="button" {...p} className={buttonClass("ghost", "icon", "-my-1 h-8 w-8 text-muted-foreground")} aria-label="Offer actions">
                            <MoreHorizontal />
                          </button>
                        )}
                        items={[
                          {
                            label: "Edit",
                            icon: Pencil,
                            onSelect: () =>
                              setDraft({
                                id: o.id,
                                title: o.title,
                                description: o.description,
                                price: o.price ?? "",
                                cta: o.cta,
                                active: o.active,
                                startAfterDays: o.startAfterDays,
                                snoozeDays: o.snoozeDays,
                              }),
                          },
                          { label: "Delete", icon: Trash2, onSelect: () => remove(o), tone: "danger", separator: true },
                        ]}
                      />
                    </div>
                    {/* Funnel: each step's bar is relative to views. */}
                    <dl className="grid grid-cols-5 gap-2 sm:ml-12">
                      {(
                        [
                          ["Seen", f.views, null],
                          ["Clicked", f.clicks, pct(f.clicks, f.views)],
                          ["Booked", f.booked, pct(f.booked, f.clicks)],
                          ["Met", f.met, pct(f.met, f.booked)],
                          ["Won", f.won, pct(f.won, f.met)],
                        ] as const
                      ).map(([label, n, rate]) => (
                        <div key={label} className="min-w-0">
                          <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
                          <dd className="flex items-baseline gap-1">
                            <span className="text-base font-semibold tabular-nums">{n}</span>
                            {rate != null && <span className="text-[11px] tabular-nums text-muted-foreground">{rate}%</span>}
                          </dd>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${f.views ? Math.max(n ? 4 : 0, (n / f.views) * 100) : 0}%` }} />
                          </div>
                        </div>
                      ))}
                    </dl>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No offers yet">Promote a service, like managed Local SEO, to free users.</EmptyState>
          )}
        </Card>

        <Card className="overflow-hidden">
          <PanelHeader title="Upcoming meetings" meta={upcoming.length || undefined} />
          {upcoming.length ? (
            <ul className="divide-y">
              {upcoming.map((l) => (
                <li key={l.id} className="space-y-2 px-5 py-3">
                  <button type="button" onClick={() => setOpenId(l.id)} className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-muted/40">
                    <span className="flex w-12 shrink-0 flex-col items-center rounded-lg border bg-card py-1 leading-none" suppressHydrationWarning>
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">{format(parseISO(l.meetingAt), "MMM")}</span>
                      <span className="text-base font-semibold tabular-nums">{format(parseISO(l.meetingAt), "d")}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold" suppressHydrationWarning>
                        {when(l.meetingAt)}
                      </p>
                      <p className="truncate text-sm">
                        {l.name} · {l.profileTitle}
                      </p>
                      <p className={cn("mt-1 inline-flex items-center gap-1 text-xs font-medium", l.meetSharedAt ? "text-success" : l.meetUrl ? "text-warning" : "text-muted-foreground")}>
                        <Video className="h-3.5 w-3.5" /> {l.meetSharedAt ? "Link sent" : l.meetUrl ? "Link not sent" : "No meeting link"}
                      </p>
                      {l.cancelRequest && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-destructive">
                          <CalendarX className="h-3.5 w-3.5" /> Wants to cancel
                        </p>
                      )}
                      {l.changeRequest && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-warning" suppressHydrationWarning>
                          <CalendarClock className="h-3.5 w-3.5" /> Wants {when(l.changeRequest.at)}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                  <div className="flex flex-wrap gap-1.5 pl-[60px]">
                    {!l.meetSharedAt && (
                      <button type="button" className={buttonClass("default", "sm", "h-7 px-2 text-xs")} onClick={() => setOpenId(l.id)}>
                        <Video /> {l.meetUrl ? "Send link" : "Add Meet link"}
                      </button>
                    )}
                    <button type="button" className={buttonClass("outline", "sm", "h-7 px-2 text-xs")} onClick={() => mark(l, "met")}>
                      <Check /> Met
                    </button>
                    <button type="button" className={buttonClass("ghost", "sm", "h-7 px-2 text-xs text-muted-foreground")} onClick={() => mark(l, "lost")}>
                      <X /> No-show
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">No meetings booked.</p>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <PanelHeader title="All meetings" meta={leads.length || undefined} />
        {leads.length ? (
          <ul className="divide-y">
            {leads.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 lg:px-6">
                <button type="button" onClick={() => setOpenId(l.id)} className="min-w-0 flex-1 basis-56 text-left hover:underline-offset-2 [&:hover_p:first-child]:underline">
                  <p className="truncate text-sm font-semibold">
                    {l.profileTitle} <span className="font-normal text-muted-foreground">· {l.name}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
                    {when(l.meetingAt)} · {l.email}
                    {l.phone ? ` · ${l.phone}` : ""}
                  </p>
                </button>
                <span className="hidden max-w-56 truncate text-xs text-muted-foreground md:inline">{l.offerTitle}</span>
                {l.status === "met" && (
                  <button type="button" className={buttonClass("outline", "sm")} onClick={() => mark(l, "won")}>
                    <Trophy /> Won
                  </button>
                )}
                <SelectBox
                  label="Meeting status"
                  value={l.status}
                  onChange={(v) => mark(l, v as LeadStatus)}
                  options={(Object.keys(LEAD_STATUS) as LeadStatus[]).map((k) => ({ value: k, label: LEAD_STATUS[k].label }))}
                  className="w-32 [&_select]:h-8"
                />
                <button
                  type="button"
                  className={buttonClass("ghost", "icon", "h-8 w-8 text-muted-foreground hover:text-destructive")}
                  aria-label="Delete meeting"
                  title="Delete"
                  onClick={() => removeMeeting(l)}
                >
                  <Trash2 />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No meetings yet. They appear when someone books from an offer.</p>
        )}
      </Card>

      {draft && <OfferForm draft={draft} onClose={() => setDraft(null)} onSaved={() => router.refresh()} />}
      {openLead && <MeetingDialog key={openLead.id} lead={openLead} onClose={() => setOpenId(null)} onDelete={() => removeMeeting(openLead)} />}
    </>
  );
}

function OfferForm({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(draft);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { id, ...input } = d;
    const res = await saveOffer(id, input);
    setSaving(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(id ? "Offer saved" : d.active ? "Offer is live" : "Offer saved");
    onSaved();
    onClose();
  };

  return (
    <Modal open onClose={() => !saving && onClose()} title={d.id ? "Edit offer" : "New offer"} className="h-auto max-h-[94dvh] sm:max-w-2xl">
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="space-y-1.5">
            <span className="label-caps block">Preview</span>
            <OfferCard offer={{ ...d, id: d.id ?? "preview" }} preview />
          </div>
          <label className="block space-y-1.5">
            <span className="label-caps block">Title</span>
            <input value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={90} className={inputClass} placeholder="Not getting calls from Google?" autoFocus={!d.id} />
          </label>
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {TITLE_IDEAS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("title", t)}
                className="rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
              >
                {t}
              </button>
            ))}
          </div>
          <label className="block space-y-1.5">
            <span className="label-caps block">Info</span>
            <textarea
              value={d.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              maxLength={300}
              className={`${inputClass} resize-y`}
              placeholder="What you do and why it helps"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="label-caps block">Price (optional)</span>
              <input value={d.price} onChange={(e) => set("price", e.target.value)} maxLength={30} className={inputClass} placeholder="$299 / month" />
            </label>
            <label className="block space-y-1.5">
              <span className="label-caps block">Button</span>
              <input value={d.cta} onChange={(e) => set("cta", e.target.value)} maxLength={30} className={inputClass} placeholder="Book a meeting" />
            </label>
          </div>
          <div className="space-y-1.5">
            <span className="label-caps block">When</span>
            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">Start after sign-up</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={d.startAfterDays}
                  onChange={(e) => set("startAfterDays", Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  className={cn(inputClass, "w-20 text-right")}
                  aria-label="Days after sign-up"
                />
                <span className="text-muted-foreground">days</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">Show again after closing</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={d.snoozeDays}
                  onChange={(e) => set("snoozeDays", Math.max(1, Math.round(Number(e.target.value) || 1)))}
                  className={cn(inputClass, "w-20 text-right")}
                  aria-label="Days after closing"
                />
                <span className="text-muted-foreground">days</span>
              </label>
            </div>
            <span className="block text-xs text-muted-foreground">Shows every day on the Dashboard until the company closes it.</span>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <span className="text-sm font-medium">Live on dashboards</span>
            <Switch checked={d.active} onChange={(v) => set("active", v)} label="Live on dashboards" />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={buttonClass()} disabled={saving || !d.title.trim() || !d.cta.trim()}>
            {saving && <Loader2 className="animate-spin" />} {d.id ? "Save" : "Create offer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
