"use client";

// Settings → Templates: review request emails, request texts and review replies. Editor has merge-field chips and a live preview.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import { Copy, Loader2, Mail, MessageSquare, MessageSquareReply, MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Card, EmptyState, PanelHeader, buttonClass, inputClass } from "@/components/ui";
import { Menu, Modal, Segmented, Switch, useConfirm } from "@/components/ui-client";
import { deleteTemplate, saveTemplate, setDefaultTemplate } from "@/app/(app)/actions";
import type { MessageTemplate, StarRating, TemplateKind } from "@/lib/gbp/types";
import { SAMPLE_VARS, TEMPLATE_FIELDS, TEMPLATE_KINDS, kindInfo, mergeTemplate, templateOrder } from "@/lib/templates";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<TemplateKind, React.ElementType> = { request_email: Mail, request_sms: MessageSquare, reply: MessageSquareReply };
const SMS_MAX = 480;

type Draft = { id: string | null; kind: TemplateKind; name: string; subject: string; body: string; isDefault: boolean; ratings: StarRating[] };
const toDraft = (t: MessageTemplate): Draft => ({ id: t.id, kind: t.kind, name: t.name, subject: t.subject ?? "", body: t.body, isDefault: !!t.isDefault, ratings: t.ratings ?? [] });
const blank = (kind: TemplateKind): Draft => ({
  id: null,
  kind,
  name: "",
  subject: kind === "request_email" ? "How was your visit to {{business}}?" : "",
  body: kind === "reply" ? "Hi {{name}}, thank you for your review! — {{business}}" : "Hi {{name}}, thanks for choosing {{business}}! Would you leave us a quick Google review?\n\n{{link}}",
  isDefault: false,
  ratings: [],
});

