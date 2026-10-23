// Workspaces (tenants). Every signed-in person works in exactly one workspace: the one they were invited to, or their own,
// created on first sign-in (they become its admin). A workspace's data (profiles, reviews, posts, tasks, team…) and its Google
// connections are never visible to another workspace.
//
// Storage (live mode): AppState "directory" (email → workspace id, workspace list) and one AppState document per workspace,
// "workspace:<id>". Google tokens are stored per workspace ("<id>:gbp", see google/oauth.ts). Demo mode keeps everything in
// memory: each signed-in demo user gets their own copy of the sample data.
import { randomBytes } from "node:crypto";
import { getSessionUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { emptyState, liveMode, seedState, type MockState } from "./mock";
import { loadDoc, saveDoc } from "./persist";
import { runInTenant, type TenantCtx } from "./tenant-context";
import type { Member } from "./types";

interface Directory {
  /** Signed-in email (lower case) → workspace id. A cache: membership in the workspace document is what counts. */
  users: Record<string, string>;
  workspaces: Record<string, { createdAt: string; owner: string }>;
  /** The old single shared workspace has been moved into its owner's workspace. */
  migrated?: boolean;
}

const g = globalThis as unknown as { __gbpnTenancy?: { dir: Directory | null; states: Map<string, MockState> } };
const mem = (g.__gbpnTenancy ??= { dir: null, states: new Map() });
const now = () => new Date().toISOString();
const newId = () => `w_${randomBytes(9).toString("base64url")}`;

function dir(): Directory {
  if (mem.dir) return mem.dir;
  mem.dir = (liveMode() && loadDoc<Directory>("directory")) || { users: {}, workspaces: {} };
  if (liveMode() && !mem.dir.migrated) migrateSharedWorkspace(mem.dir);
  return mem.dir;
}
const saveDir = () => liveMode() && saveDoc("directory", dir());

/** A workspace's state (loaded once, then kept in memory). */
function stateOf(id: string): MockState {
  let s = mem.states.get(id);
  if (!s) {
    s = liveMode() ? { ...emptyState(), ...(loadDoc<Partial<MockState>>(`workspace:${id}`) ?? {}) } : seedState();
    mem.states.set(id, s);
  }
  return s;
}

/** Persist a workspace after a provider call (live mode; saveDoc skips unchanged documents). */
export function saveTenant(t: TenantCtx) {
  if (liveMode()) saveDoc(`workspace:${t.id}`, t.state);
}

const memberOf = (s: MockState, email: string) => s.members.find((m) => m.email.toLowerCase() === email);

function createWorkspace(user: { uid: string; email: string; name?: string | null }): string {
  const id = newId();
  const email = user.email.toLowerCase();
  const s = liveMode() ? emptyState() : seedState();
  const me: Member = { id: `u_${user.uid}`, name: user.name ?? email.split("@")[0], email, role: "admin", status: "active", locationIds: [], joinedAt: now() };
  // Demo copies keep the sample team; the signed-in person is its first admin.
  s.members = liveMode() ? [me] : [me, ...s.members.filter((m) => m.email.toLowerCase() !== email)];
  mem.states.set(id, s);
  const d = dir();
  d.workspaces[id] = { createdAt: now(), owner: email };
  d.users[email] = id;
  saveDir();
  saveTenant({ id, state: s });
  return id;
}

/** The workspace for a signed-in email: where they're a member (or invited), else a new one of their own. */
export function workspaceIdFor(user: { uid: string; email: string; name?: string | null }): string {
  const email = user.email.toLowerCase();
  const d = dir();
  const cached = d.users[email];
  if (cached && d.workspaces[cached] && memberOf(stateOf(cached), email)) return cached;
  // Invited (or added) to someone's workspace since the last sign-in.
  for (const id of Object.keys(d.workspaces)) {
    if (memberOf(stateOf(id), email)) {
      d.users[email] = id;
      saveDir();
      return id;
    }
  }
  return createWorkspace(user);
}

/**
 * The workspace of the person making this request, or null for the open demo (no sign-in). Live mode without sign-in
 * configured (local development) uses one local workspace.
 */
export async function resolveTenant(): Promise<TenantCtx | null> {
  let user: Awaited<ReturnType<typeof getSessionUser>> = null;
  try {
    user = await getSessionUser();
  } catch {
    // Outside a request (scripts): no session.
  }
  if (user) {
    const id = workspaceIdFor(user);
    return { id, state: stateOf(id) };
  }
  if (!liveMode()) return null;
  const local = "w_local";
  if (!dir().workspaces[local]) {
    dir().workspaces[local] = { createdAt: now(), owner: "local" };
    saveDir();
  }
  return { id: local, state: stateOf(local) };
}

/** After accepting an invite: this email now works in that workspace (their own stays, unused). */
export function assignUserWorkspace(email: string, id: string) {
  if (!dir().workspaces[id]) throw new Error("Workspace not found");
  dir().users[email.toLowerCase()] = id;
  saveDir();
}

/** Run `fn` once per workspace (scheduled jobs, which have no signed-in person). */
export async function forEachWorkspace(fn: (t: TenantCtx) => Promise<void>) {
  for (const id of Object.keys(dir().workspaces)) {
    const t = { id, state: stateOf(id) };
    try {
      await runInTenant(t, () => fn(t));
    } finally {
      saveTenant(t);
    }
  }
}

/** The workspace holding an invite link's token (the invite page is opened before signing in). */
export function tenantForInvite(token: string): TenantCtx | null {
  for (const id of Object.keys(dir().workspaces)) {
    const s = stateOf(id);
    if (s.members.some((m) => m.status === "invited" && m.inviteToken === token)) return { id, state: s };
  }
  return null;
}

/** All workspaces (platform admin). */
export function listTenants() {
  const d = dir();
  return Object.entries(d.workspaces).map(([id, w]) => ({ id, ...w, state: stateOf(id) }));
}

/**
 * Before workspaces existed, live mode kept one shared document ("workspace") and one Google token per purpose. Move them
 * into a workspace owned by its first member. People who were let in without an invite (e.g. platform admins) are not
 * carried over: they get their own workspace on their next sign-in.
 */
function migrateSharedWorkspace(d: Directory) {
  const legacy = loadDoc<MockState>("workspace");
  d.migrated = true;
  if (legacy?.members?.length) {
    const id = newId();
    const [owner, ...rest] = legacy.members;
    legacy.members = [owner, ...rest.filter((m) => m.invitedAt || m.inviteToken)];
    d.workspaces[id] = { createdAt: owner.joinedAt ?? now(), owner: owner.email.toLowerCase() };
    for (const m of legacy.members) d.users[m.email.toLowerCase()] = id;
    saveDoc(`workspace:${id}`, legacy);
    try {
      db.exec(`UPDATE "GoogleToken" SET "purpose" = '${id}:' || "purpose" WHERE "purpose" IN ('gbp', 'gmail')`);
    } catch (e) {
      console.error("[tenancy] Could not move Google tokens:", e);
    }
  }
  saveDoc("directory", d);
}
