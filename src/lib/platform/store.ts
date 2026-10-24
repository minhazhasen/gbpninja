// Platform data. Demo: in memory on globalThis (resets on restart). Live (GBP_DATA_SOURCE=google): one JSON document in SQLite
// (AppState "platform", saved every few seconds). The current workspace's profiles and members come live from the GBP provider,
// so changes made here show up in the app straight away.
import { getProvider } from "@/lib/gbp";
import { loadDoc, saveDoc } from "@/lib/gbp/persist";
import type { Task, TaskInput, TaskPatch } from "@/lib/gbp/types";
import { CHANNEL_LABEL, type Channel } from "@/lib/posts";
import { listTenants, resolveTenant } from "@/lib/gbp/tenancy";
import { currentTenant, runInTenant } from "@/lib/gbp/tenant-context";
import {
  type AdminLogEntry,
  type Announcement,
  type Issue,
  type IssueCategory,
  type LeadStatus,
  type Offer,
  type OfferLead,
  type PlatformTeamMember,
  type TeamRole,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceProfile,
  isUpcomingMeeting,
  MEETING_MINUTES,
} from "./types";

const CURRENT_ID = "ws_demo";

type StoredWorkspace = Omit<Workspace, "profiles" | "members"> & { profiles: WorkspaceProfile[]; members: WorkspaceMember[] };

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

function seedWorkspaces(): StoredWorkspace[] {
  const profiles = (list: [string, string][]): WorkspaceProfile[] => list.map(([title, address], i) => ({ id: `p_${title.toLowerCase().replace(/\W+/g, "_")}_${i}`, title, address }));
  const member = (name: string, email: string, role: "admin" | "member" = "member", lastActive = 1): WorkspaceMember => ({ name, email, role, status: "active", lastActiveAt: daysAgo(lastActive) });
  return [
    // Profiles and members of the current workspace are read from the provider (see hydrate()).
    {
      id: CURRENT_ID,
      name: "Demo workspace",
      ownerName: "Demo User",
      ownerEmail: "you@example.com",
      status: "active",
      createdAt: daysAgo(120),
      lastActiveAt: daysAgo(0),
      current: true,
      profiles: [],
      members: [],
    },
    {
      id: "ws_brightsmile",
      name: "Bright Smile Dental Group",
      ownerName: "Laura Chen",
      ownerEmail: "laura@brightsmile.example",
      status: "active",
      createdAt: daysAgo(310),
      lastActiveAt: daysAgo(0),
      profiles: profiles([
        ["Bright Smile Downtown", "12 Main St, Denver, CO"],
        ["Bright Smile Cherry Creek", "300 Fillmore St, Denver, CO"],
        ["Bright Smile Aurora", "15 E Colfax Ave, Aurora, CO"],
        ["Bright Smile Lakewood", "77 Wadsworth Blvd, Lakewood, CO"],
      ]),
      members: [member("Laura Chen", "laura@brightsmile.example", "admin", 0), member("Ravi Patel", "ravi@brightsmile.example"), member("Ana Gomez", "ana@brightsmile.example", "member", 3)],
    },
    {
      id: "ws_lakeside",
      name: "Lakeside Bakery",
      ownerName: "Mia Novak",
      ownerEmail: "mia@lakesidebakery.example",
      status: "active",
      createdAt: daysAgo(88),
      lastActiveAt: daysAgo(2),
      profiles: profiles([["Lakeside Bakery", "8 Shore Rd, Madison, WI"]]),
      members: [member("Mia Novak", "mia@lakesidebakery.example", "admin", 2)],
    },
    {
      id: "ws_urbanfit",
      name: "Urban Fit Co",
      ownerName: "Jordan Reyes",
      ownerEmail: "jordan@urbanfit.example",
      status: "active",
      createdAt: daysAgo(9),
      lastActiveAt: daysAgo(1),
      profiles: profiles([
        ["Urban Fit Midtown", "220 W 39th St, New York, NY"],
        ["Urban Fit Brooklyn", "45 Bedford Ave, Brooklyn, NY"],
      ]),
      members: [member("Jordan Reyes", "jordan@urbanfit.example", "admin", 1), member("Kim Park", "kim@urbanfit.example", "member", 4)],
    },
    {
      id: "ws_harbor",
      name: "Harbor Auto Repair",
      ownerName: "Sam Ortiz",
      ownerEmail: "sam@harborauto.example",
      status: "active",
      createdAt: daysAgo(40),
      lastActiveAt: daysAgo(12),
      profiles: profiles([["Harbor Auto Repair", "901 Harbor Blvd, San Diego, CA"]]),
      members: [member("Sam Ortiz", "sam@harborauto.example", "admin", 12)],
    },
    {
      id: "ws_northside",
      name: "Northside Vets",
      ownerName: "Priya Das",
      ownerEmail: "priya@northsidevets.example",
      status: "suspended",
      notes: "Card declined twice in September. Suspended until billing is updated.",
      createdAt: daysAgo(200),
      lastActiveAt: daysAgo(34),
      profiles: profiles([
        ["Northside Vets", "14 Elm St, Portland, OR"],
        ["Northside Vets East", "2 Burnside St, Portland, OR"],
      ]),
      members: [member("Priya Das", "priya@northsidevets.example", "admin", 34), member("Leo Fox", "leo@northsidevets.example", "member", 40)],
    },
  ];
}

