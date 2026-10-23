"use server";

// Platform admin actions. Every one checks platformAdmin() first and is written to the activity log.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { platformAdmin } from "@/lib/admin";
import * as platform from "@/lib/platform/store";
import { createMeetLink, isMeetUrl } from "@/lib/platform/meet";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Runs `fn` as the signed-in platform admin, logs `action`, refreshes the admin pages (and the app when it changed). */
async function asAdmin(fn: (actor: string) => Promise<{ action: string; target?: string; message?: string } | void>, appPaths: string[] = []): Promise<Result> {
  const actor = await platformAdmin();
  if (!actor) return { ok: false, error: "Platform admins only" };
  try {
    const done = await fn(actor);
    if (done) platform.logAction(actor, done.action, done.target);
    revalidatePath("/admin", "layout");
    for (const p of appPaths) revalidatePath(p, "layout");
    return { ok: true, message: done ? done.message : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "Check the form") : e instanceof Error ? e.message : "Something went wrong" };
  }
}

const id = z.string().min(1).max(200);
const wsName = async (workspaceId: string) => (await platform.getWorkspace(workspaceId))?.name ?? workspaceId;

// ---------------------------------------------------------------- workspaces

export async function setWorkspaceStatus(workspaceId: string, status: "active" | "suspended") {
  return asAdmin(async () => {
    const s = z.enum(["active", "suspended"]).parse(status);
    platform.updateWorkspace(id.parse(workspaceId), { status: s });
    return { action: s === "suspended" ? "Suspended workspace" : "Reactivated workspace", target: await wsName(workspaceId) };
  });
}

export async function saveWorkspaceNotes(workspaceId: string, notes: string) {
  return asAdmin(async () => {
    platform.updateWorkspace(id.parse(workspaceId), { notes: z.string().max(4000).parse(notes).trim() });
    return { action: "Updated internal notes", target: await wsName(workspaceId) };
  });
}

export async function deleteWorkspace(workspaceId: string) {
  return asAdmin(async () => {
    const name = await wsName(workspaceId);
    platform.deleteWorkspace(id.parse(workspaceId));
    return { action: "Deleted workspace", target: name };
  });
}

// ---------------------------------------------------------------- announcements

export async function saveAnnouncement(announcementId: string | null, input: { message: string; tone: string; href: string; active: boolean }) {
  return asAdmin(
    async (actor) => {
      const a = z
        .object({
          message: z.string().trim().min(1, "Write the message").max(240, "Keep it under 240 characters"),
          tone: z.enum(["info", "warning", "success"]),
          href: z.string().trim().url("Enter a full link (https://…)").or(z.literal("")),
          active: z.boolean(),
        })
        .parse(input);
      platform.saveAnnouncement(announcementId ? id.parse(announcementId) : null, { ...a, href: a.href || null }, actor);
      return { action: announcementId ? "Edited announcement" : "Created announcement", target: a.message.slice(0, 60) };
    },
    ["/"],
  );
}

export async function deleteAnnouncement(announcementId: string) {
  return asAdmin(async () => {
    platform.deleteAnnouncement(id.parse(announcementId));
    return { action: "Deleted announcement" };
  }, ["/"]);
}

// ---------------------------------------------------------------- offers

export async function saveOffer(offerId: string | null, input: { title: string; description: string; price: string; cta: string; active: boolean; startAfterDays: number; snoozeDays: number }) {
  return asAdmin(async () => {
    const o = z
      .object({
        title: z.string().trim().min(1, "Write a title").max(90, "Keep the title under 90 characters"),
        description: z.string().trim().max(300, "Keep the info under 300 characters"),
        price: z.string().trim().max(30),
        cta: z.string().trim().min(1, "Add the button text").max(30),
        active: z.boolean(),
        startAfterDays: z.number().int().min(0, "0 or more days").max(365),
        snoozeDays: z.number().int().min(1, "At least 1 day").max(365),
      })
      .parse(input);
    platform.saveOffer(offerId ? id.parse(offerId) : null, { ...o, price: o.price || null });
    return { action: offerId ? "Edited offer" : "Created offer", target: o.title };
  }, ["/dashboard"]);
}

export async function deleteOffer(offerId: string) {
  return asAdmin(async () => {
    const title = (await platform.listOffers()).find((o) => o.id === offerId)?.title;
    platform.deleteOffer(id.parse(offerId));
    return { action: "Deleted offer", target: title };
  }, ["/dashboard"]);
}

export async function setLeadStatus(leadId: string, status: string) {
  return asAdmin(async () => {
    const s = z.enum(["booked", "met", "won", "lost", "cancelled"]).parse(status);
    platform.setLeadStatus(id.parse(leadId), s);
    const lead = (await platform.listLeads()).find((l) => l.id === leadId);
    return { action: `Marked meeting ${s}`, target: lead ? `${lead.profileTitle} · ${lead.offerTitle}` : undefined };
  });
}

export async function reopenOffer(workspaceId: string, offerId: string) {
  return asAdmin(async () => {
    platform.reopenOffer(id.parse(workspaceId), id.parse(offerId));
    const title = (await platform.listOffers()).find((o) => o.id === offerId)?.title;
    return { action: "Showed offer again", target: `${await wsName(workspaceId)} · ${title}` };
  }, ["/dashboard"]);
}

