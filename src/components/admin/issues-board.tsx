"use client";

// Admin → Issues: problems and ideas reported from the app's account menu ("Report an issue"). Status, assignee, an answer the
// reporter sees in the app, private notes, and a linked task. `?status=` filters, `?issue=<id>` opens one.
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import { ArrowUpRight, Bug, ChevronRight, ListTodo, Loader2, Mail, Search, Send, Trash2 } from "lucide-react";
import { Avatar, Badge, Card, EmptyState, StatStrip, buttonClass, inputClass } from "@/components/ui";
import { Modal, SelectBox, useConfirm } from "@/components/ui-client";
import { createLinkedTask, deleteIssue, replyToIssue, saveIssue } from "@/app/admin/actions";
import { ISSUE_CATEGORIES, ISSUE_STATUS, isOpenIssue, type Issue, type IssueFilter, type IssueStatus, type PlatformTeamMember } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

const ago = (iso: string) => formatDistanceToNow(parseISO(iso), { addSuffix: true });

export function IssuesBoard({
  issues,
  team,
  filter,
  openId: initialOpen,
  taskFor,
}: {
  issues: Issue[];
  team: PlatformTeamMember[];
  filter: IssueFilter;
  openId: string | null;
  /** Open task linked to each issue (issue id → task id). */
  taskFor: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("all");
  const current = issues.find((i) => i.id === openId) ?? null;
  const teamName = (id?: string | null) => team.find((m) => m.id === id)?.name ?? null;

  const count = (s: IssueStatus) => issues.filter((i) => i.status === s).length;
  const resolved30 = issues.filter((i) => (i.status === "resolved" || i.status === "closed") && i.resolvedAt && Date.now() - new Date(i.resolvedAt).getTime() < 30 * 86_400_000).length;
  const unanswered = issues.filter((i) => isOpenIssue(i) && !i.reply).length;
  const byFilter = filter === "all" ? issues : filter === "resolved" ? issues.filter((i) => !isOpenIssue(i)) : issues.filter((i) => i.status === filter);
  const q = search.trim().toLowerCase();
  const shown = byFilter.filter(
    (i) =>
      (!q || [i.subject, i.description, i.workspaceName, i.reporterName, i.reporterEmail].some((v) => v.toLowerCase().includes(q))) &&
      (assignee === "all" || (assignee === "none" ? !i.assigneeId : i.assigneeId === assignee)),
  );

  const go = (next: URLSearchParams) => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  const setFilter = (f: IssueFilter) => {
    const next = new URLSearchParams(params.toString());
    if (f === "open") next.delete("status");
    else next.set("status", f);
    go(next);
  };
  const open = (id: string | null) => {
    setOpenId(id);
    if (!id && params.get("issue")) {
      const next = new URLSearchParams(params.toString());
      next.delete("issue");
      go(next);
    }
  };

  const tabs: { key: IssueFilter; label: string; count: number }[] = [
    { key: "open", label: "Open", count: count("open") },
    { key: "in_progress", label: "In progress", count: count("in_progress") },
    { key: "resolved", label: "Resolved", count: issues.filter((i) => !isOpenIssue(i)).length },
    { key: "all", label: "All", count: issues.length },
  ];

  return (
    <>
      <StatStrip
        items={[
          { label: "Open", value: count("open"), hint: "Not picked up yet", alert: count("open") > 0, onClick: () => setFilter("open"), active: filter === "open" },
          { label: "In progress", value: count("in_progress"), onClick: () => setFilter("in_progress"), active: filter === "in_progress" },
          { label: "Not answered", value: unanswered, hint: "Open, no reply to the reporter" },
          { label: "Resolved", value: resolved30, hint: "Last 30 days" },
        ]}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <nav aria-label="Issue status" className="no-scrollbar flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              aria-current={filter === t.key ? "page" : undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors",
                filter === t.key ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {t.label}
              <span className="text-xs tabular-nums opacity-70">{t.count}</span>
            </button>
          ))}
        </nav>
        <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
          <div className="relative min-w-0 flex-1 basis-48 lg:max-w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search issues" aria-label="Search issues" className={cn(inputClass, "h-9 py-1.5 pl-9")} />
          </div>
          <SelectBox
            label="Assignee"
            value={assignee}
            onChange={setAssignee}
            className="w-full sm:w-44"
            options={[{ value: "all", label: "Anyone" }, { value: "none", label: "Unassigned" }, ...team.map((m) => ({ value: m.id, label: m.name }))]}
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {shown.length ? (
          <ul className="divide-y">
            {shown.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => open(i.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:px-5 lg:px-6">
                  <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", isOpenIssue(i) ? "bg-warning/10 text-warning" : "bg-success/10 text-success")}>
                    <Bug className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{i.subject}</span>
                    <span className="block truncate text-xs text-muted-foreground" suppressHydrationWarning>
                      {i.workspaceName} · {i.reporterName || i.reporterEmail} · {ISSUE_CATEGORIES[i.category]} · {ago(i.createdAt)}
                    </span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-2 sm:flex">
                    {i.reply && <span className="text-xs text-muted-foreground">Answered</span>}
                    {teamName(i.assigneeId) && <Avatar name={teamName(i.assigneeId)!} className="h-6 w-6 text-[10px]" />}
                    <Badge variant={ISSUE_STATUS[i.status].variant} pill>
                      {ISSUE_STATUS[i.status].label}
                    </Badge>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={q || assignee !== "all" ? "No issues match" : filter === "open" ? "No open issues" : "No issues here"}>
            {q || assignee !== "all" ? "Try another search or assignee." : "Customers report issues from the account menu in the app (Report an issue)."}
          </EmptyState>
        )}
      </Card>

      {current && <IssueDialog key={current.id} issue={current} team={team} taskId={taskFor[current.id] ?? null} onClose={() => open(null)} />}
    </>
  );
}

