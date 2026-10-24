"use client";

// Create / edit a task: title, description, subtasks (each with assignee + due date) and the properties panel.
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ChevronDown, ExternalLink, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { DateField } from "@/components/date-time-field";
import { buttonClass, inputClass } from "@/components/ui";
import { Modal, SelectBox, useConfirm } from "@/components/ui-client";
import type { Task, TaskPatch, TaskPriority, TaskStage } from "@/lib/gbp/types";
import { TASK_PRIORITIES, TASK_STAGES } from "@/lib/tasks";
import { AUDIT_TABS, type AuditTab } from "@/lib/audit";
import { cn } from "@/lib/utils";
import { DoneToggle, DueChip, MemberAvatar, PLATFORM_SOURCE, type TaskMember } from "./task-bits";

export interface SubtaskDraft {
  title: string;
  assigneeId: string | null;
  dueDate: string | null;
}
export interface TaskDraft {
  title: string;
  description: string | null;
  stage: TaskStage;
  priority: TaskPriority;
  assigneeId: string | null;
  dueDate: string | null;
  locationId: string | null;
  subtasks: SubtaskDraft[];
}

const fromTask = (t: Task | null, preset: Partial<TaskDraft>): TaskDraft =>
  t
    ? { title: t.title, description: t.description ?? null, stage: t.stage, priority: t.priority, assigneeId: t.assigneeId ?? null, dueDate: t.dueDate ?? null, locationId: t.locationId ?? null, subtasks: [] }
    : { title: "", description: null, stage: "todo", priority: "medium", assigneeId: null, dueDate: null, locationId: null, subtasks: [], ...preset };

