"use client";

// Review reply / handling dialog, ported from TasksBook CRM
// (ReviewReplyDialog, ReviewFollowUpDialog).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { ChevronUp, ClipboardCheck, FileText, Loader2, Plus, Star } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";
import { Menu, Modal, Segmented, SelectBox } from "@/components/ui-client";
import { GoogleIcon } from "@/components/marketing/channel-icon";
import { ReviewAvatar, ReviewStars } from "@/components/reviews/review-bits";
import { updateReview } from "@/app/(app)/actions";
import type { FollowUpType, MessageTemplate, Review, TeamMember } from "@/lib/gbp/types";
import { FOLLOW_UP_LABEL, isLow, reviewState } from "@/lib/reviews";
import { mergeTemplate, replyFor, templateOrder } from "@/lib/templates";
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
        {review.comment ? <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">“{review.comment}”</p> : <p className="text-sm text-muted-foreground">Rating only — no comment.</p>}

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
          <textarea id="rv-reply" rows={5} value={text} autoFocus={focus !== "followup"} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" className={inputClass} />
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
            <span className={cn("ml-auto text-xs tabular-nums text-muted-foreground", text.length > 4096 && "font-semibold text-destructive")}>{text.length.toLocaleString()}/4,096</span>
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
              <Segmented label="Follow-up type" value={fuType} onChange={setFuType} options={(Object.keys(FOLLOW_UP_LABEL) as FollowUpType[]).map((k) => ({ value: k, label: FOLLOW_UP_LABEL[k] }))} />
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