function seedIssues(): Issue[] {
  const base = { reply: null, adminNote: null, assigneeId: null, resolvedAt: null };
  return [
    {
      ...base,
      id: "issue_1",
      workspaceId: "ws_brightsmile",
      workspaceName: "Bright Smile Dental Group",
      reporterName: "Ravi Patel",
      reporterEmail: "ravi@brightsmile.example",
      category: "data",
      subject: "Calls this week look too low",
      description: "The Performance page shows 3 calls for Cherry Creek this week, our phone system logged 20+ from Google.",
      page: "/performance",
      status: "open",
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
    {
      ...base,
      id: "issue_2",
      workspaceId: "ws_urbanfit",
      workspaceName: "Urban Fit Co",
      reporterName: "Jordan Reyes",
      reporterEmail: "jordan@urbanfit.example",
      category: "connection",
      subject: "Instagram won't connect",
      description: "After picking our Page the Instagram account list is empty.",
      page: "/settings?tab=accounts",
      status: "in_progress",
      assigneeId: "team_alex",
      createdAt: daysAgo(3),
      updatedAt: daysAgo(2),
    },
  ];
}

function seedTasks(): Task[] {
  const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
  return [
    {
      id: "ptask_1",
      title: "Look into missing calls for Bright Smile",
      description: "Compare Google's call numbers with what they see.",
      stage: "todo",
      priority: "high",
      assigneeId: "team_alex",
      dueDate: day(1),
      locationId: "ws_brightsmile",
      order: 0,
      source: { type: "platform", kind: "issue", refId: "issue_1", label: "Calls this week look too low", href: "/admin/issues?issue=issue_1" },
      createdAt: daysAgo(1),
    },
    { id: "ptask_2", title: "Write the Local SEO onboarding checklist", stage: "in_progress", priority: "medium", dueDate: day(4), locationId: null, order: 0, createdAt: daysAgo(5) },
  ];
}

interface PlatformState {
  workspaces: StoredWorkspace[];
  announcements: Announcement[];
  log: AdminLogEntry[];
  seq: number;
  offers?: Offer[];
  leads?: OfferLead[];
  /** When each workspace last closed each offer: `${workspaceId}|${offerId}` → ISO. */
  offerClosed?: Record<string, string>;
  /** When the platform team sent an offer to a workspace (it skips the new-account wait): `${workspaceId}|${offerId}` → ISO. */
  offerSent?: Record<string, string>;
  issues?: Issue[];
  team?: PlatformTeamMember[];
  /** The platform team's own tasks (same shape as workspace tasks; `locationId` = the workspace it's about). */
  tasks?: Task[];
}

const live = process.env.GBP_DATA_SOURCE === "google";
const g = globalThis as unknown as { __platformV1?: PlatformState };
const state: PlatformState = (g.__platformV1 ??= live
  ? // Live: saved in SQLite (AppState "platform"); a new install has just this workspace.
    (loadDoc<PlatformState>("platform") ?? {
      workspaces: [
        {
          id: CURRENT_ID,
          name: "My workspace",
          ownerName: "",
          ownerEmail: "",
          status: "active",
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          current: true,
          profiles: [],
          members: [],
        },
      ],
      announcements: [],
      log: [],
      seq: 10,
    })
  : {
      workspaces: seedWorkspaces(),
      announcements: [],
      log: [{ id: "log_1", at: daysAgo(3), actor: "platform", action: "Suspended workspace", target: "Northside Vets" }],
      seq: 10,
    });
// Live: save every few seconds when something changed (saveDoc skips unchanged state), and on shutdown.
const flush = () => saveDoc("platform", state);
const gs = globalThis as unknown as { __platformSaver?: boolean };
if (live && !gs.__platformSaver) {
  gs.__platformSaver = true;
  setInterval(flush, 3000).unref();
  process.once("beforeExit", flush);
  process.once("SIGTERM", () => (flush(), process.exit(0)));
}
const nextId = (prefix: string) => `${prefix}_${++state.seq}`;
// Added after the first release of this state: fill in without wiping the rest.
state.offers ??= [
  {
    id: "offer_seo",
    title: "Not getting calls from Google?",
    description: "Our team manages your Local SEO: profile, weekly posts, reviews and rankings, so more nearby customers call you.",
    price: "$299 / month",
    cta: "Get more calls",
    active: true,
    startAfterDays: 7,
    snoozeDays: 7,
    views: 0,
    clicks: 0,
    closes: 0,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  },
];
state.leads ??= [];
state.offerClosed ??= {};
state.offerSent ??= {};
state.issues ??= live ? [] : seedIssues();
state.team ??= live ? [] : [{ id: "team_alex", name: "Alex Morgan", email: "alex@gbpninja.example", role: "staff", createdAt: daysAgo(30), addedBy: null, lastActiveAt: daysAgo(1) }];
state.tasks ??= live ? [] : seedTasks();
// No plans or trials any more: older in-memory workspaces on "trial" become active.
for (const w of state.workspaces as { status: string }[]) if (w.status === "trial") w.status = "active";
// Older in-memory shapes (before counters / bookings / timing).
for (const o of state.offers) {
  o.views ??= 0;
  o.clicks ??= 0;
  o.closes ??= 0;
  o.startAfterDays ??= 7;
  o.snoozeDays ??= 7;
  o.views = Math.max(o.views, o.clicks);
}
for (const l of state.leads) {
  if (!["booked", "met", "won", "lost", "cancelled"].includes(l.status)) l.status = "booked";
  l.meetingAt ??= l.createdAt;
}

// ---------------------------------------------------------------- workspaces

/**
 * Real workspaces (tenancy.ts) get a row here the first time they're seen, so the admin can name, note and suspend them.
 * Records from before workspaces existed were filed under the fixed demo id: they move to the oldest real workspace.
 */
function syncTenantRows() {
  const tenants = listTenants().filter((t) => t.id !== "w_local" || live);
  for (const t of tenants) {
    if (state.workspaces.some((w) => w.id === t.id)) continue;
    const owner = t.state.members.find((m) => m.role === "admin" && m.status === "active");
    state.workspaces.push({
      id: t.id,
      name: t.state.locations[0]?.title || owner?.name || t.owner,
      ownerName: owner?.name ?? "",
      ownerEmail: owner?.email ?? t.owner,
      status: "active",
      createdAt: t.createdAt,
      lastActiveAt: null,
      profiles: [],
      members: [],
    });
  }
  const legacy = live && tenants.length ? state.workspaces.find((w) => w.id === CURRENT_ID) : undefined;
  if (legacy) {
    const heir = [...tenants].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0].id;
    for (const l of state.leads ?? []) if (l.workspaceId === CURRENT_ID) l.workspaceId = heir;
    for (const k of Object.keys(state.offerClosed ?? {}))
      if (k.startsWith(`${CURRENT_ID}|`)) {
        state.offerClosed![`${heir}|${k.slice(CURRENT_ID.length + 1)}`] = state.offerClosed![k];
        delete state.offerClosed![k];
      }
    state.workspaces = state.workspaces.filter((w) => w.id !== CURRENT_ID);
  }
}

