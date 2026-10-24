"use client";

// Admin → Team: the people running the platform. Admins manage the team; staff work on workspaces, offers, meetings, issues and tasks.
// They sign in to the app with this email (Google or email + password) and open Platform admin from the account menu.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import { Loader2, Lock, MoreHorizontal, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { Avatar, Badge, Card, PanelHeader, buttonClass, inputClass } from "@/components/ui";
import { Menu, Modal, Segmented, useConfirm } from "@/components/ui-client";
import { addTeamMember, removeTeamMember, updateTeamMember } from "@/app/admin/actions";
import { TEAM_ROLES, type PlatformTeamMember, type TeamRole } from "@/lib/platform/types";

export function TeamBoard({ team, me, openTasks }: { team: PlatformTeamMember[]; me: PlatformTeamMember | null; openTasks: Record<string, number> }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [adding, setAdding] = useState(false);
  const canManage = me?.role === "admin";

  const setRole = async (m: PlatformTeamMember, role: TeamRole) => {
    const res = await updateTeamMember(m.id, { name: m.name, role });
    if (!res.ok) return void toast.error(res.error);
    toast.success(`${m.name} is now ${TEAM_ROLES[role].label.toLowerCase()}`);
    router.refresh();
  };
  const remove = async (m: PlatformTeamMember) => {
    const ok = await confirm({
      title: `Remove ${m.name}?`,
      description: "They lose access to the admin panel. Their tasks and issues become unassigned. Their own workspace in the app isn't touched.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    const res = await removeTeamMember(m.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`${m.name} removed`);
    router.refresh();
  };

  return (
    <>
      {dialog}
      <Card className="overflow-hidden">
        <PanelHeader
          title="Team"
          meta={team.length}
          action={
            canManage && (
              <button type="button" className={buttonClass("default", "sm")} onClick={() => setAdding(true)}>
                <Plus /> Add person
              </button>
            )
          }
        />
        <ul className="divide-y">
          {team.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5 lg:px-6">
              <Avatar name={m.name || m.email} className="h-9 w-9" />
              <span className="min-w-0 flex-1 basis-48">
                <span className="flex items-center gap-2 truncate text-sm font-semibold">
                  {m.name}
                  {m.id === me?.id && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                </span>
                <span className="block truncate text-xs text-muted-foreground" suppressHydrationWarning>
                  {m.email} · {m.lastActiveAt ? `active ${formatDistanceToNow(parseISO(m.lastActiveAt), { addSuffix: true })}` : "hasn't signed in yet"}
                </span>
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {openTasks[m.id] ?? 0} open task{openTasks[m.id] === 1 ? "" : "s"}
              </span>
              {m.fromEnv && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Listed in PLATFORM_ADMIN_EMAILS on the server">
                  <Lock className="h-3.5 w-3.5" /> Server
                </span>
              )}
              <Badge variant={m.role === "admin" ? "default" : "secondary"} pill>
                {TEAM_ROLES[m.role].label}
              </Badge>
              {canManage && !m.fromEnv && m.id !== me?.id ? (
                <Menu
                  label="Team member actions"
                  trigger={(p) => (
                    <button type="button" {...p} className={buttonClass("ghost", "icon", "h-8 w-8 text-muted-foreground")} aria-label="Team member actions">
                      <MoreHorizontal />
                    </button>
                  )}
                  items={[
                    m.role === "admin"
                      ? { label: "Make staff", icon: UserRound, onSelect: () => setRole(m, "staff") }
                      : { label: "Make admin", icon: ShieldCheck, onSelect: () => setRole(m, "admin") },
                    { label: "Remove", icon: Trash2, onSelect: () => remove(m), tone: "danger", separator: true },
                  ]}
                />
              ) : (
                <span className="h-8 w-8" aria-hidden />
              )}
            </li>
          ))}
        </ul>
        <p className="border-t px-5 py-3 text-xs text-muted-foreground lg:px-6">
          People sign in to the app with this email (Google or email + password), then open <b>Platform admin</b> from the account menu.{" "}
          {!canManage && "Only admins can add or remove people."}
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(TEAM_ROLES) as TeamRole[]).map((r) => (
          <Card key={r} className="flex items-start gap-3 p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">{r === "admin" ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}</span>
            <span>
              <span className="block text-sm font-semibold">{TEAM_ROLES[r].label}</span>
              <span className="block text-xs text-muted-foreground">{TEAM_ROLES[r].hint}</span>
            </span>
          </Card>
        ))}
      </div>

      {adding && <AddPerson onClose={() => setAdding(false)} onAdded={() => router.refresh()} />}
    </>
  );
}

function AddPerson({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("staff");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await addTeamMember({ name, email, role });
    setSaving(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`${name || email} added`, { description: "They get access when they sign in with this email." });
    onAdded();
    onClose();
  };
  return (
    <Modal open onClose={() => !saving && onClose()} title="Add a team member" className="h-auto sm:max-w-md">
      <form onSubmit={submit} className="flex flex-col">
        <div className="space-y-4 p-5">
          <label className="block space-y-1.5">
            <span className="label-caps block">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputClass} placeholder="Alex Morgan" autoFocus />
          </label>
          <label className="block space-y-1.5">
            <span className="label-caps block">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="alex@yourcompany.com" />
            <span className="block text-xs text-muted-foreground">The email they sign in to the app with.</span>
          </label>
          <div className="space-y-1.5">
            <span className="label-caps block">Role</span>
            <Segmented
              label="Role"
              value={role}
              onChange={setRole}
              options={(Object.keys(TEAM_ROLES) as TeamRole[]).map((r) => ({ value: r, label: TEAM_ROLES[r].label }))}
            />
            <span className="block text-xs text-muted-foreground">{TEAM_ROLES[role].hint}.</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={buttonClass()} disabled={saving || !email.trim()}>
            {saving && <Loader2 className="animate-spin" />} Add
          </button>
        </div>
      </form>
    </Modal>
  );
}
