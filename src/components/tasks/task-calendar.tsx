"use client";

// Calendar view: tasks on their due dates. Drag a task to another day (or from "No due date") to reschedule it.
import { useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, buttonClass } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import type { Task } from "@/lib/gbp/types";
import { priorityInfo } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { MemberAvatar, PriorityBadge, SourceBadge } from "./task-bits";
import type { TaskViewProps } from "./tasks-board";

const MAX_PER_DAY = 3;
const NO_DATE = "no-date";

export function TaskCalendar({ tasks, memberOf, onOpen, onPatch, onNew }: TaskViewProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));

  const start = startOfWeek(startOfMonth(month));
  const end = endOfWeek(endOfMonth(month));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const onDay = (key: string) => tasks.filter((t) => t.dueDate === key).sort((a, b) => Number(a.stage === "done") - Number(b.stage === "done") || a.title.localeCompare(b.title));
  const undated = tasks.filter((t) => !t.dueDate && t.stage !== "done");
  const monthKey = format(month, "yyyy-MM");
  const agenda = days.filter((d) => isSameMonth(d, month)).map((d) => ({ d, key: format(d, "yyyy-MM-dd") })).filter(({ key }) => onDay(key).length);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    const dueDate = over.id === NO_DATE ? null : String(over.id);
    if (task && (task.dueDate ?? null) !== dueDate) onPatch(task.id, { dueDate });
  };
  const active = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <DndContext id="task-calendar" sensors={sensors} collisionDetection={pointerWithin} onDragStart={({ active }) => setActiveId(String(active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5">
          <h2 className="mr-auto text-base font-semibold tracking-tight">{format(month, "MMMM yyyy")}</h2>
          <button type="button" className={buttonClass("outline", "sm")} onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </button>
          <button type="button" className={buttonClass("ghost", "icon")} onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
            <ChevronLeft />
          </button>
          <button type="button" className={buttonClass("ghost", "icon")} onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
            <ChevronRight />
          </button>
        </div>

        {/* Tablet and up: month grid */}
        <div className="hidden md:block">
          <div className="grid grid-cols-7 border-b">
            {days.slice(0, 7).map((d) => (
              <div key={d.toISOString()} className="label-caps px-2 py-2 text-center font-medium">
                {format(d, "EEE")}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const key = format(d, "yyyy-MM-dd");
              const list = onDay(key);
              return (
                <DayCell key={key} id={key} date={d} inMonth={isSameMonth(d, month)} lastCol={i % 7 === 6} onAdd={() => onNew({ dueDate: key })}>
                  {list.slice(0, MAX_PER_DAY).map((t) => (
                    <DraggableChip key={t.id} task={t} onOpen={() => onOpen(t)} />
                  ))}
                  {list.length > MAX_PER_DAY && (
                    <button type="button" onClick={() => setDayOpen(key)} className="w-full rounded px-1.5 text-left text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                      +{list.length - MAX_PER_DAY} more
                    </button>
                  )}
                </DayCell>
              );
            })}
          </div>
        </div>

        {/* Phones: agenda for the month */}
        <div className="md:hidden">
          {agenda.length ? (
            <ul className="divide-y">
              {agenda.map(({ d, key }) => (
                <li key={key} className="flex gap-3 px-4 py-3">
                  <div className={cn("w-11 shrink-0 text-center", isToday(d) ? "text-primary" : "text-muted-foreground")}>
                    <p className="text-[11px] font-semibold uppercase">{format(d, "EEE")}</p>
                    <p className="text-lg font-semibold leading-tight">{format(d, "d")}</p>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {onDay(key).map((t) => (
                      <AgendaRow key={t.id} task={t} assignee={memberOf(t.assigneeId)} onOpen={() => onOpen(t)} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No tasks due in {format(month, "MMMM")}</p>
          )}
        </div>
      </Card>

      <UndatedTray tasks={undated} onOpen={onOpen} monthKey={monthKey} />

      <Modal open={!!dayOpen} onClose={() => setDayOpen(null)} title={dayOpen ? format(parseISO(dayOpen), "EEEE, MMM d") : ""} className="h-auto max-h-[80dvh] sm:max-w-md">
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4">
          {dayOpen &&
            onDay(dayOpen).map((t) => (
              <AgendaRow
                key={t.id}
                task={t}
                assignee={memberOf(t.assigneeId)}
                onOpen={() => {
                  setDayOpen(null);
                  onOpen(t);
                }}
              />
            ))}
        </ul>
      </Modal>

      {typeof document !== "undefined" &&
        createPortal(<DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>{active ? <Chip task={active} overlay /> : null}</DragOverlay>, document.body)}
    </DndContext>
  );
}

function DayCell({ id, date, inMonth, lastCol, onAdd, children }: { id: string; date: Date; inMonth: boolean; lastCol: boolean; onAdd: () => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("group/day min-h-[118px] border-b p-1.5 transition-colors", !lastCol && "border-r", !inMonth && "bg-muted/30", isOver && "bg-accent/60")}>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold", isToday(date) ? "bg-primary text-primary-foreground" : inMonth ? "text-foreground" : "text-muted-foreground/60")}>
          {format(date, "d")}
        </span>
        <button type="button" onClick={onAdd} className="flex h-5 w-5 items-center justify-center rounded text-sm text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/day:opacity-100" aria-label={`Add task due ${format(date, "MMM d")}`}>
          +
        </button>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function DraggableChip({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onOpen} className={cn("rounded outline-none focus-visible:ring-2 focus-visible:ring-ring", isDragging && "opacity-30")}>
      <Chip task={task} />
    </div>
  );
}

function Chip({ task: t, overlay }: { task: Task; overlay?: boolean }) {
  const done = t.stage === "done";
  return (
    <div
      title={t.title}
      className={cn(
        "flex cursor-grab items-center gap-1.5 truncate rounded-md border bg-card px-1.5 py-1 text-[11px] font-medium shadow-sm hover:border-input",
        done && "text-muted-foreground line-through",
        overlay && "w-44 cursor-grabbing shadow-elegant",
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", priorityInfo(t.priority).dot)} />
      <span className="truncate">{t.title}</span>
    </div>
  );
}

function AgendaRow({ task: t, assignee, onOpen }: { task: Task; assignee: ReturnType<TaskViewProps["memberOf"]>; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left hover:bg-muted/40">
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium", t.stage === "done" && "text-muted-foreground line-through")}>{t.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <PriorityBadge priority={t.priority} />
          <SourceBadge task={t} />
        </span>
      </span>
      <MemberAvatar member={assignee} />
    </button>
  );
}

/** Open tasks without a due date; drag one onto a day to schedule it (or a dated task here to clear its date). */
function UndatedTray({ tasks, onOpen, monthKey }: { tasks: Task[]; onOpen: (t: Task) => void; monthKey: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: NO_DATE });
  return (
    <div ref={setNodeRef} key={monthKey} className={cn("mt-4 rounded-xl border bg-card px-4 py-3 transition-colors sm:px-5", isOver && "bg-accent/40")}>
      <p className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
        No due date <span className="text-xs font-normal text-muted-foreground">{tasks.length ? "Drag onto a day to schedule" : "Every open task has a date"}</span>
      </p>
      {tasks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tasks.map((t) => (
            <div key={t.id} className="w-48 max-w-full">
              <DraggableChip task={t} onOpen={() => onOpen(t)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
