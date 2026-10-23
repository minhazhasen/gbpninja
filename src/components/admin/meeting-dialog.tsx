"use client";

// Admin → Offers: one booked meeting. Time (yours + the client's), Google Meet link (create / paste → send to client's app),
// client details and note, status and private notes.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import { CalendarClock, CalendarX, Check, CircleCheck, Copy, ExternalLink, Loader2, Mail, Phone, Send, Trash2, Video, X } from "lucide-react";
import { DateTimeField } from "@/components/date-time-field";
import { Badge, buttonClass, inputClass } from "@/components/ui";
import { Modal, Segmented } from "@/components/ui-client";
import { answerMeetingCancelRequest, answerMeetingTimeRequest, createMeetingLink, saveMeeting, sendMeetingLink } from "@/app/admin/actions";
import { LEAD_STATUS, MEETING_MINUTES, type LeadStatus, type OfferLead } from "@/lib/platform/types";

const local = (iso: string) => format(parseISO(iso), "yyyy-MM-dd'T'HH:mm");
/** The meeting time in the client's own time zone, when it differs from ours. */
function clientTime(iso: string, tz?: string | null) {
  if (!tz || tz === Intl.DateTimeFormat().resolvedOptions().timeZone) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
  } catch {
    return null;
  }
}

export function MeetingDialog({ lead, onClose, onDelete }: { lead: OfferLead; onClose: () => void; onDelete: () => void }) {
  const router = useRouter();
  const [meetUrl, setMeetUrl] = useState(lead.meetUrl ?? "");
  const [when, setWhen] = useState(local(lead.meetingAt));
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [note, setNote] = useState(lead.adminNote ?? "");
  const [busy, setBusy] = useState<"create" | "send" | "save" | "answer" | null>(null);

  const meetingAt = when.length >= 16 ? new Date(when).toISOString() : lead.meetingAt;
  const dirty = meetUrl.trim() !== (lead.meetUrl ?? "") || meetingAt !== lead.meetingAt || status !== lead.status || note.trim() !== (lead.adminNote ?? "");
  const shared = !!lead.meetSharedAt && !dirty;
  const theirs = clientTime(meetingAt, lead.timeZone);

  const save = async (quiet = false) => {
    const res = await saveMeeting(lead.id, { meetUrl: meetUrl.trim(), meetingAt, status, adminNote: note });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    if (!quiet) toast.success("Meeting saved");
    router.refresh();
    return true;
  };
  const create = async () => {
    setBusy("create");
    const res = await createMeetingLink(lead.id);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    setMeetUrl(res.message ?? "");
    toast.success("Google Meet link created", { description: "Send it to the client when you're ready." });
    router.refresh();
  };
  const answer = async (accept: boolean) => {
    const req = lead.changeRequest;
    if (!req) return;
    setBusy("answer");
    const res = await answerMeetingTimeRequest(lead.id, accept);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    if (accept) setWhen(local(req.at));
    toast.success(accept ? "Meeting moved" : "Request declined", { description: `${lead.name} sees this on their Dashboard.` });
    router.refresh();
  };
  const answerCancel = async (accept: boolean) => {
    setBusy("answer");
    const res = await answerMeetingCancelRequest(lead.id, accept);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    if (accept) setStatus("cancelled");
    toast.success(accept ? "Meeting cancelled" : "Meeting kept", { description: `${lead.name} sees this on their Dashboard.` });
    router.refresh();
  };
  const send = async () => {
    setBusy("send");
    // Unsaved link or time? Save first so the client gets what's on screen.
    if (dirty && !(await save(true))) return setBusy(null);
    const res = await sendMeetingLink(lead.id);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`Sent to ${lead.name}`, { description: "They see the link on their Dashboard now." });
    router.refresh();
  };
  const emailBody = encodeURIComponent(
    `Hi ${lead.name.split(/\s+/)[0] || "there"},\n\nYour meeting about "${lead.offerTitle}" is on ${format(parseISO(meetingAt), "EEEE d MMMM 'at' HH:mm")} (${MEETING_MINUTES} min).\n\nJoin: ${meetUrl || "(link to follow)"}\n\nSee you then!`,
  );

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{lead.profileTitle}</span>
          <Badge variant={LEAD_STATUS[lead.status].variant} pill>
            {LEAD_STATUS[lead.status].label}
          </Badge>
        </span>
      }
      className="h-auto max-h-[94dvh] sm:max-w-xl"
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {/* Client's request to cancel */}
        {lead.cancelRequest && (
          <section className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="flex items-center gap-2 font-semibold text-destructive">
              <CalendarX className="h-4 w-4" /> Asked to cancel this meeting
            </p>
            {lead.cancelRequest.reason && <p className="text-sm">&ldquo;{lead.cancelRequest.reason}&rdquo;</p>}
            <p className="text-xs text-muted-foreground" suppressHydrationWarning>
              Requested {formatDistanceToNow(parseISO(lead.cancelRequest.requestedAt), { addSuffix: true })}. It stays booked until you answer.
            </p>
            <div className="flex gap-2 pt-1">
              <button type="button" className={buttonClass("destructive", "sm")} onClick={() => answerCancel(true)} disabled={!!busy}>
                {busy === "answer" ? <Loader2 className="animate-spin" /> : <Check />} Cancel meeting
              </button>
              <button type="button" className={buttonClass("outline", "sm")} onClick={() => answerCancel(false)} disabled={!!busy}>
                Keep meeting
              </button>
            </div>
          </section>
        )}
        {lead.status === "cancelled" && lead.cancelled && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm" suppressHydrationWarning>
            {lead.cancelled.by === "client" ? "Cancelled at the client's request" : "Cancelled by your team"} · {formatDistanceToNow(parseISO(lead.cancelled.at), { addSuffix: true })}
            {lead.cancelled.reason && <span className="block text-muted-foreground">&ldquo;{lead.cancelled.reason}&rdquo;</span>}
          </p>
        )}

        {/* Client's request to move the meeting */}
        {lead.changeRequest && (
          <section className="space-y-2 rounded-xl border border-warning/30 bg-warning/5 p-4">
            <p className="flex items-center gap-2 font-semibold text-warning">
              <CalendarClock className="h-4 w-4" /> Asked to move to {format(parseISO(lead.changeRequest.at), "EEEE d MMMM · HH:mm")}
            </p>
            {lead.changeRequest.note && <p className="text-sm">&ldquo;{lead.changeRequest.note}&rdquo;</p>}
            <p className="text-xs text-muted-foreground" suppressHydrationWarning>
              Requested {formatDistanceToNow(parseISO(lead.changeRequest.requestedAt), { addSuffix: true })}. The meeting stays at the current time until you accept.
            </p>
            <div className="flex gap-2 pt-1">
              <button type="button" className={buttonClass("default", "sm")} onClick={() => answer(true)} disabled={!!busy}>
                {busy === "answer" ? <Loader2 className="animate-spin" /> : <Check />} Accept new time
              </button>
              <button type="button" className={buttonClass("outline", "sm")} onClick={() => answer(false)} disabled={!!busy}>
                <X /> Decline
              </button>
            </div>
          </section>
        )}

        {/* When */}
        <section className="space-y-2">
          <p className="text-xl font-semibold tracking-tight" suppressHydrationWarning>
            {format(parseISO(meetingAt), "EEEE d MMMM · HH:mm")}
          </p>
          <p className="text-sm text-muted-foreground">
            {MEETING_MINUTES} min · {lead.offerTitle}
            {theirs && (
              <>
                {" "}
                · client&apos;s time {theirs} ({lead.timeZone})
              </>
            )}
          </p>
          <div className="max-w-sm pt-1">
            <DateTimeField value={when} onChange={setWhen} defaultTime={format(parseISO(lead.meetingAt), "HH:mm")} />
          </div>
        </section>

        {/* Google Meet */}
        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Video className="h-4 w-4" />
            </span>
            <span className="flex-1 font-semibold">Google Meet</span>
            {shared ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-success" suppressHydrationWarning>
                <CircleCheck className="h-3.5 w-3.5" /> Sent {formatDistanceToNow(parseISO(lead.meetSharedAt!), { addSuffix: true })}
              </span>
            ) : (
              meetUrl && <span className="text-xs text-muted-foreground">Not sent yet</span>
            )}
          </div>
          <div className="flex gap-2">
            <input value={meetUrl} onChange={(e) => setMeetUrl(e.target.value)} placeholder="https://meet.google.com/…" className={inputClass} aria-label="Meeting link" />
            {meetUrl ? (
              <>
                <button
                  type="button"
                  className={buttonClass("outline", "icon")}
                  aria-label="Copy link"
                  onClick={() =>
                    navigator.clipboard.writeText(meetUrl).then(
                      () => toast.success("Link copied"),
                      () => toast.error("Couldn't copy"),
                    )
                  }
                >
                  <Copy />
                </button>
                <a href={meetUrl} target="_blank" rel="noreferrer" className={buttonClass("outline", "icon")} aria-label="Open link">
                  <ExternalLink />
                </a>
              </>
            ) : (
              <button type="button" className={buttonClass("outline")} onClick={create} disabled={!!busy}>
                {busy === "create" ? <Loader2 className="animate-spin" /> : <Video />} Create
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass()} onClick={send} disabled={!meetUrl.trim() || !!busy || status !== "booked"}>
              {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} {shared ? "Send again" : "Send to client"}
            </button>
            <a href={`mailto:${lead.email}?subject=${encodeURIComponent(`Your meeting: ${lead.offerTitle}`)}&body=${emailBody}`} className={buttonClass("outline")}>
              <Mail /> Email it
            </a>
          </div>
          <p className="text-xs text-muted-foreground">&ldquo;Send to client&rdquo; shows the time and a Join button on their Dashboard.</p>
        </section>

        {/* Client */}
        <section className="space-y-2">
          <p className="label-caps">Client</p>
          <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <p>
              <span className="block text-xs text-muted-foreground">Name</span>
              {lead.name}
            </p>
            <p>
              <span className="block text-xs text-muted-foreground">Business</span>
              {lead.profileTitle} ·{" "}
              <Link href={`/admin/workspaces/${lead.workspaceId}`} className="text-primary hover:underline">
                {lead.workspaceName}
              </Link>
            </p>
            <p className="min-w-0">
              <span className="block text-xs text-muted-foreground">Email</span>
              <a href={`mailto:${lead.email}`} className="block truncate text-primary hover:underline">
                {lead.email}
              </a>
            </p>
            <p>
              <span className="block text-xs text-muted-foreground">Phone</span>
              {lead.phone ? (
                <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                  <Phone className="h-3.5 w-3.5" /> {lead.phone}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>
          {lead.note && <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">&ldquo;{lead.note}&rdquo;</p>}
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
            Booked {formatDistanceToNow(parseISO(lead.createdAt), { addSuffix: true })}
          </p>
        </section>

        {/* Outcome */}
        <section className="space-y-2">
          <p className="label-caps">Status</p>
          <Segmented label="Status" value={status} onChange={setStatus} options={(Object.keys(LEAD_STATUS) as LeadStatus[]).map((k) => ({ value: k, label: LEAD_STATUS[k].label }))} />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Private notes: what they need, budget, next steps…"
            className={`${inputClass} resize-y`}
          />
        </section>
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <button type="button" className={buttonClass("ghost", "default", "mr-auto text-destructive hover:bg-destructive/10")} onClick={onDelete} disabled={!!busy}>
          <Trash2 /> Delete
        </button>
        <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={!!busy}>
          Close
        </button>
        <button
          type="button"
          className={buttonClass()}
          disabled={!dirty || !!busy}
          onClick={async () => {
            setBusy("save");
            const ok = await save();
            setBusy(null);
            if (ok) onClose();
          }}
        >
          {busy === "save" && <Loader2 className="animate-spin" />} Save
        </button>
      </div>
    </Modal>
  );
}
