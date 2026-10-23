"use client";

// Add a competitor from its Google Maps profile link (step 1), then check the details (step 2): name, address, categories, rating,
// reviews, website and distance are read from the link (src/lib/maps-scrape.ts). If Google gives nothing usable, the form stays
// manual. The same form edits an added competitor later, with "Refresh from Google" to re-read its link.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CircleCheck, ExternalLink, Link2, Loader2, RefreshCw } from "lucide-react";
import { addCompetitor, readMapsLink, updateCompetitor } from "@/app/(app)/actions";
import { buttonClass, inputClass } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import { GOOGLE_CATEGORIES } from "@/lib/gbp/categories";
import type { Competitor } from "@/lib/gbp/types";
import { cn } from "@/lib/utils";

type Form = {
  name: string;
  address: string;
  primaryCategory: string;
  additionalCategories: string;
  rating: string;
  reviewCount: string;
  websiteUri: string;
  mapsUrl: string | null;
  cid: string | null;
  distanceKm: number | null;
};
const empty: Form = { name: "", address: "", primaryCategory: "", additionalCategories: "", rating: "", reviewCount: "", websiteUri: "", mapsUrl: null, cid: null, distanceKm: null };
const fromCompetitor = (c: Competitor): Form => ({
  name: c.name,
  address: c.address,
  primaryCategory: c.primaryCategory,
  additionalCategories: c.additionalCategories.join(", "),
  rating: c.rating != null ? String(c.rating) : "",
  reviewCount: String(c.reviewCount),
  websiteUri: c.websiteUri ?? "",
  mapsUrl: c.mapsUrl ?? null,
  cid: c.cid ?? null,
  distanceKm: c.distanceKm,
});

