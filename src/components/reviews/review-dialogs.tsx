"use client";

// Review reply / handling dialog and "Request reviews" dialog, ported from TasksBook CRM
// (ReviewReplyDialog, ReviewFollowUpDialog, RequestReviewDialog).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { ChevronUp, ClipboardCheck, Copy, FileText, Info, Loader2, Mail, MessageSquare, Pencil, Phone, Plus, Send, Star } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";
import { Menu, Modal, Segmented, SelectBox } from "@/components/ui-client";
import { GoogleIcon } from "@/components/marketing/channel-icon";
import { ReviewAvatar, ReviewStars } from "@/components/reviews/review-bits";
import { createReviewRequest, updateReview } from "@/app/(app)/actions";
import type { EmailSender, FollowUpType, MessageTemplate, Review, ReviewRequestMethod, TeamMember } from "@/lib/gbp/types";
import { FOLLOW_UP_LABEL, isLow, reviewLink, reviewState } from "@/lib/reviews";
import { LINK_TOKEN, REVIEW_BUTTON_LABEL, mergeTemplate, replyFor, splitOnLink, templateOrder } from "@/lib/templates";
import { GmailIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";

export type ReviewRow = Review & { locationTitle: string };

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="label-caps block">
      {children}
    </label>
  );
}

