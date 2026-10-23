"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import { Loader2, Megaphone, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { ANNOUNCEMENT_TONE, AnnouncementBanner } from "@/components/announcement-banner";
import { Badge, Card, EmptyState, PanelHeader, buttonClass, inputClass } from "@/components/ui";
import { Menu, Modal, Segmented, Switch, useConfirm } from "@/components/ui-client";
import { deleteAnnouncement, saveAnnouncement } from "@/app/admin/actions";
import type { Announcement, AnnouncementTone } from "@/lib/platform/types";

type Draft = {
  id: string | null;
  message: string;
  tone: AnnouncementTone;
  href: string;
  active: boolean;
};

export function AnnouncementsBoard({ announcements }: { announcements: Announcement[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const live = announcements.find((a) => a.active);

  const toggle = async (a: Announcement) => {
    const res = await saveAnnouncement(a.id, {
      message: a.message,
      tone: a.tone,
      href: a.href ?? "",
      active: !a.active,
    });
    if (!res.ok) return void toast.error(res.error);
    toast.success(a.active ? "Announcement hidden" : "Announcement is live");
    router.refresh();
  };
  const remove = async (a: Announcement) => {
    if (
      !(await confirm({
        title: "Delete this announcement?",
        confirmLabel: "Delete",
        tone: "danger",
      }))
    )
      return;
    const res = await deleteAnnouncement(a.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Announcement deleted");
    router.refresh();
  };

  return (
    <>
      {dialog}
      <Card className="overflow-hidden">
        <PanelHeader
          title="Announcements"
          meta={live ? "1 live" : "none live"}
          action={
            <button
              type="button"
              className={buttonClass("default", "sm")}
              onClick={() =>
                setDraft({
                  id: null,
                  message: "",
                  tone: "info",
                  href: "",
                  active: true,
                })
              }
            >
              <Plus /> New announcement
            </button>
          }
        />
        {announcements.length ? (
          <ul className="divide-y">
            {announcements.map((a) => {
              const t = ANNOUNCEMENT_TONE[a.tone];
              return (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3.5 lg:px-6">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.cls}`}>
                    <t.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{a.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground" suppressHydrationWarning>
                      {formatDistanceToNow(parseISO(a.createdAt), {
                        addSuffix: true,
                      })}{" "}
                      · {a.createdBy}
                      {a.href && <> · links to {new URL(a.href).hostname}</>}
                    </p>
                  </div>
                  {a.active && (
                    <Badge variant="success" pill>
                      Live
                    </Badge>
                  )}
                  <Switch checked={a.active} onChange={() => toggle(a)} label={a.active ? "Hide announcement" : "Show announcement"} />
                  <Menu
                    label="Announcement actions"
                    trigger={(p) => (
                      <button type="button" {...p} className={buttonClass("ghost", "icon", "-my-1 h-8 w-8 text-muted-foreground")} aria-label="Announcement actions">
                        <MoreHorizontal />
                      </button>
                    )}
                    items={[
                      {
                        label: "Edit",
                        icon: Pencil,
                        onSelect: () =>
                          setDraft({
                            id: a.id,
                            message: a.message,
                            tone: a.tone,
                            href: a.href ?? "",
                            active: a.active,
                          }),
                      },
                      {
                        label: "Delete",
                        icon: Trash2,
                        onSelect: () => remove(a),
                        tone: "danger",
                        separator: true,
                      },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No announcements">
            <span className="inline-flex items-center gap-1.5">
              <Megaphone className="h-4 w-4" /> Tell every workspace about maintenance or a new feature.
            </span>
          </EmptyState>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">One announcement is live at a time — turning one on hides the others. People can dismiss it; editing doesn&apos;t bring it back, a new one does.</p>
      {draft && <AnnouncementForm draft={draft} onClose={() => setDraft(null)} onSaved={() => router.refresh()} />}
    </>
  );
}

function AnnouncementForm({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(draft);
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { id, ...input } = d;
    const res = await saveAnnouncement(id, input);
    setSaving(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(id ? "Announcement saved" : d.active ? "Announcement is live" : "Announcement saved as hidden");
    onSaved();
    onClose();
  };
  return (
    <Modal open onClose={() => !saving && onClose()} title={d.id ? "Edit announcement" : "New announcement"} className="h-auto sm:max-w-lg">
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-4 p-5">
          <label className="block space-y-1.5">
            <span className="label-caps block">Message</span>
            <textarea
              value={d.message}
              onChange={(e) => setD({ ...d, message: e.target.value })}
              rows={3}
              maxLength={240}
              className={`${inputClass} resize-y`}
              placeholder="Scheduled maintenance on Sunday 02:00–03:00 UTC. Posts will publish afterwards."
              autoFocus
            />
            <span className="block text-right text-xs tabular-nums text-muted-foreground">{d.message.length}/240</span>
          </label>
          <div className="space-y-1.5">
            <span className="label-caps block">Style</span>
            <Segmented
              label="Style"
              value={d.tone}
              onChange={(tone) => setD({ ...d, tone })}
              options={(Object.keys(ANNOUNCEMENT_TONE) as AnnouncementTone[]).map((k) => ({ value: k, label: ANNOUNCEMENT_TONE[k].label }))}
            />
          </div>
          <label className="block space-y-1.5">
            <span className="label-caps block">Link (optional)</span>
            <input type="url" value={d.href} onChange={(e) => setD({ ...d, href: e.target.value })} placeholder="https://status.example.com" className={inputClass} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <span className="text-sm font-medium">Show in the app now</span>
            <Switch checked={d.active} onChange={(active) => setD({ ...d, active })} label="Show in the app now" />
          </label>
          {d.message.trim() && (
            <div className="space-y-1.5">
              <span className="label-caps block">Preview</span>
              <AnnouncementBanner
                announcement={{
                  id: "preview",
                  message: d.message,
                  tone: d.tone,
                  href: d.href || null,
                }}
                preview
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={buttonClass()} disabled={saving || !d.message.trim()}>
            {saving && <Loader2 className="animate-spin" />} {d.id ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
