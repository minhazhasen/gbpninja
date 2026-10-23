"use client";

// Kanban board: drag cards between stages and reorder within a stage (dnd-kit sortable, animated).
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import type { Task, TaskStage } from "@/lib/gbp/types";
import { TASK_STAGES, byOrder, isTaskStage, orderBetween } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { DueChip, MemberAvatar, PriorityBadge, SourceBadge, StageDot, SubtaskCount } from "./task-bits";
import type { TaskViewProps } from "./tasks-board";

type Columns = Record<TaskStage, string[]>;
const columnsOf = (tasks: Task[]) => Object.fromEntries(TASK_STAGES.map((s) => [s.key, tasks.filter((t) => t.stage === s.key).sort(byOrder).map((t) => t.id)])) as Columns;
const columnOf = (id: string, cols: Columns): TaskStage | undefined => (isTaskStage(id) ? id : TASK_STAGES.find((s) => cols[s.key].includes(id))?.key);

export function TaskKanban({ tasks, subtasksOf, memberOf, onOpen, onPatch, onNew }: TaskViewProps) {
  // While dragging, cards live in this draft so they can hop between columns before the drop is saved.
  const [draft, setDraft] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const cols = draft ?? columnsOf(tasks);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setDraft(columnsOf(tasks));
  };

  // Crossing into another column: move the card there now so the target column opens a gap for it.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setDraft((c) => {
      if (!c) return c;
      const id = String(active.id);
      const overId = String(over.id);
      const from = columnOf(id, c);
      const to = columnOf(overId, c);
      if (!from || !to || from === to) return c;
      const target = c[to].filter((x) => x !== id);
      let index = isTaskStage(overId) ? target.length : target.indexOf(overId);
      const dragged = active.rect.current.translated;
      if (!isTaskStage(overId) && dragged && dragged.top > over.rect.top + over.rect.height / 2) index += 1;
      target.splice(index, 0, id);
      return { ...c, [from]: c[from].filter((x) => x !== id), [to]: target };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const c = draft;
    setActiveId(null);
    setDraft(null);
    if (!over || !c) return;
    const overId = String(over.id);
    const to = columnOf(id, c);
    if (!to) return;
    let list = c[to];
    // Same column: sortable only animated the move, apply it.
    if (!isTaskStage(overId) && overId !== id && list.includes(overId)) list = arrayMove(list, list.indexOf(id), list.indexOf(overId));
    const i = list.indexOf(id);
    const task = byId.get(id);
    if (!task) return;
    const prev = byId.get(list[i - 1]);
    const next = byId.get(list[i + 1]);
    const original = columnsOf(tasks)[task.stage];
    const unchanged = task.stage === to && original[original.indexOf(id) - 1] === prev?.id && original[original.indexOf(id) + 1] === next?.id;
    if (unchanged) return;
    onPatch(id, { stage: to, order: orderBetween(prev?.order, next?.order) });
  };

  const active = activeId ? byId.get(activeId) : null;

  return (
    <DndContext
      id="task-board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setDraft(null);
      }}
    >
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:snap-none lg:px-0">
        {TASK_STAGES.map((stage) => (
          <Column key={stage.key} stage={stage} ids={cols[stage.key]} onNew={() => onNew({ stage: stage.key })}>
            {cols[stage.key].map((id) => {
              const t = byId.get(id);
              return t ? <SortableCard key={id} task={t} subtasks={subtasksOf(id)} assignee={memberOf(t.assigneeId)} onOpen={() => onOpen(t)} /> : null;
            })}
          </Column>
        ))}
      </div>
      {typeof document !== "undefined" &&
        createPortal(
          <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
            {active ? <Card task={active} subtasks={subtasksOf(active.id)} assignee={memberOf(active.assigneeId)} overlay /> : null}
          </DragOverlay>,
          document.body,
        )}
    </DndContext>
  );
}

function Column({ stage, ids, onNew, children }: { stage: (typeof TASK_STAGES)[number]; ids: string[]; onNew: () => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  return (
    <section className="flex w-[82vw] max-w-[300px] shrink-0 snap-start flex-col rounded-xl border bg-muted/40 sm:w-[280px] lg:w-auto lg:max-w-none lg:min-w-[220px] lg:flex-1" aria-label={stage.label}>
      <header className="flex items-center gap-2 px-3 py-2.5">
        <StageDot stage={stage.key} />
        <h3 className="text-sm font-semibold">{stage.label}</h3>
        <span className="rounded-full bg-card px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">{ids.length}</span>
        {stage.key !== "done" && (
          <button type="button" onClick={onNew} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground" aria-label={`Add task to ${stage.label}`}>
            <Plus className="h-4 w-4" />
          </button>
        )}
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={cn("flex min-h-28 flex-1 flex-col gap-2 rounded-b-xl px-2 pb-2 transition-colors", isOver && "bg-accent/40")}>
          {children}
          {!ids.length && <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">Drop tasks here</p>}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard(props: { task: Task; subtasks: Task[]; assignee: ReturnType<TaskViewProps["memberOf"]>; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={props.onOpen}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter" && !e.defaultPrevented) props.onOpen();
      }}
      aria-label={`${props.task.title}. Press space to move.`}
      className={cn("touch-manipulation rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring", isDragging && "opacity-40")}
    >
      <Card {...props} />
    </div>
  );
}

function Card({ task: t, subtasks, assignee, overlay }: { task: Task; subtasks: Task[]; assignee: ReturnType<TaskViewProps["memberOf"]>; overlay?: boolean }) {
  const done = t.stage === "done";
  return (
    <article
      className={cn(
        "cursor-grab select-none space-y-2.5 rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
        overlay && "rotate-[1.5deg] cursor-grabbing shadow-elegant ring-1 ring-primary/20",
      )}
    >
      {t.source && <SourceBadge task={t} />}
      <p className={cn("text-sm font-medium leading-snug", done && "text-muted-foreground line-through")}>{t.title}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <PriorityBadge priority={t.priority} />
        <DueChip task={t} />
        <SubtaskCount subtasks={subtasks} />
        <MemberAvatar member={assignee} className="ml-auto" />
      </div>
    </article>
  );
}