/** Fill a workspace's profiles and members: real workspaces from their own data, the open demo from the provider. */
async function hydrate(w: StoredWorkspace): Promise<Workspace> {
  const tenant = listTenants().find((t) => t.id === w.id);
  if (tenant) {
    const s = tenant.state;
    const owner = s.members.find((m) => m.role === "admin" && m.status === "active");
    return {
      ...structuredClone(w),
      current: w.id === (await currentWorkspaceId()),
      ownerName: owner?.name || w.ownerName,
      ownerEmail: owner?.email || w.ownerEmail,
      lastActiveAt: s.members.map((m) => m.lastActiveAt ?? "").sort().pop() || w.lastActiveAt,
      profiles: s.locations.map((l): WorkspaceProfile => ({ id: l.id, title: l.title, address: l.address })),
      members: s.members.map((m) => ({ name: m.name, email: m.email, role: m.role, status: m.status, lastActiveAt: m.lastActiveAt ?? null })),
    };
  }
  if (!w.current) return structuredClone(w);
  const provider = await getProvider();
  const [locations, members] = await Promise.all([provider.listLocations(), provider.listMembers()]);
  const profiles = locations.map((l): WorkspaceProfile => ({ id: l.id, title: l.title, address: l.address }));
  const owner = members.find((m) => m.role === "admin" && m.status === "active");
  return {
    ...structuredClone(w),
    ownerName: owner?.name || w.ownerName,
    ownerEmail: owner?.email || w.ownerEmail,
    profiles,
    members: members.map((m) => ({ name: m.name, email: m.email, role: m.role, status: m.status, lastActiveAt: m.lastActiveAt ?? null })),
  };
}

