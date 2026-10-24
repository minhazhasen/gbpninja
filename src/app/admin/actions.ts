"use server";

// Platform admin actions. Every one checks platformAdmin() first and is written to the activity log.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { platformAdmin, platformMember } from "@/lib/admin";
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

export async function saveOffer(
  offerId: string | null,
  input: { title: string; description: string; price: string; cta: string; active: boolean; startAfterDays: number; snoozeDays: number; workspaceIds?: string[] },
) {
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
        workspaceIds: z.array(id).max(500).default([]),
      })
      .parse(input);
    const saved = platform.saveOffer(offerId ? id.parse(offerId) : null, { ...o, price: o.price || null });
    // Newly picked workspaces see it straight away (no new-account wait).
    if (o.active) for (const w of o.workspaceIds) if (!platform.offerSentAt(w, saved.id)) platform.sendOffer(w, saved.id);
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

/** Show an offer on one workspace's Dashboard now. */
export async function sendOffer(workspaceId: string, offerId: string) {
  return asAdmin(async () => {
    platform.sendOffer(id.parse(workspaceId), id.parse(offerId));
    const title = (await platform.listOffers()).find((o) => o.id === offerId)?.title;
    return { action: "Sent offer", target: `${await wsName(workspaceId)} · ${title}` };
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

// ---------------------------------------------------------------- issues

export async function saveIssue(issueId: string, input: { status: string; assigneeId: string | null; adminNote: string }) {
  return asAdmin(async () => {
    const issue = await platform.getIssue(id.parse(issueId));
    if (!issue) throw new Error("Issue not found");
    const i = z
      .object({ status: z.enum(["open", "in_progress", "resolved", "closed"]), assigneeId: id.nullable(), adminNote: z.string().trim().max(4000) })
      .parse(input);
    if (i.assigneeId && !platform.listTeam().some((m) => m.id === i.assigneeId)) throw new Error("Pick someone on the team");
    platform.updateIssue(issue.id, { ...i, adminNote: i.adminNote || null });
    return { action: i.status !== issue.status ? `Marked issue ${i.status.replace("_", " ")}` : "Updated issue", target: `${issue.workspaceName} · ${issue.subject}` };
  });
}

/** Answer the reporter: shown under their report in the app (Report an issue). */
export async function replyToIssue(issueId: string, text: string) {
  return asAdmin(async (actor) => {
    const issue = await platform.getIssue(id.parse(issueId));
    if (!issue) throw new Error("Issue not found");
    const t = z.string().trim().min(1, "Write the answer").max(2000).parse(text);
    const by = platform.teamMemberByEmail(actor)?.name ?? "GBPNinja team";
    platform.updateIssue(issue.id, { reply: { text: t, by, at: new Date().toISOString() }, status: issue.status === "open" ? "in_progress" : issue.status });
    return { action: "Answered issue", target: `${issue.workspaceName} · ${issue.subject}` };
  }, ["/"]);
}

export async function deleteIssue(issueId: string) {
  return asAdmin(async () => {
    const issue = await platform.getIssue(id.parse(issueId));
    platform.deleteIssue(id.parse(issueId));
    return { action: "Deleted issue", target: issue ? `${issue.workspaceName} · ${issue.subject}` : undefined };
  }, ["/"]);
}

// ---------------------------------------------------------------- platform team (admins only)

const teamSchema = z.object({
  name: z.string().trim().max(80),
  email: z.string().trim().toLowerCase().email("Enter their email address"),
  role: z.enum(["admin", "staff"]),
});

async function asTeamAdmin(fn: (actor: string) => Promise<{ action: string; target?: string; message?: string } | void>) {
  const me = await platformMember();
  if (me && me.role !== "admin") return { ok: false as const, error: "Only admins can change the team" };
  return asAdmin(fn);
}

export async function addTeamMember(input: { name: string; email: string; role: string }) {
  return asTeamAdmin(async (actor) => {
    const m = platform.addTeamMember(teamSchema.parse(input), actor);
    return { action: `Added ${m.role}`, target: m.email };
  });
}

export async function updateTeamMember(memberId: string, input: { name: string; role: string }) {
  return asTeamAdmin(async () => {
    const p = teamSchema.pick({ name: true, role: true }).parse(input);
    const m = platform.updateTeamMember(id.parse(memberId), { role: p.role, ...(p.name ? { name: p.name } : {}) });
    return { action: "Updated team member", target: m.email };
  });
}

export async function removeTeamMember(memberId: string) {
  return asTeamAdmin(async (actor) => {
    const m = platform.listTeam().find((t) => t.id === memberId);
    if (m?.email === actor) throw new Error("You can't remove yourself");
    platform.removeTeamMember(id.parse(memberId));
    return { action: "Removed team member", target: m?.email };
  });
}

// ---------------------------------------------------------------- platform tasks

type TaskResult = { ok: true; id: string } | { ok: false; error: string };
const taskFields = {
  title: z.string().trim().min(1, "Give the task a title").max(200, "Keep the title under 200 characters"),
  description: z.string().trim().max(5000).nullable(),
  stage: z.enum(["todo", "in_progress", "in_review", "done"]),
  priority: z.enum(["urgent", "high", "medium", "low"]),
  assigneeId: z.string().max(100).nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid due date")
    .nullable(),
  locationId: z.string().max(200).nullable(),
  order: z.number().finite(),
};

/** Like asAdmin, but returns the id the task views expect. */
async function asAdminTask(fn: (actor: string) => Promise<{ id: string; action?: string; target?: string }>): Promise<TaskResult> {
  let taskId = "";
  const res = await asAdmin(async (actor) => {
    const done = await fn(actor);
    taskId = done.id;
    return done.action ? { action: done.action, target: done.target } : undefined;
  });
  return res.ok ? { ok: true, id: taskId } : res;
}

const checkRefs = (t: { assigneeId?: string | null }) => {
  if (t.assigneeId && !platform.listTeam().some((m) => m.id === t.assigneeId)) throw new Error("Pick someone on the team");
};

export async function createPlatformTask(input: {
  title: string;
  description?: string | null;
  stage: string;
  priority: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  locationId?: string | null;
  parentId?: string | null;
  subtasks?: { title: string; assigneeId?: string | null; dueDate?: string | null }[];
}) {
  return asAdminTask(async (actor) => {
    const data = z
      .object({
        ...taskFields,
        order: taskFields.order.optional(),
        parentId: z.string().max(200).nullable().optional(),
        subtasks: z
          .array(z.object({ title: taskFields.title, assigneeId: taskFields.assigneeId.optional(), dueDate: taskFields.dueDate.optional() }))
          .max(50)
          .optional(),
      })
      .parse({ description: null, assigneeId: null, dueDate: null, locationId: null, ...input });
    checkRefs(data);
    const me = platform.teamMemberByEmail(actor)?.id ?? null;
    const { subtasks, ...task } = data;
    const created = platform.createPlatformTask(task, me);
    for (const [i, s] of (subtasks ?? []).entries()) {
      checkRefs(s);
      platform.createPlatformTask({ title: s.title, assigneeId: s.assigneeId ?? null, dueDate: s.dueDate ?? null, stage: "todo", priority: "medium", parentId: created.id, order: i }, me);
    }
    return { id: created.id, ...(created.parentId ? {} : { action: "Created task", target: created.title }) };
  });
}

export async function updatePlatformTask(taskId: string, patch: Record<string, unknown>) {
  return asAdminTask(async () => {
    const data = z.object(taskFields).partial().parse(patch);
    checkRefs(data);
    const task = (await platform.listPlatformTasks()).find((t) => t.id === id.parse(taskId));
    if (!task) throw new Error("Task not found");
    if (task.parentId) delete data.locationId;
    platform.updatePlatformTask(task.id, data);
    if (data.locationId !== undefined) for (const s of (await platform.listPlatformTasks()).filter((t) => t.parentId === task.id)) platform.updatePlatformTask(s.id, { locationId: data.locationId });
    return { id: task.id, ...(data.stage === "done" && !task.parentId ? { action: "Finished task", target: task.title } : {}) };
  });
}

export async function deletePlatformTask(taskId: string) {
  return asAdminTask(async () => {
    const task = (await platform.listPlatformTasks()).find((t) => t.id === id.parse(taskId));
    platform.deletePlatformTask(taskId);
    return { id: taskId, ...(task && !task.parentId ? { action: "Deleted task", target: task.title } : {}) };
  });
}

/** "Add task" on a meeting, issue or workspace: a task linked back to it, assigned to whoever made it. */
export async function createLinkedTask(kind: "meeting" | "issue" | "workspace", refId: string) {
  return asAdminTask(async (actor) => {
    const ref = id.parse(refId);
    let link: { label: string; href: string; workspaceId: string | null; title: string };
    if (kind === "meeting") {
      const l = await platform.getLead(ref);
      if (!l) throw new Error("Meeting not found");
      link = { label: `${l.name} · ${l.profileTitle}`, href: `/admin/meetings?meeting=${l.id}`, workspaceId: l.workspaceId, title: `Follow up: meeting with ${l.name}` };
    } else if (kind === "issue") {
      const i = await platform.getIssue(ref);
      if (!i) throw new Error("Issue not found");
      link = { label: i.subject, href: `/admin/issues?issue=${i.id}`, workspaceId: i.workspaceId, title: `Fix: ${i.subject}` };
    } else {
      const w = await platform.getWorkspace(ref);
      if (!w) throw new Error("Workspace not found");
      link = { label: w.name, href: `/admin/workspaces/${encodeURIComponent(w.id)}`, workspaceId: w.id, title: `Follow up with ${w.name}` };
    }
    const tasks = await platform.listPlatformTasks();
    const open = tasks.find((t) => t.source?.type === "platform" && t.source.kind === kind && t.source.refId === ref && t.stage !== "done");
    if (open) return { id: open.id };
    const me = platform.teamMemberByEmail(actor)?.id ?? null;
    const t = platform.createPlatformTask(
      {
        title: link.title.slice(0, 200),
        stage: "todo",
        priority: kind === "issue" ? "high" : "medium",
        assigneeId: me,
        locationId: link.workspaceId,
        source: { type: "platform", kind, refId: ref, label: link.label, href: link.href },
      },
      me,
    );
    return { id: t.id, action: "Created task", target: t.title };
  });
}
