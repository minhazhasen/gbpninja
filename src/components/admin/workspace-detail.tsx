"use client";

// One workspace: status, activity + performance (children), profiles, members, internal notes and its admin history.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import { ArrowUpRight, ListTodo, Loader2, MoreHorizontal, Pause, Play, Trash2 } from "lucide-react";
import { Avatar, Badge, Card, PageHeader, PanelHeader, buttonClass, inputClass } from "@/components/ui";
import { Menu, useConfirm } from "@/components/ui-client";
import { createLinkedTask, deleteWorkspace, saveWorkspaceNotes, setWorkspaceStatus } from "@/app/admin/actions";
import type { AdminLogEntry, Workspace } from "@/lib/platform/types";
import { WORKSPACE_STATUS } from "@/lib/platform/types";

type Result = { ok: true; message?: string } | { ok: false; error: string };

export function WorkspaceDetail({
  workspace: w,
  history,
  hideProfiles,
  children,
}: {
  workspace: Workspace;
  history: AdminLogEntry[];
  /** The insights panel already lists the profiles. */
  hideProfiles?: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState(w.notes ?? "");
  const status = WORKSPACE_STATUS[w.status];

  const run = async (key: string, fn: () => Promise<Result>, ok: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success(ok);
    router.refresh();
  };

  const suspend = async () => {
    if (w.status === "suspended") return run("status", () => setWorkspaceStatus(w.id, "active"), "Workspace reactivated");
    const ok = await confirm({
      title: `Suspend ${w.name}?`,
      description: "Its members can't sign in, and posts stop publishing until it's reactivated. Nothing is deleted.",
      confirmLabel: "Suspend",
      tone: "danger",
    });
    if (ok) run("status", () => setWorkspaceStatus(w.id, "suspended"), "Workspace suspended");
  };
  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${w.name}?`,
      description: "Its profiles, members and history are removed for good. This can't be undone.",
      confirmLabel: "Delete workspace",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("delete");
    const res = await deleteWorkspace(w.id);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Workspace deleted");
    router.push("/admin/workspaces");
  };

  const addTask = async () => {
    const res = await createLinkedTask("workspace", w.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Task added", { action: { label: "Open", onClick: () => router.push(`/admin/tasks?task=${res.id}`) } });
    router.refresh();
  };

  const ago = (iso: string | null | undefined) => (iso ? formatDistanceToNow(parseISO(iso), { addSuffix: true }) : "Never");

  return (
    <>
      {dialog}
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {w.name}
            <Badge variant={status.variant} pill>
              {status.label}
            </Badge>
            {w.current && (
              <Badge variant="default" pill>
                This app
              </Badge>
            )}
          </span>
        }
        actions={
          <>
            {w.current && (
              <Link href="/dashboard" className={buttonClass("outline", "sm")}>
                <ArrowUpRight /> Open app
              </Link>
            )}
            <Menu
              label="Workspace actions"
              trigger={(p) => (
                <button type="button" {...p} className={buttonClass("outline", "icon", "h-8 w-8")} aria-label="Workspace actions">
                  {busy && busy !== "notes" ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                </button>
              )}
              items={[
                { label: "Add task", icon: ListTodo, onSelect: addTask },
                {
                  label: w.status === "suspended" ? "Reactivate" : "Suspend",
                  icon: w.status === "suspended" ? Play : Pause,
                  onSelect: suspend,
                  tone: w.status === "suspended" ? undefined : "danger",
                },
                ...(w.current
                  ? []
                  : [
                      {
                        label: "Delete workspace",
                        icon: Trash2,
                        onSelect: remove,
                        tone: "danger" as const,
                        separator: true,
                      },
                    ]),
              ]}
            />
          </>
        }
      >
        {w.ownerName} · {w.ownerEmail}
      </PageHeader>

      <Card className="grid grid-cols-2 overflow-hidden lg:grid-cols-3">
        {[
          { label: "Profiles", value: w.profiles.length, hint: undefined },
          { label: "Users", value: w.members.filter((m) => m.status === "active").length, hint: undefined },
          {
            label: "Created",
            value: format(parseISO(w.createdAt), "d MMM yyyy"),
            hint: `Last active ${ago(w.lastActiveAt)}`,
          },
        ].map((s, i) => (
          <div
            key={s.label}
            className={`flex min-w-0 flex-col gap-1 px-4 py-4 sm:px-5 lg:px-6 ${i % 2 === 1 ? "border-l" : ""} ${i >= 2 ? "border-t lg:border-t-0" : ""} ${i >= 1 ? "lg:border-l" : ""} ${i === 2 ? "col-span-2 lg:col-span-1" : ""}`}
          >
            <span className="label-caps truncate">{s.label}</span>
            <span className="truncate text-xl font-semibold tabular-nums">{s.value}</span>
            {s.hint && (
              <span className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
                {s.hint}
              </span>
            )}
          </div>
        ))}
      </Card>

      {children}

      {!hideProfiles && (
        <Card className="overflow-hidden">
          <PanelHeader title="Profiles" meta={w.profiles.length || undefined} />
          <ul className="divide-y">
            {w.profiles.map((p) => (
              <li key={p.id} className="px-5 py-3 lg:px-6">
                <p className="truncate text-sm font-semibold">{p.title}</p>
                <p className="truncate text-xs text-muted-foreground">{p.address}</p>
              </li>
            ))}
          </ul>
          {!w.profiles.length && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No profiles connected yet.</p>}
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <PanelHeader title="Members" meta={w.members.length} />
          <ul className="divide-y">
            {w.members.map((m) => (
              <li key={m.email} className="flex items-center gap-3 px-5 py-2.5 lg:px-6">
                <Avatar name={m.name || m.email} className="h-8 w-8" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{m.name || m.email}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                </span>
                {m.status === "invited" ? (
                  <Badge variant="warning" pill>
                    Invited
                  </Badge>
                ) : (
                  <span className="hidden text-xs text-muted-foreground sm:inline" suppressHydrationWarning>
                    {ago(m.lastActiveAt)}
                  </span>
                )}
                <Badge variant={m.role === "admin" ? "default" : "secondary"} pill>
                  {m.role === "admin" ? "Admin" : "Member"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <PanelHeader title="Internal notes" meta="only platform admins see these" />
            <div className="space-y-3 p-5 lg:px-6">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="Billing, support history, special terms…"
                className={`${inputClass} resize-y`}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className={buttonClass("default", "sm")}
                  disabled={notes.trim() === (w.notes ?? "") || busy === "notes"}
                  onClick={() => run("notes", () => saveWorkspaceNotes(w.id, notes), "Notes saved")}
                >
                  {busy === "notes" && <Loader2 className="animate-spin" />} Save notes
                </button>
              </div>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <PanelHeader title="Admin history" />
            {history.length ? (
              <ul className="divide-y">
                {history.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-3 px-5 py-2.5 text-sm lg:px-6">
                    <span className="min-w-0 flex-1 truncate font-medium">{e.action}</span>
                    <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                      {ago(e.at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">No changes by platform admins yet.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
