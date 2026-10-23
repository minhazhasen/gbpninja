"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import { Check, Copy, Crown, Link2, Loader2, MapPin, MoreHorizontal, Pencil, Search, Send, ShieldCheck, Trash2, UserPlus, UserRound, X } from "lucide-react";
import { Card, PageHeader, PanelHeader, StatStrip, buttonClass, inputClass } from "@/components/ui";
import { Menu, Modal, useConfirm } from "@/components/ui-client";
import { ReviewAvatar } from "@/components/reviews/review-bits";
import { inviteMember, removeMember, resendInvite, updateMemberAccess } from "@/app/(app)/actions";
import type { Member, MemberRole } from "@/lib/gbp/types";
import { cn } from "@/lib/utils";

type Loc = { id: string; title: string };
const ago = (iso?: string | null) => (iso ? formatDistanceToNow(parseISO(iso), { addSuffix: true }) : "—");
const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;
const displayName = (m: Member) => m.name || m.email.split("@")[0];

const ROLE_INFO: Record<MemberRole, { label: string; icon: React.ElementType; summary: string; can: string[] }> = {
  admin: {
    label: "Admin",
    icon: Crown,
    summary: "Full access, including Settings, connected accounts and users.",
    can: ["Everything a user can do", "Connect Google, Facebook, Instagram, LinkedIn, X", "Invite and remove users, change access", "All locations"],
  },
  member: {
    label: "User",
    icon: UserRound,
    summary: "Day-to-day work on the locations you give them.",
    can: ["Reply to reviews and request reviews", "Create and schedule posts", "View performance and run the profile audit", "Only their assigned locations"],
  },
};

type Filter = "all" | "admin" | "member" | "invited";

