"use client";

// "Report an issue" (account menu): tell the platform team about a problem or idea. Lands in Admin → Issues with the page it was
// sent from; "Your reports" shows each report's status and the team's answer.
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MessageSquareReply } from "lucide-react";
import { Badge, buttonClass, inputClass } from "@/components/ui";
import { Modal, Segmented, SelectBox } from "@/components/ui-client";
import { myIssues, reportIssue } from "@/app/(app)/actions";
import { ISSUE_CATEGORIES, ISSUE_STATUS, type Issue, type IssueCategory } from "@/lib/platform/types";

type MyIssue = Omit<Issue, "adminNote">;

export function ReportIssueDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [tab, setTab] = useState<"new" | "mine">("new");
  const [category, setCategory] = useState<IssueCategory>("bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<MyIssue[] | null>(null);
  const page = `${pathname}${params.size ? `?${params}` : ""}`;

  useEffect(() => {
    if (!open) return;
    setSent(false);
    myIssues().then(setMine);
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    const res = await reportIssue({ category, subject, description, page });
    setSending(false);
    if (!res.ok) return void toast.error(res.error);
    setSent(true);
    setSubject("");
    setDescription("");
    myIssues().then(setMine);
  };

  return (
    <Modal open={open} onClose={() => !sending && onClose()} title="Report an issue" className="h-auto max-h-[92dvh] sm:max-w-lg">
      <div className="border-b px-5 py-3">
        <Segmented
          label="Report an issue"
          value={tab}
          onChange={setTab}
          options={[
            { value: "new", label: "New report" },
            { value: "mine", label: `Your reports${mine?.length ? ` (${mine.length})` : ""}` },
          ]}
        />
      </div>
      {tab === "new" ? (
        sent ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <p className="text-base font-semibold">Thanks, we got it</p>
            <p className="max-w-sm text-sm text-muted-foreground">Our team looks at every report. You&apos;ll see the status and our answer under Your reports.</p>
            <div className="flex gap-2 pt-2">
              <button type="button" className={buttonClass("outline")} onClick={() => setTab("mine")}>
                Your reports
              </button>
              <button type="button" className={buttonClass()} onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div className="space-y-1.5">
                <span className="label-caps block">What&apos;s it about?</span>
                <SelectBox label="Category" value={category} onChange={(v) => setCategory(v as IssueCategory)} options={(Object.keys(ISSUE_CATEGORIES) as IssueCategory[]).map((k) => ({ value: k, label: ISSUE_CATEGORIES[k] }))} />
              </div>
              <label className="block space-y-1.5">
                <span className="label-caps block">Summary</span>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} className={inputClass} placeholder="e.g. Reviews from last week are missing" autoFocus />
              </label>
              <label className="block space-y-1.5">
                <span className="label-caps block">Details</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  maxLength={4000}
                  className={`${inputClass} resize-y`}
                  placeholder={category === "idea" ? "What would you like to do, and why would it help?" : "What were you doing, what happened, and what did you expect?"}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                We&apos;ll include the page you&apos;re on (<code className="rounded bg-muted px-1">{pathname}</code>) and your name and email so we can reply.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={sending}>
                Cancel
              </button>
              <button type="submit" className={buttonClass()} disabled={sending || subject.trim().length < 3 || description.trim().length < 10}>
                {sending && <Loader2 className="animate-spin" />} Send report
              </button>
            </div>
          </form>
        )
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {mine == null ? (
            <p className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </p>
          ) : mine.length ? (
            <ul className="divide-y">
              {mine.map((i) => (
                <li key={i.id} className="space-y-2 px-5 py-3">
                  <div className="flex items-start gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{i.subject}</span>
                      <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
                        {i.reporterName} · {formatDistanceToNow(parseISO(i.createdAt), { addSuffix: true })}
                      </span>
                    </span>
                    <Badge variant={ISSUE_STATUS[i.status].variant} pill>
                      {ISSUE_STATUS[i.status].label}
                    </Badge>
                  </div>
                  {i.reply && (
                    <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                      <MessageSquareReply className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block whitespace-pre-wrap">{i.reply.text}</span>
                        <span className="mt-1 block text-xs text-muted-foreground" suppressHydrationWarning>
                          {i.reply.by} · {formatDistanceToNow(parseISO(i.reply.at), { addSuffix: true })}
                        </span>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nothing reported from this workspace yet.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
