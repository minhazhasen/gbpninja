// Tasks: stages, priorities and small helpers shared by the list, board and calendar views.
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Review, Task, TaskPriority, TaskStage } from "@/lib/gbp/types";

export const TASK_STAGES: { key: TaskStage; label: string; dot: string }[] = [
  { key: "todo", label: "To do", dot: "bg-muted-foreground/50" },
  { key: "in_progress", label: "In progress", dot: "bg-info" },
  { key: "in_review", label: "In review", dot: "bg-warning" },
  { key: "done", label: "Done", dot: "bg-success" },
];
export const TASK_PRIORITIES: { key: TaskPriority; label: string; cls: string; dot: string }[] = [
  { key: "urgent", label: "Urgent", cls: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  { key: "high", label: "High", cls: "bg-warning/10 text-warning", dot: "bg-warning" },
  { key: "medium", label: "Medium", cls: "bg-info/10 text-info", dot: "bg-info" },
  { key: "low", label: "Low", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" },
];
export const stageInfo = (k: TaskStage) => TASK_STAGES.find((s) => s.key === k) ?? TASK_STAGES[0];
export const priorityInfo = (k: TaskPriority) => TASK_PRIORITIES.find((p) => p.key === k) ?? TASK_PRIORITIES[2];
export const isTaskStage = (v: unknown): v is TaskStage => TASK_STAGES.some((s) => s.key === v);
export const isTaskPriority = (v: unknown): v is TaskPriority => TASK_PRIORITIES.some((p) => p.key === v);

export const TASK_VIEWS = ["list", "board", "calendar"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

/** Days until due (negative = overdue); null without a due date. */
export function dueIn(t: Pick<Task, "dueDate">, today = new Date()) {
  return t.dueDate ? differenceInCalendarDays(parseISO(t.dueDate), today) : null;
}
export const isOverdue = (t: Pick<Task, "dueDate" | "stage">) => t.stage !== "done" && (dueIn(t) ?? 0) < 0;

/** "Today", "Tomorrow", "Yesterday", "Mon", "Oct 28". */
export function dueLabel(t: Pick<Task, "dueDate">) {
  const d = dueIn(t);
  if (d == null || !t.dueDate) return null;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  const date = parseISO(t.dueDate);
  return d > 1 && d < 7 ? format(date, "EEE") : format(date, date.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy");
}

/** Order value that sorts between two neighbours (either may be missing). */
export function orderBetween(before?: number, after?: number) {
  if (before == null && after == null) return 0;
  if (before == null) return after! - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}

/** Top-level tasks for one stage, in board order. */
export const byOrder = (a: Task, b: Task) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);

/** Unhappy reviews get a follow-up task until the follow-up is resolved. */
export const needsFollowUpTask = (r: Review) => !r.hidden && r.rating <= 3 && r.followUp?.type !== "resolved";
