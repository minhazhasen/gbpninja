"use client";

// Dashboard: the client's upcoming meeting with the platform team (booked from an offer). Shows the time, the Google Meet
// Join button once the team has sent the link, and lets them request a new time or a cancellation (the team confirms either; they can't change or cancel it themselves). A reminder: ✕ closes it until
// 1 hour before the meeting (or until a new link is sent — see meetingReminderVisible).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInMinutes, format, formatDistanceToNowStrict, isToday, isTomorrow, parseISO } from "date-fns";
import { toast } from "sonner";
import { CalendarClock, CalendarX, CircleCheck, Copy, Loader2, Video, X } from "lucide-react";
import { closeMeetingReminder, requestMeetingCancel, withdrawMeetingRequest } from "@/app/(app)/actions";
import { BookingDialog, type Booker } from "@/components/offer-card";
import { Card, buttonClass, inputClass } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import { MEETING_MINUTES, type Offer, type OfferLead } from "@/lib/platform/types";

type Meeting = Pick<OfferLead, "id" | "offerTitle" | "meetingAt" | "meetUrl" | "meetSharedAt" | "name" | "email" | "phone" | "changeRequest" | "changeAnswer" | "cancelRequest" | "cancelAnswer">;

export function MeetingCard({ meeting, locationId, taken }: { meeting: Meeting; locationId: string; taken: string[] }) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  // Re-render every minute so "starts in…" and the Join state stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const at = parseISO(meeting.meetingAt);
  const link = meeting.meetSharedAt ? meeting.meetUrl : null;
  const minsAway = differenceInMinutes(at, now);
  const live = minsAway <= 10 && minsAway > -MEETING_MINUTES;
  const day = isToday(at) ? "Today" : isTomorrow(at) ? "Tomorrow" : format(at, "EEEE d MMMM");
  const me: Booker = { name: meeting.name, email: meeting.email, phone: meeting.phone };
  const offer: Pick<Offer, "id" | "title" | "price"> = { id: "", title: meeting.offerTitle, price: null };
  const label = (iso: string) => format(parseISO(iso), "EEE d MMM, HH:mm");
  // Only the latest answer from the team is shown (a time change or a declined cancel).
  const cancelNewer = !!meeting.cancelAnswer && (!meeting.changeAnswer || meeting.cancelAnswer.answeredAt > meeting.changeAnswer.answeredAt);
  const answer = cancelNewer ? null : meeting.changeAnswer;

  const withdraw = async () => {
    setBusy(true);
    const res = await withdrawMeetingRequest(meeting.id);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Request withdrawn");
    router.refresh();
  };

  const requestCancel = async () => {
    setBusy(true);
    const res = await requestMeetingCancel(meeting.id, reason);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setCancelling(false);
    toast.success("Cancel request sent", { description: "We'll confirm it. Until then the meeting stays booked." });
    router.refresh();
  };
  const pending = !!meeting.changeRequest || !!meeting.cancelRequest;

  if (closed) return null;

  return (
    <>
      <Card className="relative flex flex-col gap-4 border-l-4 border-l-primary p-5 pr-10 sm:flex-row sm:items-center lg:pl-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Video className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-caps">Your meeting with our team</p>
          <p className="mt-0.5 text-lg font-semibold tracking-tight" suppressHydrationWarning>
            {day}, {format(at, "HH:mm")}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {MEETING_MINUTES} min{minsAway > 0 && minsAway < 24 * 60 ? ` · starts in ${formatDistanceToNowStrict(at)}` : ""}
            </span>
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {meeting.offerTitle}
            {!link && " · we'll send the Google Meet link here before the call"}
          </p>
          {meeting.cancelRequest ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-warning">
              <CalendarX className="h-4 w-4" /> You asked to cancel · waiting for our confirmation
              <button type="button" onClick={withdraw} disabled={busy} className="font-semibold underline-offset-2 hover:underline">
                Withdraw
              </button>
            </p>
          ) : meeting.changeRequest ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-warning" suppressHydrationWarning>
              <CalendarClock className="h-4 w-4" /> You asked to move it to {label(meeting.changeRequest.at)} · waiting for our confirmation
              <button type="button" onClick={withdraw} disabled={busy} className="font-semibold underline-offset-2 hover:underline">
                Withdraw
              </button>
            </p>
          ) : answer?.status === "accepted" && answer.at === meeting.meetingAt ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-success">
              <CircleCheck className="h-4 w-4" /> New time confirmed
            </p>
          ) : cancelNewer && meeting.cancelAnswer?.status === "declined" ? (
            <p className="mt-1.5 text-sm text-muted-foreground">We&apos;d still like to meet, so the meeting stays booked. Request another time if this one doesn&apos;t work.</p>
          ) : (
            answer?.status === "declined" && (
              <p className="mt-1.5 text-sm text-muted-foreground" suppressHydrationWarning>
                We couldn&apos;t move it to {label(answer.at)}, so it stays at this time. Request another time if this doesn&apos;t work.
              </p>
            )
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {link && (
            <>
              <a href={link} target="_blank" rel="noreferrer" className={buttonClass(live ? "default" : "outline")}>
                <Video /> Join Google Meet
              </a>
              <button
                type="button"
                className={buttonClass("ghost", "icon", "text-muted-foreground")}
                aria-label="Copy meeting link"
                title="Copy link"
                onClick={() =>
                  navigator.clipboard.writeText(link).then(
                    () => toast.success("Link copied"),
                    () => toast.error("Couldn't copy"),
                  )
                }
              >
                <Copy />
              </button>
            </>
          )}
          {!pending && (
            <>
              <button type="button" className={buttonClass("outline", "sm")} onClick={() => setMoving(true)} disabled={busy}>
                <CalendarClock /> Request new time
              </button>
              <button type="button" className={buttonClass("ghost", "sm", "text-muted-foreground")} onClick={() => setCancelling(true)} disabled={busy}>
                Request to cancel
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          aria-label="Close reminder"
          title="Close (it comes back 1 hour before the meeting)"
          onClick={() => {
            setClosed(true);
            void closeMeetingReminder(meeting.id);
          }}
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </Card>
      <Modal open={cancelling} onClose={() => !busy && setCancelling(false)} title="Request to cancel" className="h-auto sm:max-w-md">
        <div className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">
            We&apos;ll confirm the cancellation. Until then your meeting on <span className="font-medium text-foreground">{label(meeting.meetingAt)}</span> stays booked.
          </p>
          <label className="block space-y-1.5">
            <span className="label-caps block">Reason (optional)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className={`${inputClass} resize-y`} placeholder="e.g. We found another agency" autoFocus />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" className={buttonClass("outline")} onClick={() => setCancelling(false)} disabled={busy}>
            Keep meeting
          </button>
          <button type="button" className={buttonClass("destructive")} onClick={requestCancel} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Send request
          </button>
        </div>
      </Modal>
      {moving && (
        <BookingDialog offer={offer} locationId={locationId} taken={taken} me={me} request={{ leadId: meeting.id, current: meeting.meetingAt }} onClose={() => (setMoving(false), router.refresh())} />
      )}
    </>
  );
}
