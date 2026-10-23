"use client";

// Small pieces shared by the audit board, its editors and the live preview.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { updateProfile } from "@/app/(app)/actions";
import { AUDIT_TABS, type AuditTab, type SectionId } from "@/lib/audit";
import type { Location, Suggestion } from "@/lib/gbp/types";
import { cn } from "@/lib/utils";

/** Unsaved edits from the editors, shown in the live preview before they're saved. */
export type Draft = Partial<Location>;
export type OnDraft = (patch: Draft) => void;

/** The editor tab that fixes a section (reviews and posts live on their own pages). */
export const tabOf = (s: SectionId): AuditTab | null => ((AUDIT_TABS as readonly string[]).includes(s) ? (s as AuditTab) : null);

/** Save a patch, then refresh so the audit and suggestions recompute on the server. */
export function useSave(locationId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const save = async (key: string, patch: Parameters<typeof updateProfile>[1], ok: string) => {
    setBusy(key);
    const res = await updateProfile(locationId, patch);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(ok);
    router.refresh();
    return true;
  };
  return { busy, save };
}

/** Report unsaved values to the live preview; clear them when the editor closes. */
export function useDraft(onDraft: OnDraft, draft: Draft) {
  const json = JSON.stringify(draft);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onDraft(draft), [json, onDraft]);
  useEffect(
    () => () => onDraft(Object.fromEntries(Object.keys(JSON.parse(json) as Draft).map((k) => [k, undefined]))),
    // Only on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onDraft],
  );
}

/** Current time, set after mount so server and client render the same markup. */
export function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function SubHead({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex min-h-7 items-center justify-between gap-2">
      <p className="label-caps">{children}</p>
      {action}
    </div>
  );
}

/** Label + optional character counter above a field. */
export function FieldHead({ label, count, max, htmlFor }: { label: string; count?: number; max?: number; htmlFor?: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <label htmlFor={htmlFor} className="label-caps">
        {label}
      </label>
      {max != null && <span className={cn("text-xs tabular-nums", (count ?? 0) > max ? "text-destructive" : "text-muted-foreground")}>{count ?? 0}/{max}</span>}
    </div>
  );
}

/** Removable chip. */
export function Chip({ children, onRemove, disabled, locked }: { children: React.ReactNode; onRemove?: () => void; disabled?: boolean; locked?: string }) {
  return (
    <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border bg-card pl-3 text-sm", onRemove ? "pr-1" : "pr-3", locked && "border-primary/30 bg-accent text-accent-foreground")}>
      {children}
      {locked && <span className="text-[11px] font-semibold opacity-80">· {locked}</span>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${typeof children === "string" ? children : ""}`}
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

/** Dashed "+ name" chips with the reason as a tooltip. */
export function SuggestionChips({ items, onAdd, busyKey, disabled, label }: { items: Suggestion[]; onAdd: (s: Suggestion) => void; busyKey?: string | null; disabled?: boolean; label?: (n: string) => string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No new suggestions. You&apos;ve covered the common ones.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((s) => (
        <button
          key={s.name}
          type="button"
          title={s.reason}
          disabled={disabled || !!busyKey}
          onClick={() => onAdd(s)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed px-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          {busyKey === `add:${s.name}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {label ? label(s.name) : s.name}
        </button>
      ))}
    </div>
  );
}

/** Resize an image file client-side and return it as a data URL (stand-in for file storage). */
export async function readImage(file: File, maxEdge = 1200): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
