"use client";

// Admin → one workspace: which offers its Dashboard shows today, and "Send offer" (show one to this workspace now).
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Loader2, Plus, Send } from "lucide-react";
import { QuickAction } from "./quick-action";
import { Badge, Card, PanelHeader, buttonClass } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import { sendOffer } from "@/app/admin/actions";
import type { Offer } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

export interface WorkspaceOfferRow {
  offer: Offer;
  hidden: { reason: "not_sent" | "new_account" | "closed"; until: string | null } | null;
  sentAt: string | null;
}

export function WorkspaceOffers({ workspace, rows }: { workspace: { id: string; name: string }; rows: WorkspaceOfferRow[] }) {
  const [sending, setSending] = useState(false);
  // Offers that reach this workspace (all-workspace ones, and targeted ones it was sent).
  const reaching = rows.filter((r) => r.offer.active && r.hidden?.reason !== "not_sent");

  return (
    <Card className="overflow-hidden">
      <PanelHeader
        title="Offers"
        meta={reaching.length || undefined}
        action={
          <button type="button" className={buttonClass("outline", "sm")} onClick={() => setSending(true)}>
            <Send /> Send offer
          </button>
        }
      />
      {reaching.length ? (
        <ul className="divide-y">
          {reaching.map(({ offer, hidden, sentAt }) => (
            <li key={offer.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-sm lg:px-6">
              <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                <span className="block font-medium sm:truncate">{offer.title}</span>
                <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
                  {offer.workspaceIds?.length ? "Only workspaces it was sent to" : "Every workspace"}
                  {sentAt && ` · sent ${format(parseISO(sentAt), "d MMM")}`}
                </span>
              </span>
              {hidden ? (
                <>
                  <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                    {hidden.reason === "new_account" ? "New account" : "Closed"} · shows {hidden.until ? format(parseISO(hidden.until), "d MMM") : "later"}
                  </span>
                  {hidden.reason === "closed" && <QuickAction kind="reopenOffer" workspaceId={`${workspace.id}|${offer.id}`} label="Show again now" />}
                </>
              ) : (
                <Badge variant="success" pill>
                  Showing
                </Badge>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">No offers reach this workspace. Send one to show it on their Dashboard.</p>
      )}
      {sending && <SendOfferDialog workspace={workspace} rows={rows.filter((r) => r.offer.active)} onClose={() => setSending(false)} />}
    </Card>
  );
}

function SendOfferDialog({ workspace, rows, onClose }: { workspace: { id: string; name: string }; rows: WorkspaceOfferRow[]; onClose: () => void }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(rows.find((r) => r.hidden)?.offer.id ?? rows[0]?.offer.id ?? null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!picked) return;
    setBusy(true);
    const res = await sendOffer(workspace.id, picked);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`Sent to ${workspace.name}`, { description: "It's on their Dashboard now." });
    router.refresh();
    onClose();
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title={`Send an offer to ${workspace.name}`} className="h-auto max-h-[90dvh] sm:max-w-lg">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        {rows.length ? (
          <ul className="space-y-2" role="radiogroup" aria-label="Offer">
            {rows.map(({ offer, hidden }) => (
              <li key={offer.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={picked === offer.id}
                  onClick={() => setPicked(offer.id)}
                  className={cn("flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40", picked === offer.id && "border-primary bg-accent/40")}
                >
                  <span className={cn("mt-0.5 h-4 w-4 shrink-0 rounded-full border-2", picked === offer.id ? "border-[5px] border-primary" : "border-muted-foreground/40")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{offer.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {offer.price ? `${offer.price} · ` : ""}
                      {hidden ? (hidden.reason === "not_sent" ? "Not sent to them yet" : hidden.reason === "new_account" ? "Waiting for the new-account days" : "They closed it") : "Already showing"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">There are no live offers. Create one just for this workspace.</p>
        )}
        <Link href={`/admin/offers?new=1&for=${encodeURIComponent(workspace.id)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <Plus className="h-4 w-4" /> New offer just for {workspace.name}
        </Link>
        <p className="text-xs text-muted-foreground">Sending shows it on their Dashboard straight away, even if they closed it or signed up recently.</p>
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={buttonClass()} onClick={send} disabled={busy || !picked}>
          {busy ? <Loader2 className="animate-spin" /> : <Send />} Send
        </button>
      </div>
    </Modal>
  );
}