/** Opened from a table row: full review, reply on Google, assignee, follow-up and hide. */
export function ReviewDialog({
  review,
  open,
  onClose,
  members,
  focus,
  templates,
}: {
  review: ReviewRow | null;
  open: boolean;
  onClose: () => void;
  members: TeamMember[];
  focus?: "reply" | "followup";
  /** Reply templates (Settings → Templates). */
  templates: MessageTemplate[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [fuType, setFuType] = useState<FollowUpType>("called");
  const [fuNote, setFuNote] = useState("");
  /** Follow-up form is tucked away until asked for. */
  const [fuOpen, setFuOpen] = useState(false);

  useEffect(() => {
    if (!open || !review) return;
    setText(review.reply?.comment ?? "");
    setFuType(review.followUp?.type ?? "called");
    setFuNote(review.followUp?.note ?? "");
  }, [open, review]);
  // Reset only when the dialog opens (not on every refresh after a save).
  useEffect(() => {
    if (open) setFuOpen(focus === "followup");
  }, [open, focus]);

  if (!review) return null;
  const st = reviewState(review);
  const assignee = review.assignedTo ? (members.find((m) => m.id === review.assignedTo)?.name ?? null) : null;

  const run = async (key: string, patch: Parameters<typeof updateReview>[2], ok: string, close = true) => {
    setBusy(key);
    const res = await updateReview(review.locationId, review.id, patch);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(ok);
    router.refresh();
    if (close) onClose();
    return true;
  };

  const saveReply = () => {
    if (!text.trim()) return void toast.error("Write a reply");
    if (text.length > 4096) return void toast.error("Google replies are limited to 4,096 characters");
    void run("reply", { reply: text.trim() }, review.reply ? "Reply updated on Google" : "Reply posted on Google");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="review-dialog-title"
      className="h-[100dvh] max-w-xl sm:h-auto sm:max-h-[92dvh]"
      title={
        <>
          <span id="review-dialog-title" className="truncate">
            {review.reply ? "Edit reply" : "Reply to review"}
          </span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", st.tone)}>{st.label}</span>
        </>
      }
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div className="flex items-start gap-3">
          <ReviewAvatar name={review.reviewer} photo={review.reviewerPhoto} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{review.reviewer}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <GoogleIcon className="h-3 w-3" /> Google · {review.locationTitle} · {format(parseISO(review.createTime), "MMM d, yyyy")}
            </p>
          </div>
          <ReviewStars rating={review.rating} size="md" />
        </div>
        {review.comment ? (
          <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">“{review.comment}”</p>
        ) : (
          <p className="text-sm text-muted-foreground">Rating only — no comment.</p>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="rv-reply">Public reply on Google</Label>
            <Menu
              label="Reply templates"
              align="end"
              width="w-60"
              trigger={(p) => (
                <button type="button" {...p} className={buttonClass("ghost", "sm", "h-7")}>
                  <FileText /> Templates
                </button>
              )}
              header={<p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold text-muted-foreground">Best match for {review.rating}★ first</p>}
              items={(() => {
                const best = replyFor(templates, review.rating);
                const replies = templates.filter((t) => t.kind === "reply").sort((a, b) => Number(b.id === best?.id) - Number(a.id === best?.id) || templateOrder(a, b));
                return replies.map((t) => ({
                  label: (
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      {!!t.ratings?.length && (
                        <span className={cn("inline-flex shrink-0 items-center gap-0.5 text-[11px]", t.ratings.includes(review.rating) ? "text-warning" : "text-muted-foreground")}>
                          {t.ratings.join(",")}
                          <Star className="h-2.5 w-2.5 fill-current" />
                        </span>
                      )}
                    </span>
                  ),
                  onSelect: () => setText(mergeTemplate(t.body, { name: review.reviewer, business: review.locationTitle })),
                }));
              })()}
            />
          </div>
          <textarea
            id="rv-reply"
            rows={5}
            value={text}
            autoFocus={focus !== "followup"}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a reply…"
            className={inputClass}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={buttonClass("default", "sm")} onClick={saveReply} disabled={!!busy}>
              {busy === "reply" && <Loader2 className="animate-spin" />}
              {review.reply ? "Update on Google" : "Post on Google"}
            </button>
            {review.reply && (
              <button
                type="button"
                className={buttonClass("ghost", "sm", "text-destructive hover:bg-destructive/10")}
                disabled={!!busy}
                onClick={() => run("remove", { reply: null }, "Reply removed")}
              >
                Remove reply
              </button>
            )}
            <span className={cn("ml-auto text-xs tabular-nums text-muted-foreground", text.length > 4096 && "font-semibold text-destructive")}>
              {text.length.toLocaleString()}/4,096
            </span>
          </div>
        </section>

        <section className="space-y-2 border-t pt-5">
          {!fuOpen ? (
            review.followUp ? (
              // Saved follow-up: compact summary
              <div className="flex items-start gap-3 rounded-xl border bg-muted/30 px-3 py-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                  <ClipboardCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">
                    {FOLLOW_UP_LABEL[review.followUp.type]}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">{format(parseISO(review.followUp.at), "MMM d, yyyy")}</span>
                  </p>
                  {review.followUp.note && <p className="mt-0.5 text-muted-foreground">{review.followUp.note}</p>}
                  {assignee && <p className="mt-0.5 text-xs text-muted-foreground">Assigned to {assignee}</p>}
                </div>
                <button type="button" className={buttonClass("ghost", "sm", "h-7")} onClick={() => setFuOpen(true)}>
                  Edit
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setFuOpen(true)}
                aria-expanded={false}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/50 hover:bg-muted/40",
                  isLow(review) && "border-destructive/40",
                )}
              >
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", isLow(review) ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
                  <ClipboardCheck className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{isLow(review) ? "Needs follow-up" : "Log a follow-up"}</span>
                  <span className="block text-xs text-muted-foreground">{assignee ? `Assigned to ${assignee}` : "Record how you handled this customer outside Google"}</span>
                </span>
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            )
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <Label>Follow-up (private)</Label>
                <button type="button" className={buttonClass("ghost", "icon", "h-7 w-7 text-muted-foreground")} aria-label="Hide follow-up" onClick={() => setFuOpen(false)}>
                  <ChevronUp />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Log how you handled this customer outside Google. Only your team sees this.</p>
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Team member</span>
                <SelectBox
                  label="Team member"
                  value={review.assignedTo ?? "none"}
                  onChange={(v) => run("assign", { assignedTo: v === "none" ? null : v }, v === "none" ? "Unassigned" : `Assigned to ${members.find((m) => m.id === v)?.name}`, false)}
                  options={[{ value: "none", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
                />
              </div>
              <span className="block text-sm font-medium">What happened</span>
              <Segmented
                label="Follow-up type"
                value={fuType}
                onChange={setFuType}
                options={(Object.keys(FOLLOW_UP_LABEL) as FollowUpType[]).map((k) => ({ value: k, label: FOLLOW_UP_LABEL[k] }))}
              />
              <textarea rows={2} value={fuNote} autoFocus onChange={(e) => setFuNote(e.target.value)} placeholder="What did you do?" className={inputClass} maxLength={2000} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass("default", "sm")}
                  disabled={!!busy}
                  onClick={async () => {
                    if (await run("fu", { followUp: { type: fuType, note: fuNote.trim() || undefined, at: new Date().toISOString() } }, "Follow-up saved", false)) setFuOpen(false);
                  }}
                >
                  {busy === "fu" && <Loader2 className="animate-spin" />}
                  Save follow-up
                </button>
                <button type="button" className={buttonClass("ghost", "sm")} disabled={!!busy} onClick={() => setFuOpen(false)}>
                  Cancel
                </button>
                {review.followUp && (
                  <button
                    type="button"
                    className={buttonClass("ghost", "sm", "ml-auto text-destructive hover:bg-destructive/10")}
                    disabled={!!busy}
                    onClick={async () => {
                      if (await run("fu-clear", { followUp: null }, "Follow-up cleared", false)) setFuOpen(false);
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}

/** Ask a customer for a Google review: pick a template, edit it, then send from Gmail (or the device's mail / messages app). */
export function RequestReviewDialog({
  open,
  onClose,
  locations,
  defaultLocationId,
  templates,
  sender,
  settingsHref,
}: {
  open: boolean;
  onClose: () => void;
  locations: { id: string; title: string; placeId?: string }[];
  defaultLocationId: string;
  /** Request email / text templates (Settings → Templates). */
  templates: MessageTemplate[];
  sender: EmailSender;
  /** Settings → Email, to connect Gmail. */
  settingsHref: string;
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [method, setMethod] = useState<ReviewRequestMethod>("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const gmail = sender.status === "connected";
  const kind = method === "email" ? "request_email" : "request_sms";
  const options = useMemo(() => templates.filter((t) => t.kind === kind).sort(templateOrder), [templates, kind]);

  useEffect(() => {
    if (!open) return;
    setLocationId(defaultLocationId);
    setMethod("email");
    setName("");
    setEmail("");
    setPhone("");
    setEdited(false);
    setEditing(false);
  }, [open, defaultLocationId]);
  // Switching between email and text picks that kind's default template.
  useEffect(() => {
    setTemplateId(options[0]?.id ?? "");
    setEdited(false);
  }, [options]);

  const loc = locations.find((l) => l.id === locationId) ?? locations[0];
  const link = reviewLink(loc?.placeId) ?? "";
  const tpl = options.find((t) => t.id === templateId) ?? options[0];
  // Until the message is edited by hand it follows the template, name and location.
  useEffect(() => {
    if (edited || !tpl) return;
    // Emails keep {{link}}: it is sent as a "Leave a Google review" button, not a bare URL.
    const vars = { name, business: (method === "email" && sender.fromName) || loc?.title, link: method === "email" ? LINK_TOKEN : link };
    setSubject(mergeTemplate(tpl.subject ?? "", vars));
    setBody(mergeTemplate(tpl.body, vars));
  }, [tpl, name, loc?.title, link, edited, method, sender.fromName]);

  const direct = method === "email" && gmail;
  const save = async (status: "draft" | "sent") => {
    setBusy(status);
    const res = await createReviewRequest({ locationId, name, email, phone, method, status, viaGmail: status === "sent" && direct, subject, body });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    if (status === "sent") {
      if (direct) toast.success(`Review request sent to ${email}`, { description: `From ${sender.email}` });
      else {
        // No Gmail / SMS provider: hand off to the device's own apps, or copy the message.
        // mailto can't carry a button, so the mail app gets the plain link.
        if (method === "email") window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(splitOnLink(body).join(link))}`;
        else if (method === "sms") window.location.href = `sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(body)}`;
        else await navigator.clipboard.writeText(body).catch(() => undefined);
        toast.success(method === "link" ? "Message copied — paste it to your customer" : "Request saved — finish sending in your mail or messages app");
      }
    } else toast.success("Saved as draft");
    router.refresh();
    onClose();
  };

  const smsLen = body.length;
  return (
    <Modal open={open} onClose={onClose} labelledBy="ask-title" className="h-[100dvh] max-w-lg sm:h-auto sm:max-h-[92dvh]" title={<span id="ask-title">Request a review</span>}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {locations.length > 1 && (
          <div className="space-y-1.5">
            <Label>Location</Label>
            <SelectBox label="Location" value={locationId} onChange={setLocationId} options={locations.map((l) => ({ value: l.id, label: l.title }))} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="ask-name">Customer name</Label>
          <input id="ask-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Jane Smith" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>Send by</Label>
          <Segmented
            label="Send by"
            value={method}
            onChange={setMethod}
            options={[
              {
                value: "email",
                label: (
                  <>
                    <Mail className="h-3.5 w-3.5" /> Email
                  </>
                ),
              },
              {
                value: "sms",
                label: (
                  <>
                    <Phone className="h-3.5 w-3.5" /> Text
                  </>
                ),
              },
              {
                value: "link",
                label: (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy link
                  </>
                ),
              },
            ]}
          />
        </div>
        {method === "email" && (
          <div className="space-y-1.5">
            <Label htmlFor="ask-email">Email</Label>
            <input id="ask-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="jane@example.com" />
            {gmail ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GmailIcon className="h-3.5 w-3.5" /> Sends from <span className="font-medium text-foreground">{sender.email}</span>
              </p>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Opens your mail app.{" "}
                  <Link href={settingsHref} className="font-semibold text-primary hover:underline">
                    Connect Gmail
                  </Link>{" "}
                  to send from here.
                </span>
              </p>
            )}
          </div>
        )}
        {method === "sms" && (
          <div className="space-y-1.5">
            <Label htmlFor="ask-phone">Mobile number</Label>
            <input id="ask-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="+1 512 555 0100" />
          </div>
        )}

        <div className="space-y-2 rounded-xl border p-3">
          <div className="flex items-center gap-2">
            <Label>Message</Label>
            {options.length > 1 && (
              <SelectBox
                label="Template"
                value={tpl?.id ?? ""}
                onChange={(v) => {
                  setTemplateId(v);
                  setEdited(false);
                }}
                options={options.map((t) => ({ value: t.id, label: `${t.name}${t.isDefault ? " (default)" : ""}` }))}
                className="ml-auto w-48 [&_select]:h-8 [&_select]:text-xs"
              />
            )}
          </div>
          {method === "email" && <input value={subject} onChange={(e) => (setSubject(e.target.value), setEdited(true))} aria-label="Subject" placeholder="Subject" className={cn(inputClass, "font-medium")} />}
          {method === "email" && !editing ? (
            <button type="button" onClick={() => setEditing(true)} className="group relative block w-full rounded-lg border bg-card px-3 py-2.5 text-left text-sm leading-relaxed hover:border-primary/40" aria-label="Edit message">
              <span className="block whitespace-pre-wrap break-words">
                {splitOnLink(body).map((part, i, all) => (
                  <span key={i}>
                    {part}
                    {i < all.length - 1 && <span className="my-1 inline-block rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">{REVIEW_BUTTON_LABEL}</span>}
                  </span>
                ))}
              </span>
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Pencil className="h-3 w-3" /> Edit
              </span>
            </button>
          ) : (
            <textarea value={body} onChange={(e) => (setBody(e.target.value), setEdited(true))} aria-label="Message" rows={method === "email" ? 8 : 4} className={cn(inputClass, "resize-y leading-relaxed")} autoFocus={method === "email"} />
          )}
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            {edited ? (
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setEdited(false)}>
                Reset to template
              </button>
            ) : (
              <span>{method === "email" ? (editing ? `${LINK_TOKEN} becomes the "${REVIEW_BUTTON_LABEL}" button.` : "Click the message to edit it.") : "Name and review link fill in automatically."}</span>
            )}
            {method !== "email" && <span className="tabular-nums">{smsLen} chars · {Math.max(1, Math.ceil(smsLen / 160))} SMS</span>}
          </div>
          {!link && <p className="text-xs text-warning">This location has no Google place id yet, so the message has no review link.</p>}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
        <button type="button" className={buttonClass("outline")} disabled={!!busy} onClick={() => save("draft")}>
          Save draft
        </button>
        <button type="button" className={buttonClass()} disabled={!!busy} onClick={() => save("sent")}>
          {busy === "sent" ? <Loader2 className="animate-spin" /> : direct ? <Send /> : method === "link" ? <Copy /> : <MessageSquare />}
          {direct ? "Send email" : method === "email" ? "Open email" : method === "sms" ? "Open messages" : "Copy message"}
        </button>
      </div>
    </Modal>
  );
}