export function CompetitorDialog({
  open,
  onClose,
  locationId,
  editing,
  defaultCategory,
}: {
  open: boolean;
  onClose: () => void;
  locationId: string;
  /** Edit this added competitor instead of adding one. */
  editing?: Competitor | null;
  /** Prefills the main category (your own main category). */
  defaultCategory: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"link" | "details">("link");
  const [link, setLink] = useState("");
  const [f, setF] = useState<Form>(empty);
  const [note, setNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(editing ? "details" : "link");
    setLink("");
    setNote(null);
    setF(editing ? fromCompetitor(editing) : empty);
  }, [open, editing]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  /** Read the business's details from its Maps link and fill the form (keeps what Google doesn't give). */
  const fill = async (url: string) => {
    setBusy(true);
    const res = await readMapsLink(locationId, url);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    const { info, place, distanceKm } = res;
    setF((x) =>
      place
        ? {
            ...x,
            name: place.name,
            address: place.address || x.address,
            primaryCategory: place.primaryCategory ?? x.primaryCategory,
            additionalCategories: place.additionalCategories.join(", "),
            rating: place.rating != null ? String(place.rating) : "",
            reviewCount: String(place.reviewCount),
            websiteUri: place.websiteUri ?? "",
            mapsUrl: place.mapsUrl || info.url,
            cid: place.cid ?? info.cid,
            distanceKm: distanceKm ?? x.distanceKm,
          }
        : { ...x, name: x.name || info.name || "", mapsUrl: info.url, cid: info.cid },
    );
    setNote(
      place
        ? { tone: "ok", text: "Filled in from Google Maps. Check the details." }
        : { tone: "warn", text: `Couldn't read the details from this link${info.name ? "" : ", not even the name"}. Fill them in from the Google profile.` },
    );
    return true;
  };

  const readLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await fill(link)) setStep("details");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      name: f.name,
      address: f.address,
      primaryCategory: f.primaryCategory,
      additionalCategories: f.additionalCategories
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      rating: f.rating.trim() ? Number(f.rating) : null,
      reviewCount: f.reviewCount.trim() ? Math.round(Number(f.reviewCount)) : 0,
      websiteUri: f.websiteUri.trim() || null,
      mapsUrl: f.mapsUrl,
      cid: f.cid,
      distanceKm: f.distanceKm,
    };
    setBusy(true);
    const res = editing ? await updateCompetitor(locationId, editing.id, input) : await addCompetitor(locationId, input);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(editing ? `${f.name} updated` : `Added ${f.name}`);
    router.refresh();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={editing ? "Edit competitor" : "Add competitor"} className="h-auto max-h-[94dvh] sm:max-w-lg">
      {step === "link" ? (
        <form onSubmit={readLink} className="space-y-4 p-5">
          <label className="block space-y-1.5">
            <span className="label-caps block">Google Maps link</span>
            <span className="relative block">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://maps.app.goo.gl/…" aria-label="Google Maps link" className={cn(inputClass, "h-10 pl-9")} autoFocus />
            </span>
          </label>
          <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
            <li>Open the competitor on Google Maps.</li>
            <li>Click Share → Copy link, and paste it here.</li>
          </ol>
          <div className="flex items-center justify-between gap-2 pt-1">
            <button type="button" className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline" onClick={() => setStep("details")}>
              Add without a link
            </button>
            <button type="submit" className={buttonClass()} disabled={busy || !link.trim()}>
              {busy && <Loader2 className="animate-spin" />} Continue
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {note ? (
              <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", note.tone === "ok" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                {note.tone === "ok" && <CircleCheck className="h-4 w-4 shrink-0" />}
                <span className="min-w-0 flex-1">{note.text}</span>
                {f.mapsUrl && (
                  <a href={f.mapsUrl} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm", "shrink-0")}>
                    <ExternalLink /> Open
                  </a>
                )}
              </div>
            ) : (
              editing &&
              f.mapsUrl && (
                <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                  <span className="min-w-0 flex-1">Get the latest rating and reviews from its Google profile.</span>
                  <button type="button" className={buttonClass("outline", "sm", "shrink-0")} onClick={() => fill(f.mapsUrl!)} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh from Google
                  </button>
                </div>
              )
            )}
            <label className="block space-y-1.5">
              <span className="label-caps block">Business name</span>
              <input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={120} className={inputClass} required autoFocus={!f.name} />
            </label>
            <label className="block space-y-1.5">
              <span className="label-caps block">Address</span>
              <input value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={200} className={inputClass} placeholder="Street, city" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="label-caps block">Main category</span>
                <input
                  value={f.primaryCategory}
                  onChange={(e) => set("primaryCategory", e.target.value)}
                  list="competitor-categories"
                  maxLength={100}
                  className={inputClass}
                  placeholder={`e.g. ${defaultCategory}`}
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className="label-caps block">Sub-categories</span>
                <input value={f.additionalCategories} onChange={(e) => set("additionalCategories", e.target.value)} className={inputClass} placeholder="Separate with commas" />
              </label>
            </div>
            <datalist id="competitor-categories">
              {GOOGLE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.displayName} />
              ))}
            </datalist>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="label-caps block">Rating</span>
                <input type="number" inputMode="decimal" min={1} max={5} step={0.1} value={f.rating} onChange={(e) => set("rating", e.target.value)} className={inputClass} placeholder="4.6" />
              </label>
              <label className="block space-y-1.5">
                <span className="label-caps block">Reviews</span>
                <input type="number" inputMode="numeric" min={0} step={1} value={f.reviewCount} onChange={(e) => set("reviewCount", e.target.value)} className={inputClass} placeholder="268" />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="label-caps block">Website (optional)</span>
              <input type="url" value={f.websiteUri} onChange={(e) => set("websiteUri", e.target.value)} className={inputClass} placeholder="https://" />
            </label>
          </div>
          <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
            {!editing ? (
              <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setStep("link")} disabled={busy}>
                <ArrowLeft /> Back
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className={buttonClass()} disabled={busy || !f.name.trim() || !f.primaryCategory.trim()}>
                {busy && <Loader2 className="animate-spin" />} {editing ? "Save" : "Add competitor"}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
