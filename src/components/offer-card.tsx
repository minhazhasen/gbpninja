"use client";

// Platform offer (Admin → Offers) on the Dashboard. The button opens a booking form (date + time slot) → a meeting lead;
// once booked, the Dashboard shows the MeetingCard instead.
// Counts one view and one click per browser session. ✕ closes it for the whole workspace (the server brings it back after the offer's snooze days).
import { useEffect, useMemo, useState } from "react";
import { addDays, format, isSameDay, isWeekend, parseISO } from "date-fns";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { CircleCheck, Loader2, Sparkles, X } from "lucide-react";
import { bookOffer, dismissOffer, requestMeetingTime, trackOffer } from "@/app/(app)/actions";
import { DateField } from "@/components/date-time-field";
import { buttonClass, inputClass } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import { MEETING_MINUTES, MEETING_SLOTS, type Offer } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

const SEEN_KEY = "gbp-offer-seen";
const CLICKED_KEY = "gbp-offer-clicked";

export type Booker = { name: string; email: string; phone?: string | null };

export function OfferCard({
  offer,
  locationId,
  taken = [],
  me,
  preview,
}: {
  offer: Pick<Offer, "id" | "title" | "description" | "price" | "cta">;
  locationId?: string;
  /** Meeting times already taken (ISO). */
  taken?: string[];
  /** Prefills the form. */
  me?: Booker;
  preview?: boolean;
}) {
  // The server only renders the card when it's due (see offerFor); ✕ hides it right away and tells the server.
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (preview) return;
    // One view per browser session.
    try {
      if (sessionStorage.getItem(SEEN_KEY) === offer.id) return;
      sessionStorage.setItem(SEEN_KEY, offer.id);
    } catch {}
    void trackOffer(offer.id, "view");
  }, [offer.id, preview]);
  if (hidden) return null;

  const start = () => {
    if (preview) return;
    // One click per browser session, so rates stay "people", not button presses.
    try {
      if (sessionStorage.getItem(CLICKED_KEY) !== offer.id) {
        sessionStorage.setItem(CLICKED_KEY, offer.id);
        void trackOffer(offer.id, "click");
      }
    } catch {
      void trackOffer(offer.id, "click");
    }
    setOpen(true);
  };

  return (
    <>
      {/* overflow-clip, not hidden: a hidden box can still be scrolled by focus changes, shifting the content. */}
      <section className="relative overflow-clip rounded-xl bg-primary text-primary-foreground">
        {/* Soft decorative circles */}
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-primary-foreground/10" />
        <span aria-hidden className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-primary-foreground/5" />
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center lg:px-6">
          <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15 sm:flex">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 pr-6 sm:pr-0">
            <h2 className="text-lg font-semibold leading-snug tracking-tight">{offer.title || "Offer title"}</h2>
            {offer.description && <p className="mt-1 text-sm text-primary-foreground/80">{offer.description}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {offer.price && <span className="rounded-full bg-primary-foreground/15 px-3 py-1 text-sm font-semibold">{offer.price}</span>}
            <button
              type="button"
              onClick={start}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg bg-primary-foreground px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary-foreground/90",
                preview && "cursor-default",
              )}
            >
              {offer.cta || "Learn more"}
            </button>
          </div>
        </div>
        {!preview && (
          <button
            type="button"
            aria-label="Not now"
            title="Not now"
            onClick={() => {
              setHidden(true);
              void dismissOffer(offer.id);
            }}
            className="absolute right-2 top-2 rounded-md p-1 text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </section>
      {open && locationId && (
        <BookingDialog
          offer={offer}
          locationId={locationId}
          taken={taken}
          me={me}
          // Booked: the Dashboard swaps this card for the meeting card.
          onClose={() => (setOpen(false), router.refresh())}
        />
      )}
    </>
  );
}

