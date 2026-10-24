"use client";

// Admin → Offers: service promotions on customers' dashboards (title, info, price, button, timing), how each one performs
// (seen → clicked → booked → met → won) and who sees each one (every workspace, or only the ones it was sent to).
// The meetings they bring in are on Admin → Meetings.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, CalendarClock, Loader2, MoreHorizontal, Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { OfferCard } from "@/components/offer-card";
import { Badge, Card, EmptyState, PanelHeader, SectionLink, StatStrip, buttonClass, inputClass } from "@/components/ui";
import { Menu, Modal, Segmented, Switch, useConfirm } from "@/components/ui-client";
import { deleteOffer, saveOffer } from "@/app/admin/actions";
import type { Offer, OfferLead } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

type Draft = {
  id: string | null;
  title: string;
  description: string;
  price: string;
  cta: string;
  active: boolean;
  startAfterDays: number;
  snoozeDays: number;
  /** [] = every workspace. */
  workspaceIds: string[];
};
type WorkspaceOption = { id: string; name: string; ownerEmail: string };

const newDraft = (workspaceIds: string[] = []): Draft => ({
  id: null,
  title: "",
  description: "",
  price: "",
  cta: "Book a meeting",
  active: true,
  startAfterDays: 7,
  snoozeDays: 7,
  workspaceIds,
});
const toDraft = (o: Offer): Draft => ({
  id: o.id,
  title: o.title,
  description: o.description,
  price: o.price ?? "",
  cta: o.cta,
  active: o.active,
  startAfterDays: o.startAfterDays,
  snoozeDays: o.snoozeDays,
  workspaceIds: o.workspaceIds ?? [],
});

const TITLE_IDEAS = ["Not getting calls from Google?", "Need marketing support?", "Get up to 7x more calls from Google", "Managed Local SEO Services"];

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
/** Seen → clicked → booked → met (met or won) → won. */
function funnel(views: number, clicks: number, leads: OfferLead[]) {
  const met = leads.filter((l) => l.status === "met" || l.status === "won").length;
  return { views, clicks, booked: leads.length, met, won: leads.filter((l) => l.status === "won").length };
}
export function OffersBoard({ offers, leads, workspaces, newFor }: { offers: Offer[]; leads: OfferLead[]; workspaces: WorkspaceOption[]; newFor: string | null }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  // ?new=1&for=<workspace> (from a workspace's "Send offer"): a new offer only for that workspace.
  const [draft, setDraft] = useState<Draft | null>(newFor ? newDraft([newFor]) : null);
  const upcoming = leads.filter((l) => l.status === "booked" && new Date(l.meetingAt).getTime() > Date.now() - 60 * 60_000).length;
  const nameOf = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id;
  const total = funnel(
    offers.reduce((n, o) => n + o.views, 0),
    offers.reduce((n, o) => n + o.clicks, 0),
    leads,
  );

  const toggle = async (o: Offer) => {
    const { id, ...input } = toDraft(o);
    const res = await saveOffer(id, { ...input, active: !o.active });
    if (!res.ok) return void toast.error(res.error);
    toast.success(o.active ? "Offer hidden" : "Offer is live");
    router.refresh();
  };
  const remove = async (o: Offer) => {
    if (!(await confirm({ title: "Delete this offer?", description: "Its meetings stay on the Meetings page.", confirmLabel: "Delete", tone: "danger" }))) return;
    const res = await deleteOffer(o.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Offer deleted");
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

      <div>
        <Card className="overflow-hidden">
          <PanelHeader
            title="Offers"
            meta={offers.length || undefined}
            action={
              <button type="button" className={buttonClass("default", "sm")} onClick={() => setDraft(newDraft())}>
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
                          <span className="inline-flex items-center gap-1 font-medium text-foreground" title={o.workspaceIds?.map(nameOf).join(", ")}>
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            {o.workspaceIds?.length ? (o.workspaceIds.length === 1 ? nameOf(o.workspaceIds[0]) : `${o.workspaceIds.length} workspaces`) : "All workspaces"}
                          </span>
                          <span className="ml-1">
                            {o.workspaceIds?.length ? "" : `From day ${o.startAfterDays} · `}closed {o.closes}× · back after {o.snoozeDays} days
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
                            onSelect: () => setDraft(toDraft(o)),
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

        <p className="mt-3 flex items-center justify-end gap-1.5 text-sm text-muted-foreground">
          <CalendarClock className="h-4 w-4" /> {upcoming} upcoming meeting{upcoming === 1 ? "" : "s"} ·<SectionLink href="/admin/meetings">Meetings</SectionLink>
        </p>
      </div>

      {draft && (
        <OfferForm
          draft={draft}
          workspaces={workspaces}
          onClose={() => {
            setDraft(null);
            if (newFor) router.replace("/admin/offers", { scroll: false });
          }}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}

function OfferForm({ draft, workspaces, onClose, onSaved }: { draft: Draft; workspaces: WorkspaceOption[]; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(draft);
  const [audience, setAudience] = useState<"all" | "chosen">(draft.workspaceIds.length ? "chosen" : "all");
  const [wsSearch, setWsSearch] = useState("");
  const chosen = audience === "chosen" ? d.workspaceIds : [];
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { id, ...input } = d;
    if (audience === "chosen" && !d.workspaceIds.length) {
      setSaving(false);
      return void toast.error("Pick at least one workspace");
    }
    const res = await saveOffer(id, { ...input, workspaceIds: chosen });
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
            <span className="label-caps block">Who sees it</span>
            <Segmented
              label="Who sees it"
              value={audience}
              onChange={setAudience}
              options={[
                { value: "all", label: "Every workspace" },
                { value: "chosen", label: "Chosen workspaces" },
              ]}
            />
            {audience === "chosen" && (
              <div className="overflow-hidden rounded-lg border">
                <div className="relative border-b">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={wsSearch}
                    onChange={(e) => setWsSearch(e.target.value)}
                    placeholder="Search workspaces"
                    aria-label="Search workspaces"
                    className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none"
                  />
                </div>
                <ul className="max-h-48 divide-y overflow-y-auto">
                  {workspaces
                    .filter((w) => !wsSearch.trim() || `${w.name} ${w.ownerEmail}`.toLowerCase().includes(wsSearch.trim().toLowerCase()))
                    .map((w) => {
                      const on = d.workspaceIds.includes(w.id);
                      return (
                        <li key={w.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => set("workspaceIds", on ? d.workspaceIds.filter((x) => x !== w.id) : [...d.workspaceIds, w.id])}
                              className="h-4 w-4 accent-[hsl(var(--primary))]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{w.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">{w.ownerEmail}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
            <span className="block text-xs text-muted-foreground">
              {audience === "chosen" ? `${d.workspaceIds.length} picked. They see it on their Dashboard straight away.` : "Every workspace, from the day set below."}
            </span>
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
