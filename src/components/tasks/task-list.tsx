"use client";

// List view: one section per stage (Done collapsed), rows open the task.
import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import type { Task } from "@/lib/gbp/types";
import { TASK_STAGES, byOrder, dueIn } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { DoneToggle, DueChip, MemberAvatar, PriorityBadge, SourceBadge, StageDot, SubtaskCount } from "./task-bits";
import type { TaskViewProps } from "./tasks-board";

/** Open tasks: overdue and soonest due first, then by priority. */
const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
/** Column widths shared by the header and the rows (wide screens; narrower screens stack the meta under the title). */
const COL = { priority: "lg:w-24", due: "lg:w-28", assignee: "lg:w-40", meta: "lg:w-[352px]" } as const;

const listOrder = (a: Task, b: Task) => (dueIn(a) ?? 9999) - (dueIn(b) ?? 9999) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byOrder(a, b);

export function TaskList({ tasks, subtasksOf, memberOf, scopeOf, emptyHint, onOpen, onToggleDone, onNew, filtered }: TaskViewProps & { filtered: boolean }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done: true });

  if (!tasks.length)
    return (
      <Card>
        <EmptyState title={filtered ? "No tasks match these filters" : "No tasks yet"}>{filtered ? "Try another filter or search." : (emptyHint ?? "Create a task, or wait for review follow-ups to show up here.")}</EmptyState>
      </Card>
    );

  return (
    <div className="space-y-4">
      {TASK_STAGES.map((stage) => {
        const rows = tasks.filter((t) => t.stage === stage.key).sort(stage.key === "done" ? (a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : listOrder);
        const isCollapsed = collapsed[stage.key];
        return (
          <Card key={stage.key} className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 sm:px-5">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [stage.key]: !c[stage.key] }))}
                aria-expanded={!isCollapsed}
                className="-ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left"
              >
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                <StageDot stage={stage.key} />
                <span className="text-sm font-semibold">{stage.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{rows.length}</span>
              </button>
              {stage.key !== "done" && (
                <button type="button" onClick={() => onNew({ stage: stage.key })} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Add task to ${stage.label}`}>
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            {!isCollapsed && rows.length > 0 && (
              <div className="hidden items-center gap-3 border-t bg-muted/30 px-4 py-2 sm:px-5 lg:flex" aria-hidden>
                <span className="w-[18px] shrink-0" />
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="label-caps flex-1">Task</span>
                  <div className={cn("flex shrink-0 items-center gap-3", COL.meta)}>
                    <span className={cn("label-caps", COL.priority)}>Priority</span>
                    <span className={cn("label-caps", COL.due)}>Due date</span>
                    <span className={cn("label-caps", COL.assignee)}>Assignee</span>
                  </div>
                </div>
              </div>
            )}
            {!isCollapsed && (
              <ul className="divide-y border-t">
                {rows.map((t) => (
                  <TaskRow key={t.id} task={t} subtasks={subtasksOf(t.id)} assignee={memberOf(t.assigneeId)} scope={scopeOf(t.locationId)} onOpen={() => onOpen(t)} onToggle={() => onToggleDone(t)} />
                ))}
                {!rows.length && <li className="px-5 py-3 text-sm text-muted-foreground">Nothing here</li>}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function TaskRow({
  task: t,
  subtasks,
  assignee,
  scope,
  onOpen,
  onToggle,
}: {
  task: Task;
  subtasks: Task[];
  assignee: ReturnType<TaskViewProps["memberOf"]>;
  scope: string | null;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const done = t.stage === "done";
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      className="group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:outline-none sm:px-5 lg:items-center"
    >
      <span className="pt-0.5 lg:pt-0">
        <DoneToggle done={done} onToggle={onToggle} label={done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`} />
      </span>
      <div className="min-w-0 flex-1 lg:flex lg:items-center lg:gap-4">
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-medium", done && "text-muted-foreground line-through")}>{t.title}</p>
          {(t.source || subtasks.length > 0 || scope) && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <SourceBadge task={t} />
              <SubtaskCount subtasks={subtasks} />
              {scope && <span className="truncate text-xs text-muted-foreground">{scope}</span>}
            </div>
          )}
        </div>
        {/* Narrow: meta wraps under the title; wide: columns under the header */}
        <div className={cn("mt-2 flex items-center gap-3 lg:mt-0 lg:shrink-0", COL.meta)}>
          <span className={COL.priority}>
            <PriorityBadge priority={t.priority} />
          </span>
          <span className={COL.due}>{t.dueDate ? <DueChip task={t} /> : <span className="hidden text-xs text-muted-foreground lg:inline">—</span>}</span>
          <span className={cn("ml-auto flex min-w-0 items-center gap-2 lg:ml-0", COL.assignee)}>
            <MemberAvatar member={assignee} />
            <span className={cn("hidden truncate text-xs lg:inline", assignee ? "text-foreground" : "text-muted-foreground")}>{assignee?.name ?? "Unassigned"}</span>
          </span>
        </div>
      </div>
    </li>
  );
}