function IssueDialog({ issue: i, team, taskId, onClose }: { issue: Issue; team: PlatformTeamMember[]; taskId: string | null; onClose: () => void }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [status, setStatus] = useState<IssueStatus>(i.status);
  const [assigneeId, setAssigneeId] = useState(i.assigneeId ?? "");
  const [note, setNote] = useState(i.adminNote ?? "");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"save" | "reply" | "task" | null>(null);
  const dirty = status !== i.status || (assigneeId || null) !== (i.assigneeId ?? null) || note.trim() !== (i.adminNote ?? "");

  const save = async () => {
    setBusy("save");
    const res = await saveIssue(i.id, { status, assigneeId: assigneeId || null, adminNote: note });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Issue saved");
    router.refresh();
  };
  const sendReply = async () => {
    setBusy("reply");
    const res = await replyToIssue(i.id, reply);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    setReply("");
    if (status === "open") setStatus("in_progress");
    toast.success("Answer sent", { description: "They see it under their report in the app." });
    router.refresh();
  };
  const addTask = async () => {
    setBusy("task");
    const res = await createLinkedTask("issue", i.id);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Task added", { action: { label: "Open", onClick: () => router.push(`/admin/tasks?task=${res.id}`) } });
    router.refresh();
  };
  const remove = async () => {
    if (!(await confirm({ title: "Delete this issue?", description: "It's removed for the reporter too. This can't be undone.", confirmLabel: "Delete", tone: "danger" }))) return;
    const res = await deleteIssue(i.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Issue deleted");
    onClose();
    router.refresh();
  };

  return (
    <Modal open onClose={onClose} title={i.subject} className="h-auto max-h-[94dvh] sm:max-w-3xl">
      {dialog}
      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[1fr_260px]">
        <div className="space-y-4 p-5">
          <div className="space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" suppressHydrationWarning>
              <Badge variant="secondary" pill>
                {ISSUE_CATEGORIES[i.category]}
              </Badge>
              Reported {ago(i.createdAt)}
              {i.page && (
                <>
                  {" "}
                  on <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{i.page}</code>
                </>
              )}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{i.description}</p>
          </div>

          <div className="space-y-2">
            <span className="label-caps block">Answer to the reporter</span>
            {i.reply && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="whitespace-pre-wrap">{i.reply.text}</p>
                <p className="mt-1 text-xs text-muted-foreground" suppressHydrationWarning>
                  {i.reply.by} · {ago(i.reply.at)}
                </p>
              </div>
            )}
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={i.reply ? "Write a new answer (replaces the one above)" : "What you found, or what happens next"}
              className={`${inputClass} resize-y`}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Shown in their app under Report an issue.</span>
              <button type="button" className={buttonClass("default", "sm")} disabled={!reply.trim() || busy === "reply"} onClick={sendReply}>
                {busy === "reply" ? <Loader2 className="animate-spin" /> : <Send />} Send answer
              </button>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="label-caps block">Private notes</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} placeholder="Only the platform team sees these" className={`${inputClass} resize-y`} />
          </label>
        </div>

        <aside className="space-y-4 border-t bg-muted/20 p-5 md:border-l md:border-t-0">
          <div className="space-y-1.5">
            <span className="label-caps block">Status</span>
            <SelectBox label="Status" value={status} onChange={(v) => setStatus(v as IssueStatus)} options={(Object.keys(ISSUE_STATUS) as IssueStatus[]).map((k) => ({ value: k, label: ISSUE_STATUS[k].label }))} />
          </div>
          <div className="space-y-1.5">
            <span className="label-caps block">Assignee</span>
            <SelectBox label="Assignee" value={assigneeId} onChange={setAssigneeId} options={[{ value: "", label: "Unassigned" }, ...team.map((m) => ({ value: m.id, label: m.name }))]} />
          </div>
          <div className="space-y-1.5">
            <span className="label-caps block">Reported by</span>
            <p className="text-sm font-semibold">{i.reporterName || "—"}</p>
            <a href={`mailto:${i.reporterEmail}?subject=${encodeURIComponent(`Re: ${i.subject}`)}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <Mail className="h-3.5 w-3.5" /> {i.reporterEmail}
            </a>
          </div>
          <div className="space-y-1.5">
            <span className="label-caps block">Workspace</span>
            <Link href={`/admin/workspaces/${encodeURIComponent(i.workspaceId)}`} className="inline-flex items-center gap-1 text-sm font-semibold hover:underline">
              {i.workspaceName} <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </div>
          <div className="space-y-1.5">
            <span className="label-caps block">Task</span>
            {taskId ? (
              <Link href={`/admin/tasks?task=${taskId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                <ListTodo className="h-4 w-4" /> Open task
              </Link>
            ) : (
              <button type="button" className={buttonClass("outline", "sm")} onClick={addTask} disabled={busy === "task"}>
                {busy === "task" ? <Loader2 className="animate-spin" /> : <ListTodo />} Add task
              </button>
            )}
          </div>
        </aside>
      </div>
      <div className="flex items-center gap-2 border-t px-5 py-3">
        <button type="button" className={buttonClass("ghost", "sm", "text-muted-foreground hover:text-destructive")} onClick={remove}>
          <Trash2 /> Delete
        </button>
        <div className="flex-1" />
        <button type="button" className={buttonClass("outline")} onClick={onClose}>
          Close
        </button>
        <button type="button" className={buttonClass()} disabled={!dirty || busy === "save"} onClick={save}>
          {busy === "save" && <Loader2 className="animate-spin" />} Save
        </button>
      </div>
    </Modal>
  );
}
