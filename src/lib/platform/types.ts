// Platform (the company running this app) — customers' workspaces, announcements, offers and the admin activity log.
// The app is free (no plans or billing); the platform earns from services it offers (Admin → Offers).
// Only platform admins see this; workspace admins manage their own workspace in Settings / Users.
import type { MemberRole } from "@/lib/gbp/types";

export type WorkspaceStatus = "active" | "suspended";

export interface WorkspaceProfile {
  id: string;
  title: string;
  address: string;
}

export interface WorkspaceMember {
  name: string;
  email: string;
  role: MemberRole;
  status: "active" | "invited";
  lastActiveAt: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  status: WorkspaceStatus;
  createdAt: string;
  lastActiveAt: string | null;
  /** Internal notes, never shown to the workspace. */
  notes?: string;
  /** The workspace this app instance serves: its profiles and members come from the GBP provider. */
  current?: boolean;
  profiles: WorkspaceProfile[];
  members: WorkspaceMember[];
}

export type AnnouncementTone = "info" | "warning" | "success";

/** Banner shown at the top of the app for every workspace while active. */
export interface Announcement {
  id: string;
  message: string;
  tone: AnnouncementTone;
  /** Optional "Learn more" link. */
  href?: string | null;
  active: boolean;
  createdAt: string;
  createdBy: string;
}

export interface AdminLogEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target?: string;
}

export const WORKSPACE_STATUS: Record<WorkspaceStatus, { label: string; variant: "success" | "destructive" }> = {
  active: { label: "Active", variant: "success" },
  suspended: { label: "Suspended", variant: "destructive" },
};

/** A paid-service promotion (e.g. managed Local SEO) shown on every workspace's Dashboard,
 *  from `startAfterDays` after sign-up, every day until closed; closing hides it for `snoozeDays`. */
export interface Offer {
  id: string;
  title: string;
  description: string;
  /** Short tag next to the button, e.g. "$299 / month". */
  price?: string | null;
  /** Button text, e.g. "Get more calls". */
  cta: string;
  active: boolean;
  /** First shown this many days after the workspace signs up. */
  startAfterDays: number;
  /** After a workspace closes it (✕), shown again this many days later. */
  snoozeDays: number;
  /** Browser sessions that saw the card / clicked its button (each counted once per session); times it was closed. */
  views: number;
  clicks: number;
  closes: number;
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus = "booked" | "met" | "won" | "lost" | "cancelled";

/** A meeting booked from an offer's button: the platform team follows up. */
export interface OfferLead {
  id: string;
  offerId: string;
  offerTitle: string;
  workspaceId: string;
  workspaceName: string;
  profileId: string;
  profileTitle: string;
  name: string;
  email: string;
  phone?: string | null;
  note?: string | null;
  /** Meeting start (ISO) and the booker's time zone. */
  meetingAt: string;
  timeZone?: string | null;
  status: LeadStatus;
  /** Video call link (Google Meet) and when it was shared with the client (it shows in their app from then on). */
  meetUrl?: string | null;
  meetSharedAt?: string | null;
  /** Platform team's private notes. */
  adminNote?: string | null;
  /** The client closed the Dashboard reminder (it comes back 1 hour before the meeting, or when there's news). */
  reminderClosedAt?: string | null;
  /** The client asked to move the meeting (they can't move it themselves); the platform team accepts or declines. */
  changeRequest?: { at: string; note?: string | null; requestedAt: string } | null;
  /** The client asked to cancel (they can't cancel themselves); the platform team accepts or declines. */
  cancelRequest?: { reason?: string | null; requestedAt: string } | null;
  /** The answer to the last cancel request (declined = the meeting stays), shown on the client's reminder. */
  cancelAnswer?: { status: "accepted" | "declined"; answeredAt: string } | null;
  /** Set when the meeting is cancelled: at the client's request, or by the platform team. */
  cancelled?: { by: "client" | "team"; reason?: string | null; at: string } | null;
  /** The answer to the last change request, shown on the client's reminder. */
  changeAnswer?: { status: "accepted" | "declined"; at: string; answeredAt: string } | null;
  createdAt: string;
}

/** Meeting slots offered in the booking form (booker's local time). */
export const MEETING_SLOTS = ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];
export const MEETING_MINUTES = 30;

export const LEAD_STATUS: Record<LeadStatus, { label: string; variant: "info" | "warning" | "success" | "secondary" }> = {
  booked: { label: "Booked", variant: "info" },
  met: { label: "Met", variant: "warning" },
  won: { label: "Won", variant: "success" },
  lost: { label: "Lost", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

/** Whether the client's Dashboard reminder is showing: not closed, or closed but the meeting is within the hour / a link was sent since. */
export function meetingReminderVisible(l: Pick<OfferLead, "meetingAt" | "meetSharedAt" | "reminderClosedAt" | "changeAnswer" | "cancelAnswer">, now = Date.now()) {
  if (!l.reminderClosedAt) return true;
  if (new Date(l.meetingAt).getTime() - now <= 60 * 60_000) return true;
  // News since they closed it: a (new) link, or an answer to their change request.
  return [l.meetSharedAt, l.changeAnswer?.answeredAt, l.cancelAnswer?.answeredAt].some((t) => !!t && t > l.reminderClosedAt!);
}

/** Meetings the client still sees (booked and not long over). */
export const isUpcomingMeeting = (l: Pick<OfferLead, "status" | "meetingAt">, now = Date.now()) => l.status === "booked" && new Date(l.meetingAt).getTime() + 60 * 60_000 > now;
