"use client";

// Small pieces shared by the task list, board, calendar and dialog.
import { CalendarDays, Check, ClipboardCheck, ListChecks, MessageSquareWarning, Star } from "lucide-react";
import type { Task, TaskPriority, TaskStage } from "@/lib/gbp/types";
import { dueIn, dueLabel, priorityInfo, stageInfo } from "@/lib/tasks";
import { cn, initials } from "@/lib/utils";

export interface TaskMember {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export function MemberAvatar({ member, className }: { member?: TaskMember | null; className?: string }) {
  if (!member)
    return (
      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground", className)} title="Unassigned">
        <span className="sr-only">Unassigned</span>
      </span>
    );
  return member.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- data: URLs / Google photo URLs
    <img src={member.avatarUrl} alt="" title={member.name} referrerPolicy="no-referrer" className={cn("h-6 w-6 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span title={member.name} className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground", className)}>
      {initials(member.name)}
    </span>
  );
}

export function PriorityBadge({ priority, compact }: { priority: TaskPriority; compact?: boolean }) {
  const p = priorityInfo(priority);
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold", p.cls)} title={`${p.label} priority`}>
      <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
      {!compact && p.label}
    </span>
  );
}

export function StageDot({ stage, className }: { stage: TaskStage; className?: string }) {
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", stageInfo(stage).dot, className)} />;
}

/** Due date chip: red when overdue, amber when due today. */
export function DueChip({ task, className }: { task: Pick<Task, "dueDate" | "stage">; className?: string }) {
  const label = dueLabel(task);
  if (!label) return null;
  const d = dueIn(task)!;
  const done = task.stage === "done";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-xs",
        done ? "text-muted-foreground" : d < 0 ? "font-semibold text-destructive" : d === 0 ? "font-semibold text-warning" : "text-muted-foreground",
        className,
      )}
      title={task.dueDate ?? undefined}
    >
      <CalendarDays className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export function SubtaskCount({ subtasks }: { subtasks: Task[] }) {
  if (!subtasks.length) return null;
  const done = subtasks.filter((s) => s.stage === "done").length;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs tabular-nums", done === subtasks.length ? "text-success" : "text-muted-foreground")} title="Subtasks done">
      <ListChecks className="h-3.5 w-3.5" />
      {done}/{subtasks.length}
    </span>
  );
}

/** "Review ★2" chip on review follow-ups, "Audit" on tasks from the profile audit checklist. */
export function SourceBadge({ task }: { task: Task }) {
  if (task.source?.type === "audit")
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-foreground" title="From the profile audit checklist">
        <ClipboardCheck className="h-3 w-3" />
        Audit
      </span>
    );
  if (task.source?.type !== "review") return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-warning/10 px-1.5 py-0.5 text-[11px] font-semibold text-warning" title={`Follow-up for ${task.source.reviewer}'s ${task.source.rating}-star review`}>
      <MessageSquareWarning className="h-3 w-3" />
      Review
      <span className="inline-flex items-center gap-0.5">
        {task.source.rating}
        <Star className="h-2.5 w-2.5 fill-current" />
      </span>
    </span>
  );
}

/** Round checkbox: marks a task done / not done. */
export function DoneToggle({ done, onToggle, label, size = "md" }: { done: boolean; onToggle: () => void; label: string; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
        size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]",
        done ? "border-success bg-success text-white" : "border-muted-foreground/40 text-transparent hover:border-success hover:text-success/60",
      )}
    >
      <Check className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={3} />
    </button>
  );
}