export function TemplatesBoard({ templates, businessName, initialKind }: { templates: MessageTemplate[]; businessName: string; initialKind: TemplateKind }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [kind, setKind] = useState<TemplateKind>(initialKind);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const vars = { ...SAMPLE_VARS, business: businessName };
  const list = templates.filter((t) => t.kind === kind).sort(templateOrder);
  const info = kindInfo(kind);
  const counts = Object.fromEntries(TEMPLATE_KINDS.map((k) => [k.key, templates.filter((t) => t.kind === k.key).length]));

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return void toast.error(res.error ?? "Something went wrong");
    toast.success(ok);
    router.refresh();
  };

  const remove = async (t: MessageTemplate) => {
    if (list.length === 1) return void toast.error("Keep at least one template of each type");
    const ok = await confirm({ title: `Delete "${t.name}"?`, description: t.isDefault ? "The next template becomes the default." : "This can't be undone.", confirmLabel: "Delete", tone: "danger" });
    if (ok) await run(`del-${t.id}`, () => deleteTemplate(t.id), "Template deleted");
  };

  return (
    <div className="space-y-5">
      {dialog}
      <Segmented
        label="Template type"
        value={kind}
        onChange={setKind}
        options={TEMPLATE_KINDS.map((k) => {
          const Icon = KIND_ICON[k.key];
          return {
            value: k.key,
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Icon className="h-4 w-4" />
                <span className="sm:hidden">{k.short}</span>
                <span className="hidden sm:inline">{k.label}</span>
                <span className="text-xs tabular-nums opacity-60">{counts[k.key]}</span>
              </span>
            ),
          };
        })}
      />

      <Card className="overflow-hidden">
        <PanelHeader
          title={info.label}
          meta={list.length}
          action={
            <button type="button" className={buttonClass("default", "sm")} onClick={() => setEditing(blank(kind))}>
              <Plus /> New template
            </button>
          }
        />
        <p className="border-b bg-muted/30 px-5 py-2 text-xs text-muted-foreground lg:px-6">{info.hint}</p>
        {list.length ? (
          <ul className="divide-y">
            {list.map((t) => (
              <li key={t.id} className="group flex items-start gap-3 px-5 py-4 lg:px-6">
                <button type="button" onClick={() => setEditing(toDraft(t))} className="min-w-0 flex-1 text-left">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold group-hover:text-primary">{t.name}</span>
                    {t.isDefault && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">Default</span>}
                    {t.kind === "reply" && !!t.ratings?.length && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                        {t.ratings.join(", ")}
                        <Star className="h-2.5 w-2.5 fill-current" />
                      </span>
                    )}
                  </p>
                  {t.subject && <p className="mt-1 truncate text-sm font-medium">{mergeTemplate(t.subject, vars)}</p>}
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{mergeTemplate(t.body, vars).replace(/\s+/g, " ")}</p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">Edited {formatDistanceToNow(parseISO(t.updatedAt), { addSuffix: true })}</p>
                </button>
                <Menu
                  label={`${t.name} actions`}
                  trigger={(p) => (
                    <button type="button" {...p} className={buttonClass("ghost", "icon", "h-8 w-8 shrink-0 text-muted-foreground")} aria-label={`${t.name} actions`}>
                      {busy?.endsWith(t.id) ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                    </button>
                  )}
                  items={[
                    { label: "Edit", icon: Pencil, onSelect: () => setEditing(toDraft(t)) },
                    ...(t.isDefault ? [] : [{ label: "Set as default", icon: Star, onSelect: () => void run(`def-${t.id}`, () => setDefaultTemplate(t.id), `"${t.name}" is now the default`) }]),
                    { label: "Duplicate", icon: Copy, onSelect: () => setEditing({ ...toDraft(t), id: null, name: `${t.name} (copy)`, isDefault: false }) },
                    { label: "Delete", icon: Trash2, onSelect: () => void remove(t), tone: "danger" as const, separator: true },
                  ]}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No templates yet">Create one to reuse it when you ask for reviews or reply.</EmptyState>
        )}
      </Card>

      <TemplateDialog draft={editing} vars={vars} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />
    </div>
  );
}

function TemplateDialog({ draft: initial, vars, onClose, onSaved }: { draft: Draft | null; vars: typeof SAMPLE_VARS; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft | null>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const lastField = useRef<"subject" | "body">("body");

  useEffect(() => {
    setD(initial);
    setError(null);
  }, [initial]);
  if (!d) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => (x ? { ...x, [k]: v } : x));
  const fields = TEMPLATE_FIELDS.filter((f) => f.kinds.includes(d.kind));
  const insert = (token: string) => {
    const el = lastField.current === "subject" && d.kind === "request_email" ? subjectRef.current : bodyRef.current;
    const key = el === subjectRef.current ? "subject" : "body";
    const value = d[key];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    set(key, value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await saveTemplate(d.id, { kind: d.kind, name: d.name, subject: d.kind === "request_email" ? d.subject : null, body: d.body, isDefault: d.isDefault, ratings: d.ratings });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    toast.success(d.id ? "Template saved" : "Template created");
    onSaved();
    onClose();
  };

  const preview = mergeTemplate(d.body, vars);
  const Icon = KIND_ICON[d.kind];

  return (
    <Modal open onClose={() => !saving && onClose()} title={d.id ? "Edit template" : "New template"} className="h-auto max-h-[94dvh] sm:max-w-4xl">
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[1fr_340px]">
          <div className="space-y-4 p-5">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Icon className="h-3.5 w-3.5" /> {kindInfo(d.kind).label}
            </p>
            <label className="block space-y-1.5">
              <span className="label-caps block">Template name</span>
              <input value={d.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder="e.g. Friendly ask" className={inputClass} autoFocus={!d.id} />
            </label>
            {d.kind === "request_email" && (
              <label className="block space-y-1.5">
                <span className="label-caps block">Subject</span>
                <input ref={subjectRef} value={d.subject} onFocus={() => (lastField.current = "subject")} onChange={(e) => set("subject", e.target.value)} maxLength={200} className={inputClass} />
              </label>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="label-caps">Message</span>
                {d.kind === "request_sms" && (
                  <span className={cn("text-xs tabular-nums", preview.length > SMS_MAX ? "font-semibold text-destructive" : "text-muted-foreground")}>
                    {preview.length}/{SMS_MAX} · {Math.max(1, Math.ceil(preview.length / 160))} SMS
                  </span>
                )}
              </div>
              <textarea
                ref={bodyRef}
                value={d.body}
                onFocus={() => (lastField.current = "body")}
                onChange={(e) => set("body", e.target.value)}
                rows={d.kind === "request_email" ? 9 : 5}
                maxLength={5000}
                className={cn(inputClass, "resize-y font-normal leading-relaxed")}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Insert:</span>
                {fields.map((f) => (
                  <button key={f.token} type="button" onClick={() => insert(f.token)} className="rounded-md border bg-card px-2 py-0.5 text-xs font-medium hover:border-primary/40 hover:bg-accent hover:text-accent-foreground" title={f.token}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {d.kind === "reply" && (
              <div className="space-y-1.5">
                <span className="label-caps block">Suggest for</span>
                <div className="flex flex-wrap gap-1.5">
                  {([1, 2, 3, 4, 5] as StarRating[]).map((r) => {
                    const on = d.ratings.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set("ratings", on ? d.ratings.filter((x) => x !== r) : [...d.ratings, r])}
                        className={cn("inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-sm font-medium", on ? "border-warning/40 bg-warning/10 text-warning" : "text-muted-foreground hover:bg-muted")}
                      >
                        {r} <Star className={cn("h-3.5 w-3.5", on && "fill-current")} />
                      </button>
                    );
                  })}
                </div>
                <span className="block text-xs text-muted-foreground">None picked = any rating.</span>
              </div>
            )}
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <span className="text-sm">
                <span className="block font-medium">Use as default</span>
                <span className="block text-xs text-muted-foreground">{d.kind === "reply" ? "Suggested first for the ratings above" : "Picked first when you request a review"}</span>
              </span>
              <Switch checked={d.isDefault} onChange={(v) => set("isDefault", v)} label="Use as default" />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {/* Live preview with sample data */}
          <aside className="space-y-2 border-t bg-muted/30 p-5 md:border-l md:border-t-0">
            <p className="label-caps">Preview</p>
            {d.kind === "request_email" ? (
              <div className="overflow-hidden rounded-xl border bg-card text-sm shadow-sm">
                <div className="space-y-0.5 border-b px-3.5 py-2.5 text-xs">
                  <p>
                    <span className="text-muted-foreground">From </span>
                    <span className="font-medium">{vars.business}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">To </span>
                    {vars.name}
                  </p>
                  <p className="pt-1 text-sm font-semibold">{mergeTemplate(d.subject, vars) || "No subject"}</p>
                </div>
                <PreviewText text={preview} />
              </div>
            ) : d.kind === "request_sms" ? (
              <div className="rounded-xl border bg-card p-3 shadow-sm">
                <p className="mb-2 text-center text-[11px] text-muted-foreground">Text message</p>
                <div className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground">{preview || "…"}</div>
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border bg-card p-3.5 text-sm shadow-sm">
                <p className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold">{vars.name}</span>
                  <span className="inline-flex text-warning">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} className="h-3 w-3 fill-current" />
                    ))}
                  </span>
                </p>
                <div className="border-l-2 border-primary/40 pl-2.5">
                  <p className="text-[11px] font-semibold">Response from the owner</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{preview || "…"}</p>
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Sample customer &ldquo;{vars.name}&rdquo;. Merge fields are filled in for each customer.</p>
          </aside>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={buttonClass()} disabled={saving || !d.name.trim() || !d.body.trim()}>
            {saving && <Loader2 className="animate-spin" />} {d.id ? "Save template" : "Create template"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Email body with the review link shown as a button, like the real email. */
function PreviewText({ text }: { text: string }) {
  const link = SAMPLE_VARS.link!;
  return (
    <div className="space-y-2 whitespace-pre-wrap px-3.5 py-3 text-sm">
      {text.split(link).map((part, i, all) => (
        <span key={i}>
          {part}
          {i < all.length - 1 && <span className="my-1 inline-block rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Leave a Google review</span>}
        </span>
      ))}
    </div>
  );
}