const find = (id: string) => {
  const w = state.workspaces.find((x) => x.id === id);
  if (!w) throw new Error("Workspace not found");
  return w;
};

export const listWorkspaces = () => {
  syncTenantRows();
  return Promise.all(state.workspaces.map(hydrate));
};
export const getWorkspace = async (id: string) => {
  syncTenantRows();
  const w = state.workspaces.find((x) => x.id === id);
  return w ? hydrate(w) : null;
};
/** The signed-in person's workspace (the fixed demo workspace in the open demo). */
export async function currentWorkspaceId() {
  return (currentTenant() ?? (await resolveTenant()))?.id ?? CURRENT_ID;
}

export function updateWorkspace(id: string, patch: Partial<Pick<Workspace, "status" | "notes" | "name">>) {
  Object.assign(find(id), patch);
}

export function deleteWorkspace(id: string) {
  if (find(id).current) throw new Error("This app's own workspace can't be deleted");
  if (listTenants().some((t) => t.id === id)) throw new Error("A customer's workspace can't be deleted here yet. Suspend it instead.");
  state.workspaces = state.workspaces.filter((w) => w.id !== id);
}

// ---------------------------------------------------------------- announcements

export const listAnnouncements = async () => [...state.announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
/** The live banner, shown in the app. */
export const activeAnnouncement = async () => (await listAnnouncements()).find((a) => a.active) ?? null;

/** Saving one as active hides the others: one banner at a time. */
export function saveAnnouncement(id: string | null, input: Pick<Announcement, "message" | "tone" | "href" | "active">, actor: string): Announcement {
  if (input.active) for (const a of state.announcements) if (a.id !== id) a.active = false;
  if (id) {
    const a = state.announcements.find((x) => x.id === id);
    if (!a) throw new Error("Announcement not found");
    Object.assign(a, input);
    return { ...a };
  }
  const a: Announcement = { id: nextId("ann"), ...input, createdAt: new Date().toISOString(), createdBy: actor };
  state.announcements.push(a);
  return { ...a };
}

export function deleteAnnouncement(id: string) {
  state.announcements = state.announcements.filter((a) => a.id !== id);
}

// ---------------------------------------------------------------- activity log

export function logAction(actor: string, action: string, target?: string) {
  state.log.unshift({ id: nextId("log"), at: new Date().toISOString(), actor, action, target });
  state.log.length = Math.min(state.log.length, 500);
}
export const listLog = async () => [...state.log];

// ---------------------------------------------------------------- offers

export const listOffers = async () => [...state.offers!].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

const DAY = 86_400_000;
const closedKey = (workspaceId: string, offerId: string) => `${workspaceId}|${offerId}`;

/** Why an offer is or isn't on a workspace's dashboard right now (null = showing). */
export function offerHiddenReason(o: Offer, workspace: Pick<Workspace, "id" | "createdAt">, now = Date.now()): { reason: "not_sent" | "new_account" | "closed"; until: string | null } | null {
  if (o.workspaceIds?.length && !o.workspaceIds.includes(workspace.id)) return { reason: "not_sent", until: null };
  const startsAt = new Date(workspace.createdAt).getTime() + o.startAfterDays * DAY;
  // Sent on purpose: no new-account wait.
  if (now < startsAt && !state.offerSent![closedKey(workspace.id, o.id)]) return { reason: "new_account", until: new Date(startsAt).toISOString() };
  const closed = state.offerClosed![closedKey(workspace.id, o.id)];
  const backAt = closed ? new Date(closed).getTime() + o.snoozeDays * DAY : 0;
  if (now < backAt) return { reason: "closed", until: new Date(backAt).toISOString() };
  return null;
}

/** The live offer the workspace should see now: the one last sent to it, else the newest that's old enough (startAfterDays)
 *  and not just closed (snoozeDays). */
export async function offerFor(workspace: Pick<Workspace, "id" | "createdAt">): Promise<Offer | null> {
  const sent = (o: Offer) => state.offerSent![closedKey(workspace.id, o.id)] ?? "";
  const showing = (await listOffers()).filter((o) => o.active && !offerHiddenReason(o, workspace));
  return showing.sort((a, b) => sent(b).localeCompare(sent(a)))[0] ?? null;
}

/** When the platform team last sent this offer to the workspace (null = never). */
export const offerSentAt = (workspaceId: string, offerId: string) => state.offerSent![closedKey(workspaceId, offerId)] ?? null;

/** Platform admin: show an offer on one workspace's Dashboard now (adds it to a targeted offer's list, clears a close, skips the wait). */
export function sendOffer(workspaceId: string, offerId: string) {
  const o = state.offers!.find((x) => x.id === offerId);
  if (!o) throw new Error("Offer not found");
  if (!o.active) throw new Error("Turn the offer on first");
  if (o.workspaceIds?.length && !o.workspaceIds.includes(workspaceId)) o.workspaceIds.push(workspaceId);
  delete state.offerClosed![closedKey(workspaceId, offerId)];
  state.offerSent![closedKey(workspaceId, offerId)] = new Date().toISOString();
}

/** A workspace closed the offer (✕): hidden for that workspace for the offer's snooze days. */
export function closeOffer(workspaceId: string, offerId: string) {
  const o = state.offers!.find((x) => x.id === offerId);
  if (!o) return;
  state.offerClosed![closedKey(workspaceId, offerId)] = new Date().toISOString();
  o.closes++;
}

/** Platform admin: forget a workspace's close, so the offer shows again now. */
export function reopenOffer(workspaceId: string, offerId: string) {
  delete state.offerClosed![closedKey(workspaceId, offerId)];
}

export function saveOffer(id: string | null, input: Pick<Offer, "title" | "description" | "price" | "cta" | "active" | "startAfterDays" | "snoozeDays" | "workspaceIds">): Offer {
  const now = new Date().toISOString();
  if (id) {
    const o = state.offers!.find((x) => x.id === id);
    if (!o) throw new Error("Offer not found");
    Object.assign(o, input, { updatedAt: now });
    return { ...o };
  }
  const o: Offer = { id: nextId("offer"), ...input, views: 0, clicks: 0, closes: 0, createdAt: now, updatedAt: now };
  state.offers!.push(o);
  return { ...o };
}

export function deleteOffer(id: string) {
  state.offers = state.offers!.filter((o) => o.id !== id);
}

export const listLeads = async () => [...state.leads!].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export function trackOffer(id: string, event: "view" | "click") {
  const o = state.offers!.find((x) => x.id === id);
  if (!o) return;
  o[event === "view" ? "views" : "clicks"]++;
  // A click implies the card was seen.
  o.views = Math.max(o.views, o.clicks);
}

/** Meeting times already taken (so the form can't double-book a slot). */
/** Times held by booked meetings and by pending change requests (one meeting per slot, across all clients). */
function heldTimes(exceptLeadId?: string) {
  return state.leads!.filter((l) => l.id !== exceptLeadId && l.status === "booked").flatMap((l) => [l.meetingAt, ...(l.changeRequest ? [l.changeRequest.at] : [])]);
}
/** True when `at` overlaps another meeting (or a time someone has asked to move to). */
function clashes(at: string, exceptLeadId?: string) {
  const t = new Date(at).getTime();
  return heldTimes(exceptLeadId).some((h) => Math.abs(new Date(h).getTime() - t) < MEETING_MINUTES * 60_000);
}
export const takenSlots = async () => heldTimes().filter((t) => new Date(t).getTime() > Date.now());

/** Book a meeting (one upcoming meeting per offer + profile; one meeting per time slot). */
export async function addLead(input: Omit<OfferLead, "id" | "status" | "createdAt" | "workspaceId" | "workspaceName">): Promise<OfferLead> {
  const ws = (await getWorkspace(await currentWorkspaceId())) ?? state.workspaces.find((w) => w.current)!;
  // Clients can't move a meeting by booking again; they request a new time instead.
  if (state.leads!.some((l) => l.offerId === input.offerId && l.profileId === input.profileId && isUpcomingMeeting(l)))
    throw new Error("You already have a meeting booked. Request a new time from the meeting card.");
  if (clashes(input.meetingAt)) throw new Error("That time was just booked. Pick another one.");
  const lead: OfferLead = { id: nextId("lead"), ...input, workspaceId: ws.id, workspaceName: ws.name, status: "booked", createdAt: new Date().toISOString() };
  state.leads!.push(lead);
  return { ...lead };
}

export function setLeadStatus(id: string, status: LeadStatus) {
  const l = state.leads!.find((x) => x.id === id);
  // Cancelling from the admin list counts as the team's; any other status clears it.
  updateLead(id, { status, cancelled: status === "cancelled" ? (l?.cancelled ?? { by: "team", reason: null, at: new Date().toISOString() }) : null });
}

export const getLead = async (id: string) => {
  const l = state.leads!.find((x) => x.id === id);
  return l ? { ...l } : null;
};

export function updateLead(
  id: string,
  patch: Partial<
    Pick<OfferLead, "status" | "meetUrl" | "meetSharedAt" | "adminNote" | "meetingAt" | "reminderClosedAt" | "changeRequest" | "changeAnswer" | "cancelled" | "cancelRequest" | "cancelAnswer">
  >,
) {
  const l = state.leads!.find((x) => x.id === id);
  if (!l) throw new Error("Meeting not found");
  if (patch.meetingAt && patch.meetingAt !== l.meetingAt && clashes(patch.meetingAt, id)) throw new Error("Another meeting is booked at that time");
  if (patch.changeRequest && clashes(patch.changeRequest.at, id)) throw new Error("That time is taken. Pick another one.");
  Object.assign(l, patch);
  return { ...l };
}

export function deleteLead(id: string) {
  state.leads = state.leads!.filter((l) => l.id !== id);
}

/** The client's upcoming meeting for a profile (shown on their Dashboard). */
/** The current workspace's next meeting for a profile (two workspaces can manage the same Google profile). */
export const upcomingMeetingFor = async (profileId: string) => {
  const ws = await currentWorkspaceId();
  return state.leads!.filter((l) => l.workspaceId === ws && l.profileId === profileId && isUpcomingMeeting(l)).sort((a, b) => a.meetingAt.localeCompare(b.meetingAt))[0] ?? null;
};

// ---------------------------------------------------------------- issues

export const listIssues = async () => [...state.issues!].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const getIssue = async (id: string) => {
  const i = state.issues!.find((x) => x.id === id);
  return i ? { ...i } : null;
};

/** "Report an issue" from the app: filed under the signed-in person's workspace. */
export async function reportIssue(input: { reporterName: string; reporterEmail: string; category: IssueCategory; subject: string; description: string; page?: string | null }) {
  const wsId = await currentWorkspaceId();
  const ws = await getWorkspace(wsId);
  const now = new Date().toISOString();
  const issue: Issue = {
    id: nextId("issue"),
    workspaceId: wsId,
    workspaceName: ws?.name ?? wsId,
    ...input,
    page: input.page ?? null,
    status: "open",
    assigneeId: null,
    reply: null,
    adminNote: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  };
  state.issues!.push(issue);
  return { ...issue };
}

/** The current workspace's reports (the reporter sees status and the team's answer, never the private notes). */
export async function issuesForCurrentWorkspace() {
  const wsId = await currentWorkspaceId();
  return (await listIssues()).filter((i) => i.workspaceId === wsId).map((i) => {
      const { adminNote, ...shared } = i;
      void adminNote;
      return shared;
    });
}

export function updateIssue(id: string, patch: Partial<Pick<Issue, "status" | "assigneeId" | "reply" | "adminNote">>) {
  const i = state.issues!.find((x) => x.id === id);
  if (!i) throw new Error("Issue not found");
  const now = new Date().toISOString();
  if (patch.status && patch.status !== i.status) i.resolvedAt = patch.status === "resolved" || patch.status === "closed" ? now : null;
  Object.assign(i, patch, { updatedAt: now });
  return { ...i };
}

export function deleteIssue(id: string) {
  state.issues = state.issues!.filter((i) => i.id !== id);
}

// ---------------------------------------------------------------- platform team

const norm = (e: string) => e.trim().toLowerCase();

/** The team, with everyone in PLATFORM_ADMIN_EMAILS (or the local demo admin) added as a fixed admin. */
export function listTeam(envAdmins: string[] = []) {
  for (const email of envAdmins.map(norm)) {
    const m = state.team!.find((t) => t.email === email);
    if (m) Object.assign(m, { fromEnv: true, role: "admin" });
    else state.team!.push({ id: nextId("team"), name: email.split("@")[0], email, role: "admin", fromEnv: true, createdAt: new Date().toISOString(), addedBy: null, lastActiveAt: null });
  }
  for (const m of state.team!) if (m.fromEnv && !envAdmins.map(norm).includes(m.email)) m.fromEnv = false;
  return state.team!.map((m) => ({ ...m })).sort((a, b) => Number(!!b.fromEnv) - Number(!!a.fromEnv) || a.name.localeCompare(b.name));
}

export const teamMemberByEmail = (email: string) => {
  const m = state.team!.find((t) => t.email === norm(email));
  return m ? { ...m } : null;
};

export function touchTeamMember(email: string) {
  const m = state.team!.find((t) => t.email === norm(email));
  // At most one write a minute.
  if (m && (!m.lastActiveAt || Date.now() - new Date(m.lastActiveAt).getTime() > 60_000)) m.lastActiveAt = new Date().toISOString();
}

export function addTeamMember(input: { name: string; email: string; role: TeamRole }, addedBy: string) {
  const email = norm(input.email);
  if (state.team!.some((t) => t.email === email)) throw new Error("They're already on the team");
  const m: PlatformTeamMember = { id: nextId("team"), name: input.name.trim() || email.split("@")[0], email, role: input.role, createdAt: new Date().toISOString(), addedBy, lastActiveAt: null };
  state.team!.push(m);
  return { ...m };
}

export function updateTeamMember(id: string, patch: Partial<Pick<PlatformTeamMember, "name" | "role">>) {
  const m = state.team!.find((t) => t.id === id);
  if (!m) throw new Error("Team member not found");
  if (m.fromEnv && patch.role && patch.role !== "admin") throw new Error("Admins from PLATFORM_ADMIN_EMAILS stay admins");
  if (patch.role === "staff" && m.role === "admin" && state.team!.filter((t) => t.role === "admin").length <= 1) throw new Error("Keep at least one admin");
  Object.assign(m, patch);
  return { ...m };
}

export function removeTeamMember(id: string) {
  const m = state.team!.find((t) => t.id === id);
  if (!m) return;
  if (m.fromEnv) throw new Error("Remove them from PLATFORM_ADMIN_EMAILS on the server instead");
  if (m.role === "admin" && state.team!.filter((t) => t.role === "admin").length <= 1) throw new Error("Keep at least one admin");
  state.team = state.team!.filter((t) => t.id !== id);
  // Their tasks and issues become unassigned.
  for (const t of state.tasks!) if (t.assigneeId === id) t.assigneeId = null;
  for (const i of state.issues!) if (i.assigneeId === id) i.assigneeId = null;
}

// ---------------------------------------------------------------- platform tasks

export const listPlatformTasks = async () => state.tasks!.map((t) => ({ ...t }));

export function createPlatformTask(input: TaskInput, createdBy: string | null): Task {
  const siblings = state.tasks!.filter((t) => (t.parentId ?? null) === (input.parentId ?? null) && t.stage === input.stage);
  const parent = input.parentId ? state.tasks!.find((t) => t.id === input.parentId) : null;
  if (input.parentId && !parent) throw new Error("Task not found");
  const t: Task = {
    id: nextId("ptask"),
    description: null,
    assigneeId: null,
    dueDate: null,
    locationId: parent?.locationId ?? null,
    parentId: null,
    source: null,
    ...input,
    order: input.order ?? Math.max(-1, ...siblings.map((s) => s.order)) + 1,
    createdAt: new Date().toISOString(),
    createdBy,
    completedAt: input.stage === "done" ? new Date().toISOString() : null,
  };
  state.tasks!.push(t);
  return { ...t };
}

export function updatePlatformTask(id: string, patch: TaskPatch): Task {
  const t = state.tasks!.find((x) => x.id === id);
  if (!t) throw new Error("Task not found");
  if (patch.stage && patch.stage !== t.stage) t.completedAt = patch.stage === "done" ? new Date().toISOString() : null;
  Object.assign(t, patch);
  return { ...t };
}

export function deletePlatformTask(id: string) {
  state.tasks = state.tasks!.filter((t) => t.id !== id && t.parentId !== id);
}

// ---------------------------------------------------------------- workspace insights

export interface WorkspaceInsights {
  profiles: { id: string; title: string; reviews: number; rating: number | null; unreplied: number; views: number; actions: number }[];
  totals: {
    reviews: number;
    rating: number | null;
    newReviews: number;
    replyRate: number | null;
    views: number;
    viewsBefore: number;
    actions: number;
    actionsBefore: number;
    published: number;
    scheduled: number;
    openTasks: number;
    doneTasks: number;
    requests: number;
  };
  connections: { channel: string; status: string; account?: string | null }[];
  activity: { at: string; text: string; kind: "post" | "review" | "reply" | "task" | "request" | "member" | "connection" }[];
  /** Data that couldn't be read (e.g. Google errors), shown under the panel. */
  errors: string[];
}

const RANGE_DAYS = 30;
const withTimeout = <T>(p: Promise<T>, ms = 8000) => Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error("Took too long")), ms))]);