/** Next weekday (today if it's a weekday and there's still a slot left). */
function firstDay(now = new Date()) {
  let d = now;
  if (format(now, "HH:mm") >= MEETING_SLOTS.at(-1)!) d = addDays(d, 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return format(d, "yyyy-MM-dd");
}

/** Book a meeting about an offer, or (`request`) ask to move a booked one: the team accepts or declines, the time stays until then. */
export function BookingDialog({
  offer,
  locationId,
  taken,
  me,
  request,
  onClose,
}: {
  offer: Pick<Offer, "id" | "title" | "price">;
  locationId: string;
  taken: string[];
  me?: Booker;
  /** Asking for a new time for this meeting (booked at `current`). */
  request?: { leadId: string; current: string };
  onClose: () => void;
}) {
  const current = request?.current ?? null;
  const [name, setName] = useState(me?.name ?? "");
  const [email, setEmail] = useState(me?.email ?? "");
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [date, setDate] = useState(() => (current ? format(parseISO(current), "yyyy-MM-dd") : firstDay()));
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const day = date ? parseISO(date) : null;
  const weekend = !!day && isWeekend(day);
  const slots = MEETING_SLOTS.map((t) => {
    const at = day ? new Date(`${date}T${t}:00`).getTime() : null;
    const past = at == null || at < Date.now() + 30 * 60_000;
    const mine = !!current && at === new Date(current).getTime();
    // One meeting per slot: anything booked (or requested) within the meeting length is taken.
    const busySlot = at != null && !mine && taken.some((iso) => Math.abs(new Date(iso).getTime() - at) < MEETING_MINUTES * 60_000);
    return { t, disabled: past || busySlot || mine, busy: busySlot, mine };
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!time) return void toast.error("Pick a time");
    setBusy(true);
    const meetingAt = new Date(`${date}T${time}:00`).toISOString();
    const res = request ? await requestMeetingTime(request.leadId, { meetingAt, note }) : await bookOffer(offer.id, locationId, { name, email, phone, meetingAt, timeZone, note });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setDone(meetingAt);
  };
  const label = (iso: string) => format(parseISO(iso), "EEE d MMM, HH:mm");

  return (
    <Modal open onClose={onClose} title={done ? (request ? "Request sent" : "You're booked") : request ? "Request a new time" : "Book a meeting"} className="h-auto max-h-[94dvh] sm:max-w-lg">
      {done ? (
        <div className="space-y-4 p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <CircleCheck className="h-6 w-6" />
          </span>
          <div>
            <p className="text-lg font-semibold">{format(parseISO(done), "EEEE d MMMM")}</p>
            <p className="text-muted-foreground">
              {format(parseISO(done), "HH:mm")} · {MEETING_MINUTES} min · {timeZone}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {request ? `We'll confirm the new time. Until then your meeting stays on ${label(request.current)}.` : `Our team will contact you at ${email} at that time.`}
          </p>
          <button type="button" className={buttonClass()} onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {request ? (
              <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                Booked for <span className="font-semibold">{label(request.current)}</span>. Pick a time that suits you better and we&apos;ll confirm it.
              </p>
            ) : (
              <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                <span className="font-semibold">{offer.title}</span>
                {offer.price && <span> · {offer.price}</span>}
              </p>
            )}
            <div className="space-y-1.5">
              <span className="label-caps block">Date</span>
              <DateField value={date} onChange={(v) => (setDate(v), setTime(""))} min={format(new Date(), "yyyy-MM-dd")} clearable={false} />
            </div>
            <div className="space-y-1.5">
              <span className="label-caps block">Time</span>
              {weekend ? (
                <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">We meet Monday to Friday. Pick a weekday.</p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                  {slots.map((s) => (
                    <button
                      key={s.t}
                      type="button"
                      disabled={s.disabled}
                      aria-pressed={time === s.t}
                      onClick={() => setTime(s.t)}
                      title={s.mine ? "Your current time" : s.busy ? "Already booked" : undefined}
                      className={cn(
                        "h-9 rounded-lg border text-sm font-medium tabular-nums transition-colors disabled:cursor-not-allowed",
                        time === s.t ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40 hover:bg-accent",
                        s.mine ? "border-dashed border-primary/50 text-accent-foreground" : "disabled:opacity-40",
                        s.busy && "line-through",
                      )}
                    >
                      {s.t}
                    </button>
                  ))}
                </div>
              )}
              {!weekend && slots.every((s) => s.disabled) && <p className="text-xs text-muted-foreground">No times left that day. Pick another date.</p>}
              <p className="text-xs text-muted-foreground">
                {MEETING_MINUTES}-minute call · times in your time zone ({timeZone}){current ? " · dashed = your current time, crossed out = taken" : " · crossed out = taken"}
              </p>
            </div>
            {!request && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="label-caps block">Name</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputClass} required />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="label-caps block">Phone</span>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} className={inputClass} placeholder="Optional" />
                  </label>
                </div>
                <label className="block space-y-1.5">
                  <span className="label-caps block">Email</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
                </label>
              </>
            )}
            <label className="block space-y-1.5">
              <span className="label-caps block">{request ? "Reason (optional)" : "Anything we should know?"}</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={request ? 500 : 1000} className={`${inputClass} resize-y`} placeholder="Optional" />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={buttonClass()} disabled={busy || !time || weekend || (!request && (!name.trim() || !email.trim()))}>
              {busy && <Loader2 className="animate-spin" />}
              {time && day && !weekend ? `${request ? "Request" : "Book"} ${isSameDay(day, new Date()) ? "today" : format(day, "EEE d MMM")}, ${time}` : request ? "Request time" : "Book meeting"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