export function UsersBoard({ members, meId, isAdmin, locations }: { members: Member[]; meId: string; isAdmin: boolean; locations: Loc[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  const active = members.filter((m) => m.status === "active");
  const counts: Record<Filter, number> = {
    all: members.length,
    admin: members.filter((m) => m.role === "admin").length,
    member: members.filter((m) => m.role === "member").length,
    invited: members.filter((m) => m.status === "invited").length,
  };
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return members
      .filter((m) => (filter === "all" ? true : filter === "invited" ? m.status === "invited" : m.role === filter))
      .filter((m) => !s || [m.name, m.email].some((v) => v.toLowerCase().includes(s)))
      .sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.status !== b.status ? (a.status === "active" ? -1 : 1) : displayName(a).localeCompare(displayName(b))));
  }, [members, filter, q, meId]);

  const access = (m: Member) =>
    m.role === "admin" || !m.locationIds.length
      ? "All locations"
      : m.locationIds.length === 1
        ? (locations.find((l) => l.id === m.locationIds[0])?.title ?? "1 location")
        : `${m.locationIds.length} locations`;
  const accessTitle = (m: Member) =>
    m.role === "admin" || !m.locationIds.length ? undefined : m.locationIds.map((id) => locations.find((l) => l.id === id)?.title ?? id).join(", ");

  const copyLink = (token?: string | null) =>
    token &&
    navigator.clipboard.writeText(inviteUrl(token)).then(
      () => toast.success("Invite link copied"),
      () => toast.error("Could not copy"),
    );

  const changeRole = async (m: Member, role: MemberRole) => {
    if (role === m.role) return;
    const res = await updateMemberAccess(m.id, { role });
    if (!res.ok) return void toast.error(res.error);
    toast.success(`${displayName(m)} is now ${role === "admin" ? "an admin" : "a user"}`);
    router.refresh();
  };

  const remove = async (m: Member) => {
    const ok = await confirm({
      title: m.status === "invited" ? `Cancel the invite for ${m.email}?` : `Remove ${displayName(m)}?`,
      description: m.status === "invited" ? "The invite link stops working." : "They lose access to this workspace right away. Reviews assigned to them stay assigned.",
      confirmLabel: m.status === "invited" ? "Cancel invite" : "Remove",
      tone: "danger",
    });
    if (!ok) return;
    const res = await removeMember(m.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success(m.status === "invited" ? "Invite cancelled" : "User removed");
    router.refresh();
  };

  const resend = async (m: Member) => {
    const res = await resendInvite(m.id);
    if (!res.ok) return void toast.error(res.error);
    copyLink(res.token);
    toast.success(`New invite link for ${m.email}`, { description: "Copied — the old link no longer works." });
    router.refresh();
  };

  const roleBadge = (m: Member) => {
    const r = ROLE_INFO[m.role];
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
          m.role === "admin" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <r.icon className="h-3 w-3" />
        {r.label}
      </span>
    );
  };

  const rowMenu = (m: Member) =>
    isAdmin && (
      <Menu
        label="User actions"
        trigger={(p) => (
          <button type="button" {...p} className={buttonClass("ghost", "icon", "h-8 w-8")} aria-label={`Actions for ${displayName(m)}`}>
            <MoreHorizontal />
          </button>
        )}
        items={[
          { label: "Edit access", icon: Pencil, onSelect: () => setEditing(m) },
          ...(m.status === "invited"
            ? [
                { label: "Copy invite link", icon: Link2, onSelect: () => void copyLink(m.inviteToken) },
                { label: "Resend invite", icon: Send, onSelect: () => void resend(m) },
              ]
            : []),
          ...(m.id !== meId
            ? [
                {
                  label: m.status === "invited" ? "Cancel invite" : "Remove from workspace",
                  icon: Trash2,
                  tone: "danger" as const,
                  separator: true,
                  onSelect: () => void remove(m),
                },
              ]
            : []),
        ]}
      />
    );

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "admin", label: "Admins" },
    { key: "member", label: "Users" },
    { key: "invited", label: "Pending invites" },
  ];

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Users"
        actions={
          isAdmin && (
            <button type="button" className={buttonClass("default", "sm", "h-9")} onClick={() => setInviteOpen(true)}>
              <UserPlus /> Invite users
            </button>
          )
        }
      >
        People who can access this workspace
      </PageHeader>

      <StatStrip
        items={[
          { label: "Active users", value: active.length, hint: `${counts.admin} admin${counts.admin === 1 ? "" : "s"}`, onClick: () => setFilter("all"), active: filter === "all" },
          { label: "Admins", value: counts.admin, hint: "Full access", onClick: () => setFilter("admin"), active: filter === "admin" },
          {
            label: "Users",
            value: counts.member,
            hint: `${members.filter((m) => m.role === "member" && m.locationIds.length).length} limited to some locations`,
            onClick: () => setFilter("member"),
            active: filter === "member",
          },
          {
            label: "Pending invites",
            value: counts.invited,
            hint: counts.invited ? "Waiting to accept" : "None",
            onClick: () => setFilter("invited"),
            active: filter === "invited",
          },
        ]}
      />

      {!isAdmin && <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">Only admins can invite people or change access.</p>}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Filter users" className="no-scrollbar -my-1 flex gap-1.5 overflow-x-auto py-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={filter === t.key}
                onClick={() => setFilter(t.key)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors",
                  filter === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.label}
                <span className={cn("text-xs tabular-nums", filter === t.key ? "text-primary-foreground/80" : "text-muted-foreground/70")}>{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search users" className={cn(inputClass, "h-9 py-1.5 pl-9")} />
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">No users match</p>
        ) : (
          <>
            {/* Phones */}
            <ul className="divide-y xl:hidden">
              {rows.map((m) => (
                <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                  <ReviewAvatar name={displayName(m)} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold">
                      {displayName(m)}
                      {m.id === meId && <span className="rounded bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">You</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {roleBadge(m)}
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {access(m)}
                      </span>
                      {m.status === "invited" && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">Invited</span>}
                    </div>
                  </div>
                  {rowMenu(m)}
                </li>
              ))}
            </ul>
            {/* Larger screens */}
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b text-left">
                  <tr>
                    {["User", "Role", "Location access", "Status", "Last active"].map((h, i) => (
                      <th key={h} className={cn("label-caps whitespace-nowrap px-3 py-2.5", i === 0 && "pl-5")}>
                        {h}
                      </th>
                    ))}
                    <th className="w-14" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/40">
                      <td className="py-3 pl-5 pr-3">
                        <div className="flex items-center gap-3">
                          <ReviewAvatar name={displayName(m)} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate font-semibold">
                              {displayName(m)}
                              {m.id === meId && <span className="rounded bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">You</span>}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">{isAdmin && m.id !== meId ? <RoleSelect value={m.role} onChange={(r) => changeRole(m, r)} /> : roleBadge(m)}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          disabled={!isAdmin || m.role === "admin"}
                          onClick={() => setEditing(m)}
                          title={accessTitle(m)}
                          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-muted disabled:hover:bg-transparent"
                        >
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          {access(m)}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {m.status === "invited" ? (
                          <span className="flex flex-col">
                            <span className="w-fit rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">Invited</span>
                            <span className="mt-0.5 text-muted-foreground">
                              {ago(m.invitedAt)}
                              {m.invitedBy ? ` by ${m.invitedBy}` : ""}
                            </span>
                          </span>
                        ) : (
                          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">Active</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{m.status === "active" ? ago(m.lastActiveAt) : "—"}</td>
                      <td className="pr-3 text-right">{rowMenu(m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* What each role can do */}
      <Card className="overflow-hidden">
        <PanelHeader title="Roles" meta="what each can do" />
        <div className="grid gap-px bg-border sm:grid-cols-2">
          {(Object.keys(ROLE_INFO) as MemberRole[]).map((r) => {
            const info = ROLE_INFO[r];
            return (
              <div key={r} className="bg-card p-5 lg:p-6">
                <p className="flex items-center gap-2 font-semibold">
                  <span
                    className={cn("flex h-8 w-8 items-center justify-center rounded-lg", r === "admin" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}
                  >
                    <info.icon className="h-4 w-4" />
                  </span>
                  {info.label}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{info.summary}</p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {info.can.map((c) => (
                    <li key={c} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} locations={locations} onDone={() => router.refresh()} />
      <AccessDialog member={editing} onClose={() => setEditing(null)} locations={locations} isSelf={editing?.id === meId} onDone={() => router.refresh()} />
      {dialog}
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: MemberRole; onChange: (r: MemberRole) => void }) {
  return (
    <label className="relative inline-flex">
      <select
        aria-label="Role"
        value={value}
        onChange={(e) => onChange(e.target.value as MemberRole)}
        className="h-8 appearance-none rounded-lg border border-input bg-card pl-2.5 pr-7 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="admin">Admin</option>
        <option value="member">User</option>
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">▾</span>
    </label>
  );
}

/** Role picker cards + location access, shared by invite and edit. */
function AccessFields({
  role,
  setRole,
  all,
  setAll,
  picked,
  setPicked,
  locations,
  roleLocked,
}: {
  role: MemberRole;
  setRole: (r: MemberRole) => void;
  all: boolean;
  setAll: (v: boolean) => void;
  picked: Set<string>;
  setPicked: (s: Set<string>) => void;
  locations: Loc[];
  roleLocked?: boolean;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <span className="label-caps block">Access level</span>
        <div role="radiogroup" aria-label="Access level" className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(ROLE_INFO) as MemberRole[]).map((r) => {
            const info = ROLE_INFO[r];
            const on = role === r;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={roleLocked && !on}
                onClick={() => setRole(r)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-50",
                  on ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/40",
                )}
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  <info.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{info.label === "User" ? "User access" : "Admin access"}</span>
                  <span className="block text-xs text-muted-foreground">{info.summary}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {role === "member" && (
        <div className="space-y-1.5">
          <span className="label-caps block">Location access</span>
          <div className="space-y-1 rounded-xl border p-1.5">
            <button
              type="button"
              role="radio"
              aria-checked={all}
              onClick={() => setAll(true)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
            >
              <Dot on={all} round /> <span className="font-medium">All locations</span>
              <span className="ml-auto text-xs text-muted-foreground">including ones added later</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!all}
              onClick={() => setAll(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
            >
              <Dot on={!all} round /> <span className="font-medium">Only selected locations</span>
            </button>
            {!all && (
              <ul className="ml-7 space-y-0.5 border-l pl-2">
                {locations.map((l) => {
                  const on = picked.has(l.id);
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => {
                          const n = new Set(picked);
                          if (on) n.delete(l.id);
                          else n.add(l.id);
                          setPicked(n);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <Dot on={on} /> {l.title}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Dot({ on, round }: { on: boolean; round?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center border",
        round ? "rounded-full" : "rounded",
        on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
      )}
    >
      {on && (round ? <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" /> : <Check className="h-3 w-3" strokeWidth={3} />)}
    </span>
  );
}

function InviteDialog({ open, onClose, locations, onDone }: { open: boolean; onClose: () => void; locations: Loc[]; onDone: () => void }) {
  const [emails, setEmails] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<{ email: string; token: string }[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmails("");
    setName("");
    setRole("member");
    setAll(true);
    setPicked(new Set());
    setLinks(null);
  }, [open]);

  const list = emails.split(/[\s,;]+/).filter(Boolean);
  const submit = async () => {
    setBusy(true);
    const res = await inviteMember({ emails, name, role, allLocations: all, locationIds: [...picked] });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.links && res.links.length > 1 ? `${res.links.length} invites created` : "Invite created");
    setLinks(res.links ?? []);
    onDone();
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      labelledBy="invite-title"
      className="h-[100dvh] max-w-lg sm:h-auto sm:max-h-[92dvh]"
      title={<span id="invite-title">{links ? "Invites ready" : "Invite users"}</span>}
    >
      {links ? (
        <>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
            <p className="text-sm text-muted-foreground">
              Email sending isn&apos;t set up yet, so share each link with the person. Links work once and can be cancelled from the user list.
            </p>
            <ul className="divide-y rounded-xl border">
              {links.map((l) => (
                <li key={l.email} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{l.email}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{inviteUrl(l.token)}</span>
                  </span>
                  <button
                    type="button"
                    className={buttonClass("outline", "sm", "h-8 shrink-0")}
                    onClick={() =>
                      navigator.clipboard.writeText(inviteUrl(l.token)).then(
                        () => toast.success("Copied"),
                        () => toast.error("Could not copy"),
                      )
                    }
                  >
                    <Copy /> Copy
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <button type="button" className={buttonClass("outline")} onClick={() => setLinks(null)}>
              Invite more
            </button>
            <button type="button" className={buttonClass()} onClick={onClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <div className="space-y-1.5">
              <label htmlFor="inv-emails" className="label-caps block">
                Email addresses
              </label>
              <textarea
                id="inv-emails"
                rows={2}
                autoFocus
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="jane@company.com, alex@company.com"
                className={inputClass}
              />
              <p className="text-xs text-muted-foreground">Separate several addresses with commas.</p>
            </div>
            {list.length <= 1 && (
              <div className="space-y-1.5">
                <label htmlFor="inv-name" className="label-caps block">
                  Name <span className="normal-case tracking-normal text-muted-foreground/70">(optional)</span>
                </label>
                <input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" className={inputClass} maxLength={120} />
              </div>
            )}
            <AccessFields role={role} setRole={setRole} all={all} setAll={setAll} picked={picked} setPicked={setPicked} locations={locations} />
          </div>
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={buttonClass()} onClick={submit} disabled={busy || !list.length || (role === "member" && !all && !picked.size)}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />}
              {list.length > 1 ? `Invite ${list.length} people` : "Send invite"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function AccessDialog({ member, onClose, locations, isSelf, onDone }: { member: Member | null; onClose: () => void; locations: Loc[]; isSelf: boolean; onDone: () => void }) {
  const [role, setRole] = useState<MemberRole>("member");
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!member) return;
    setRole(member.role);
    setAll(!member.locationIds.length);
    setPicked(new Set(member.locationIds));
  }, [member]);

  if (!member) return null;
  const save = async () => {
    setBusy(true);
    const res = await updateMemberAccess(member.id, { role, allLocations: all, locationIds: [...picked] });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Access updated");
    onDone();
    onClose();
  };

  return (
    <Modal
      open={!!member}
      onClose={() => !busy && onClose()}
      labelledBy="access-title"
      className="h-[100dvh] max-w-lg sm:h-auto sm:max-h-[92dvh]"
      title={
        <span id="access-title" className="truncate">
          Access for {displayName(member)}
        </span>
      }
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
          <ReviewAvatar name={displayName(member)} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{displayName(member)}</p>
            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          </div>
          {member.status === "invited" && <span className="ml-auto rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">Invited</span>}
        </div>
        <AccessFields role={role} setRole={setRole} all={all} setAll={setAll} picked={picked} setPicked={setPicked} locations={locations} roleLocked={isSelf} />
        {isSelf && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> You can&apos;t change your own access level.
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={busy}>
          <X /> Cancel
        </button>
        <button type="button" className={buttonClass()} onClick={save} disabled={busy || (role === "member" && !all && !picked.size)}>
          {busy && <Loader2 className="animate-spin" />} Save access
        </button>
      </div>
    </Modal>
  );
}