/**
 * A workspace's activity and performance over the last 30 days, read through its own provider (inside that workspace).
 * Counts and totals only: no review texts or customer details. Sample workspaces without data return null.
 */
export async function workspaceInsights(id: string): Promise<WorkspaceInsights | null> {
  const tenant = listTenants().find((t) => t.id === id);
  const w = state.workspaces.find((x) => x.id === id);
  if (!tenant && !w?.current) return null;
  const run = () => collectInsights();
  return tenant ? runInTenant({ id: tenant.id, state: tenant.state }, run) : run();
}

async function collectInsights(): Promise<WorkspaceInsights> {
  const provider = await getProvider();
  const errors: string[] = [];
  const safe = async <T>(label: string, p: () => Promise<T>, fallback: T) => {
    try {
      return await withTimeout(p());
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : "couldn't load"}`);
      return fallback;
    }
  };
  const since = Date.now() - RANGE_DAYS * DAY;
  const recent = (iso?: string | null) => !!iso && new Date(iso).getTime() >= since;
  const [locations, posts, tasks, members, connections, requests] = await Promise.all([
    safe("Profiles", () => provider.listLocations(), []),
    safe("Posts", () => provider.listPosts(), []),
    safe("Tasks", () => provider.listTasks(), []),
    safe("Members", () => provider.listMembers(), []),
    safe("Connections", () => provider.listConnections(), []),
    safe("Review requests", () => provider.listReviewRequests(), []),
  ]);
  const perProfile = await Promise.all(
    locations.map(async (l) => {
      const [reviews, metrics] = await Promise.all([safe(`Reviews (${l.title})`, () => provider.listReviews(l.id), []), safe(`Performance (${l.title})`, () => provider.getMetrics(l.id, RANGE_DAYS * 2), [])]);
      const cut = new Date(since).toISOString().slice(0, 10);
      const sum = (pts: typeof metrics) => pts.reduce((a, p) => ({ views: a.views + p.impressions, actions: a.actions + p.calls + p.websiteClicks + p.directions }), { views: 0, actions: 0 });
      return { l, reviews, now: sum(metrics.filter((p) => p.date >= cut)), before: sum(metrics.filter((p) => p.date < cut)) };
    }),
  );

  const allReviews = perProfile.flatMap((p) => p.reviews.filter((r) => !r.hidden).map((r) => ({ ...r, profile: p.l.title })));
  const avg = (rs: { rating: number }[]) => (rs.length ? Math.round((rs.reduce((n, r) => n + r.rating, 0) / rs.length) * 10) / 10 : null);
  const parents = tasks.filter((t) => !t.parentId);
  const names = (cs: string[]) => cs.map((c) => CHANNEL_LABEL[c as Channel] ?? c).join(", ");
  const activity: WorkspaceInsights["activity"] = [
    ...posts.filter((p) => !p.imported && recent(p.created_at)).map((p) => ({ at: p.created_at, kind: "post" as const, text: `Created a post (${names(p.channels)})` })),
    ...posts.filter((p) => !p.imported && p.status === "published" && recent(p.published_at)).map((p) => ({ at: p.published_at!, kind: "post" as const, text: `Published a post to ${names(p.channels)}` })),
    ...allReviews.filter((r) => recent(r.createTime)).map((r) => ({ at: r.createTime, kind: "review" as const, text: `New ${r.rating}★ review on ${r.profile}` })),
    ...allReviews.filter((r) => recent(r.reply?.updateTime)).map((r) => ({ at: r.reply!.updateTime, kind: "reply" as const, text: `Replied to a ${r.rating}★ review on ${r.profile}` })),
    ...parents.filter((t) => t.stage === "done" && recent(t.completedAt)).map((t) => ({ at: t.completedAt!, kind: "task" as const, text: `Finished a task: ${t.title}` })),
    ...requests.filter((r) => recent(r.sentAt ?? r.createdAt)).map((r) => ({ at: r.sentAt ?? r.createdAt, kind: "request" as const, text: `Sent a review request (${r.method})` })),
    ...members.filter((m) => recent(m.joinedAt)).map((m) => ({ at: m.joinedAt!, kind: "member" as const, text: `${m.name || m.email} joined` })),
    ...connections.filter((c) => recent(c.connectedAt)).map((c) => ({ at: c.connectedAt!, kind: "connection" as const, text: `Connected ${names([c.channel])}` })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 25);

  const total = (k: "views" | "actions", when: "now" | "before") => perProfile.reduce((n, p) => n + p[when][k], 0);
  const replyable = allReviews.filter((r) => r.comment || r.reply);
  return {
    profiles: perProfile.map((p) => {
      const rs = p.reviews.filter((r) => !r.hidden);
      return { id: p.l.id, title: p.l.title, reviews: rs.length, rating: avg(rs), unreplied: rs.filter((r) => !r.reply).length, views: p.now.views, actions: p.now.actions };
    }),
    totals: {
      reviews: allReviews.length,
      rating: avg(allReviews),
      newReviews: allReviews.filter((r) => recent(r.createTime)).length,
      replyRate: replyable.length ? Math.round((replyable.filter((r) => r.reply).length / replyable.length) * 100) : null,
      views: total("views", "now"),
      viewsBefore: total("views", "before"),
      actions: total("actions", "now"),
      actionsBefore: total("actions", "before"),
      published: posts.filter((p) => !p.imported && p.status === "published" && recent(p.published_at)).length,
      scheduled: posts.filter((p) => p.status === "scheduled").length,
      openTasks: parents.filter((t) => t.stage !== "done").length,
      doneTasks: parents.filter((t) => t.stage === "done" && recent(t.completedAt)).length,
      requests: requests.filter((r) => recent(r.sentAt ?? r.createdAt)).length,
    },
    connections: connections.map((c) => ({ channel: names([c.channel]), status: c.status, account: c.account })),
    activity,
    errors,
  };
}