// ---------------------------------------------------------------- offer meetings

const meetingLabel = (l: { profileTitle: string; name: string }) => `${l.profileTitle} · ${l.name}`;

/** Make a Google Meet link for the meeting (demo: a sample link). Not shared with the client until sendMeetingLink. */
export async function createMeetingLink(leadId: string) {
  return asAdmin(async () => {
    const lead = await platform.getLead(id.parse(leadId));
    if (!lead) throw new Error("Meeting not found");
    const url = await createMeetLink(lead);
    platform.updateLead(lead.id, { meetUrl: url, meetSharedAt: null });
    return { action: "Created Google Meet link", target: meetingLabel(lead), message: url };
  });
}

/** Save the meeting's details: link (cleared share if it changed), time, status, private notes. */
export async function saveMeeting(leadId: string, input: { meetUrl: string; meetingAt: string; status: string; adminNote: string }) {
  return asAdmin(async () => {
    const lead = await platform.getLead(id.parse(leadId));
    if (!lead) throw new Error("Meeting not found");
    const m = z
      .object({
        meetUrl: z
          .string()
          .trim()
          .max(500)
          .refine((v) => !v || isMeetUrl(v), "Paste a Google Meet (or Zoom / Teams) link"),
        meetingAt: z.string().datetime({ message: "Pick a date and time" }),
        status: z.enum(["booked", "met", "won", "lost", "cancelled"]),
        adminNote: z.string().trim().max(4000),
      })
      .parse(input);
    const linkChanged = (m.meetUrl || null) !== (lead.meetUrl ?? null);
    // Cancelled here by the team (a client's own cancellation keeps its reason).
    const cancelled = m.status === "cancelled" ? (lead.cancelled ?? { by: "team" as const, reason: null, at: new Date().toISOString() }) : null;
    const moved = m.meetingAt !== lead.meetingAt;
    platform.updateLead(lead.id, {
      meetUrl: m.meetUrl || null,
      // A new link (or a new time) has to be sent again.
      meetSharedAt: linkChanged || moved ? null : lead.meetSharedAt,
      meetingAt: m.meetingAt,
      status: m.status,
      adminNote: m.adminNote || null,
      cancelled,
    });
    return { action: moved ? "Moved meeting" : "Updated meeting", target: meetingLabel(lead) };
  }, ["/dashboard"]);
}

/** Show the link (and time) to the client in their app. */
export async function sendMeetingLink(leadId: string) {
  return asAdmin(async () => {
    const lead = await platform.getLead(id.parse(leadId));
    if (!lead) throw new Error("Meeting not found");
    if (!lead.meetUrl) throw new Error("Add a meeting link first");
    platform.updateLead(lead.id, { meetSharedAt: new Date().toISOString() });
    return { action: "Sent meeting link", target: meetingLabel(lead) };
  }, ["/dashboard"]);
}

/** Accept (moves the meeting to the requested time) or decline the client's time change request. */
export async function answerMeetingTimeRequest(leadId: string, accept: boolean) {
  return asAdmin(async () => {
    const lead = await platform.getLead(id.parse(leadId));
    if (!lead?.changeRequest) throw new Error("There's no pending request");
    const at = lead.changeRequest.at;
    const answer = { status: accept ? ("accepted" as const) : ("declined" as const), at, answeredAt: new Date().toISOString() };
    platform.updateLead(lead.id, accept ? { meetingAt: at, changeRequest: null, changeAnswer: answer } : { changeRequest: null, changeAnswer: answer });
    return { action: accept ? "Accepted new meeting time" : "Declined new meeting time", target: meetingLabel(lead) };
  }, ["/dashboard"]);
}

/** Remove a meeting for good (also from the client's Dashboard). */
export async function deleteMeeting(leadId: string) {
  return asAdmin(async () => {
    const lead = await platform.getLead(id.parse(leadId));
    if (!lead) throw new Error("Meeting not found");
    platform.deleteLead(lead.id);
    return { action: "Deleted meeting", target: meetingLabel(lead) };
  }, ["/dashboard"]);
}

/** Accept (the meeting is cancelled) or decline (it stays) the client's cancel request. */
export async function answerMeetingCancelRequest(leadId: string, accept: boolean) {
  return asAdmin(async () => {
    const lead = await platform.getLead(id.parse(leadId));
    if (!lead?.cancelRequest) throw new Error("There's no pending request");
    const now = new Date().toISOString();
    if (accept) {
      platform.updateLead(lead.id, {
        status: "cancelled",
        cancelled: { by: "client", reason: lead.cancelRequest.reason ?? null, at: now },
        cancelRequest: null,
        cancelAnswer: { status: "accepted", answeredAt: now },
      });
      // The offer waits its snooze days before showing to this workspace again.
      platform.closeOffer(lead.workspaceId, lead.offerId);
    } else {
      platform.updateLead(lead.id, { cancelRequest: null, cancelAnswer: { status: "declined", answeredAt: now } });
    }
    return { action: accept ? "Cancelled meeting (client asked)" : "Declined cancel request", target: meetingLabel(lead) };
  }, ["/dashboard"]);
}