export function TaskDialog({
  open,
  task,
  preset,
  subtasks,
  members,
  locations,
  memberOf,
  onClose,
  onCreate,
  onPatch,
  onToggleDone,
  onAddSubtask,
  onDelete,
  scope = { label: "Location", all: "All locations" },
}: {
  open: boolean;
  /** null = new task */
  task: Task | null;
  preset: Partial<TaskDraft>;
  subtasks: Task[];
  members: TaskMember[];
  locations: { id: string; title: string }[];
  memberOf: (id?: string | null) => TaskMember | null;
  onClose: () => void;
  onCreate: (draft: TaskDraft) => Promise<boolean>;
  onPatch: (id: string, patch: TaskPatch) => Promise<boolean>;
  onToggleDone: (t: Task) => void;
  onAddSubtask: (parentId: string, title: string) => Promise<boolean>;
  onDelete: (t: Task) => void;
  /** What `locationId` means here: a location (workspace tasks) or a workspace (platform admin tasks). */
  scope?: { label: string; all: string };
}) {
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = useState<TaskDraft>(() => fromTask(task, preset));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSub, setNewSub] = useState("");
  const [addingSub, setAddingSub] = useState(false);

  // Reset when opening, or when switching to another task.
  useEffect(() => {
    if (!open) return;
    setDraft(fromTask(task, preset));
    setError(null);
    setNewSub("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const original = task ? fromTask(task, {}) : null;
  const changes: TaskPatch = {};
  if (original)
    for (const k of ["title", "description", "stage", "priority", "assigneeId", "dueDate", "locationId"] as const)
      if ((draft[k] ?? null) !== (original[k] ?? null)) Object.assign(changes, { [k]: k === "description" ? draft.description?.trim() || null : k === "title" ? draft.title.trim() : draft[k] });
  const dirty = Object.keys(changes).length > 0;

  const close = async () => {
    if (saving) return;
    if ((task ? dirty : draft.title.trim() || draft.subtasks.length) && !(await confirm({ title: "Discard changes?", description: "What you typed in this task will be lost.", confirmLabel: "Discard", tone: "danger" }))) return;
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return setError("Give the task a title");
    setSaving(true);
    setError(null);
    const ok = task ? !dirty || (await onPatch(task.id, changes)) : await onCreate({ ...draft, title: draft.title.trim(), description: draft.description?.trim() || null });
    setSaving(false);
    if (ok) onClose();
  };

  const addSubtask = async () => {
    const title = newSub.trim();
    if (!title) return;
    if (!task) {
      set("subtasks", [...draft.subtasks, { title, assigneeId: null, dueDate: null }]);
      return setNewSub("");
    }
    setAddingSub(true);
    if (await onAddSubtask(task.id, title)) setNewSub("");
    setAddingSub(false);
  };

  const remove = async () => {
    if (!task) return;
    const ok = await confirm({
      title: "Delete this task?",
      description: task.source?.type === "review" ? "Its subtasks are deleted too, and no new follow-up is created for this review." : subtasks.length ? `Its ${subtasks.length} subtask${subtasks.length === 1 ? "" : "s"} are deleted too.` : "This can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (ok) onDelete(task);
  };

  const memberOptions = [{ value: "", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))];
  const doneSubs = task ? subtasks.filter((s) => s.stage === "done").length : 0;
  const subCount = task ? subtasks.length : draft.subtasks.length;

  return (
    <Modal open={open} onClose={close} title={task ? (task.parentId ? "Subtask" : "Task") : "New task"} className="h-auto max-h-[94dvh] sm:max-w-3xl">
      {dialog}
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[1fr_250px]">
          <div className="min-w-0 space-y-5 p-5">
            <div className="space-y-2">
              <input
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Task title"
                aria-label="Task title"
                maxLength={200}
                autoFocus={!task}
                className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 -mx-2 text-lg font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60 hover:border-input focus:border-input focus:bg-card"
              />
              <textarea
                value={draft.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Add details, links or notes"
                aria-label="Description"
                rows={3}
                maxLength={5000}
                className={cn(inputClass, "min-h-[84px] resize-y")}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Subtasks</h3>
                {subCount > 0 && <span className="text-xs tabular-nums text-muted-foreground">{task ? `${doneSubs}/${subCount} done` : subCount}</span>}
              </div>
              {task && subCount > 0 && (
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${(doneSubs / subCount) * 100}%` }} />
                </div>
              )}
              <ul className="divide-y rounded-lg border empty:hidden">
                {task
                  ? subtasks.map((s) => (
                      <SubtaskRow
                        key={s.id}
                        title={s.title}
                        done={s.stage === "done"}
                        assigneeId={s.assigneeId ?? null}
                        dueDate={s.dueDate ?? null}
                        members={memberOptions}
                        memberOf={memberOf}
                        onToggle={() => onToggleDone(s)}
                        onChange={(p) => onPatch(s.id, p)}
                        onDelete={() => onDelete(s)}
                      />
                    ))
                  : draft.subtasks.map((s, i) => (
                      <SubtaskRow
                        key={i}
                        title={s.title}
                        assigneeId={s.assigneeId}
                        dueDate={s.dueDate}
                        members={memberOptions}
                        memberOf={memberOf}
                        onChange={(p) => set("subtasks", draft.subtasks.map((x, j) => (j === i ? { ...x, ...p } : x)))}
                        onDelete={() => set("subtasks", draft.subtasks.filter((_, j) => j !== i))}
                      />
                    ))}
              </ul>
              {!task?.parentId && (
                <div className="flex gap-2">
                  <input
                    value={newSub}
                    onChange={(e) => setNewSub(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSubtask();
                      }
                    }}
                    placeholder="Add a subtask"
                    aria-label="New subtask"
                    maxLength={200}
                    className={cn(inputClass, "h-9 py-1.5")}
                  />
                  <button type="button" className={buttonClass("outline")} onClick={addSubtask} disabled={!newSub.trim() || addingSub}>
                    {addingSub ? <Loader2 className="animate-spin" /> : <Plus />} Add
                  </button>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-4 border-t bg-muted/30 p-5 md:border-l md:border-t-0">
            <Prop label="Stage">
              <SelectBox label="Stage" value={draft.stage} onChange={(v) => set("stage", v as TaskStage)} options={TASK_STAGES.map((s) => ({ value: s.key, label: s.label }))} />
            </Prop>
            <Prop label="Priority">
              <SelectBox label="Priority" value={draft.priority} onChange={(v) => set("priority", v as TaskPriority)} options={TASK_PRIORITIES.map((p) => ({ value: p.key, label: p.label }))} />
            </Prop>
            <Prop label="Assignee">
              <div className="flex items-center gap-2">
                <MemberAvatar member={memberOf(draft.assigneeId)} />
                <SelectBox label="Assignee" value={draft.assigneeId ?? ""} onChange={(v) => set("assigneeId", v || null)} options={memberOptions} className="flex-1" />
              </div>
            </Prop>
            <Prop label="Due date">
              <DateField value={draft.dueDate ?? ""} onChange={(v) => set("dueDate", v || null)} placeholder="No due date" />
            </Prop>
            {!task?.parentId && (
              <Prop label={scope.label}>
                <SelectBox label={scope.label} value={draft.locationId ?? ""} onChange={(v) => set("locationId", v || null)} options={[{ value: "", label: scope.all }, ...locations.map((l) => ({ value: l.id, label: l.title }))]} />
              </Prop>
            )}
            {task?.source?.type === "review" && (
              <div className="space-y-2 rounded-lg border bg-card p-3">
                <p className="label-caps">From a review</p>
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  {task.source.reviewer}
                  <span className="inline-flex items-center gap-0.5 text-xs text-warning">
                    {task.source.rating}
                    <Star className="h-3 w-3 fill-current" />
                  </span>
                </p>
                {task.source.excerpt && <p className="line-clamp-3 text-xs text-muted-foreground">“{task.source.excerpt}”</p>}
                <Link href={`/reviews?location=${encodeURIComponent(task.locationId ?? "")}&review=${encodeURIComponent(task.source.reviewId)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  Open review <ExternalLink className="h-3 w-3" />
                </Link>
                <p className="text-[11px] text-muted-foreground">Moving this task to Done marks the review&apos;s follow-up as resolved.</p>
              </div>
            )}
            {task?.source?.type === "audit" && (
              <div className="space-y-2 rounded-lg border bg-card p-3">
                <p className="label-caps">From the profile audit</p>
                <Link
                  href={`/audit?location=${encodeURIComponent(task.locationId ?? "")}${AUDIT_TABS.includes(task.source.section as AuditTab) ? `&tab=${task.source.section}` : ""}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  Fix it in Profile audit <ExternalLink className="h-3 w-3" />
                </Link>
                <p className="text-[11px] text-muted-foreground">Marked done automatically once the profile passes this check.</p>
              </div>
            )}
            {task?.source?.type === "platform" && (
              <div className="space-y-2 rounded-lg border bg-card p-3">
                <p className="label-caps">Linked {PLATFORM_SOURCE[task.source.kind].label.toLowerCase()}</p>
                <p className="line-clamp-2 text-sm font-semibold">{task.source.label}</p>
                <Link href={task.source.href} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  {PLATFORM_SOURCE[task.source.kind].open} <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}
            {task && (
              <p className="text-xs text-muted-foreground">
                {task.source && task.source.type !== "platform" ? "Created automatically" : `Created by ${memberOf(task.createdBy)?.name ?? "someone"}`} {formatDistanceToNow(parseISO(task.createdAt), { addSuffix: true })}
              </p>
            )}
          </aside>
        </div>

        <div className="flex items-center gap-2 border-t px-5 py-3">
          {task && (
            <button type="button" className={buttonClass("ghost", "default", "text-destructive hover:bg-destructive/10")} onClick={remove}>
              <Trash2 /> <span className="hidden sm:inline">Delete</span>
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" className={buttonClass("outline")} onClick={close} disabled={saving}>
              {task && !dirty ? "Close" : "Cancel"}
            </button>
            <button type="submit" className={buttonClass()} disabled={saving || !draft.title.trim() || (!!task && !dirty)}>
              {saving && <Loader2 className="animate-spin" />} {task ? "Save changes" : "Create task"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="label-caps">{label}</p>
      {children}
    </div>
  );
}

/** Subtask: done toggle, title, assignee + due date (expand to edit), delete. */
function SubtaskRow({
  title,
  done,
  assigneeId,
  dueDate,
  members,
  memberOf,
  onToggle,
  onChange,
  onDelete,
}: {
  title: string;
  done?: boolean;
  assigneeId: string | null;
  dueDate: string | null;
  members: { value: string; label: string }[];
  memberOf: (id?: string | null) => TaskMember | null;
  onToggle?: () => void;
  onChange: (p: { assigneeId?: string | null; dueDate?: string | null }) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-2.5">
        {onToggle ? <DoneToggle size="sm" done={!!done} onToggle={onToggle} label={done ? `Mark "${title}" not done` : `Mark "${title}" done`} /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />}
        <span className={cn("min-w-0 flex-1 truncate text-sm", done && "text-muted-foreground line-through")}>{title}</span>
        <DueChip task={{ dueDate, stage: done ? "done" : "todo" }} className="hidden sm:inline-flex" />
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Assignee and due date for "${title}"`} className="flex items-center gap-1 rounded-md p-0.5 hover:bg-muted">
          <MemberAvatar member={memberOf(assigneeId)} className="h-5 w-5 text-[9px]" />
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        <button type="button" onClick={onDelete} aria-label={`Delete "${title}"`} className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="mt-2 grid gap-2 pl-6 sm:grid-cols-2">
          <SelectBox label="Subtask assignee" value={assigneeId ?? ""} onChange={(v) => onChange({ assigneeId: v || null })} options={members} />
          <DateField value={dueDate ?? ""} onChange={(v) => onChange({ dueDate: v || null })} placeholder="No due date" />
        </div>
      )}
    </li>
  );
}
