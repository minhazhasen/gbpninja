// Platform data. Demo: in memory on globalThis (resets on restart). Live (GBP_DATA_SOURCE=google): one JSON document in SQLite
// (AppState "platform", saved every few seconds). The current workspace's profiles and members come live from the GBP provider,
// so changes made here show up in the app straight away.
import { getProvider } from "@/lib/gbp";
import { loadDoc, saveDoc } from "@/lib/gbp/persist";
import { listTenants, resolveTenant } from "@/lib/gbp/tenancy";
import { currentTenant } from "@/lib/gbp/tenant-context";
import {
  type AdminLogEntry,
  type Announcement,
  type LeadStatus,
  type Offer,
  type OfferLead,
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

interface PlatformState {
  workspaces: StoredWorkspace[];
  announcements: Announcement[];
  log: AdminLogEntry[];
  seq: number;
  offers?: Offer[];
  leads?: OfferLead[];
  /** When each workspace last closed each offer: `${workspaceId}|${offerId}` → ISO. */
  offerClosed?: Record<string, string>;
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
export function offerHiddenReason(o: Offer, workspace: Pick<Workspace, "id" | "createdAt">, now = Date.now()): { reason: "new_account" | "closed"; until: string } | null {
  const startsAt = new Date(workspace.createdAt).getTime() + o.startAfterDays * DAY;
  if (now < startsAt) return { reason: "new_account", until: new Date(startsAt).toISOString() };
  const closed = state.offerClosed![closedKey(workspace.id, o.id)];
  const backAt = closed ? new Date(closed).getTime() + o.snoozeDays * DAY : 0;
  if (now < backAt) return { reason: "closed", until: new Date(backAt).toISOString() };
  return null;
}

/** The newest live offer the workspace should see now: old enough (startAfterDays) and not just closed (snoozeDays). */
export async function offerFor(workspace: Pick<Workspace, "id" | "createdAt">): Promise<Offer | null> {
  return (await listOffers()).find((o) => o.active && !offerHiddenReason(o, workspace)) ?? null;
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

export function saveOffer(id: string | null, input: Pick<Offer, "title" | "description" | "price" | "cta" | "active" | "startAfterDays" | "snoozeDays">): Offer {
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
