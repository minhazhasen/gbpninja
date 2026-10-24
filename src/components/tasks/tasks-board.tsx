"use client";

// Tasks page: review follow-ups (automatic) and team tasks with subtasks, in list, Kanban board and calendar views.
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Columns3, List, Plus, Search } from "lucide-react";
import { PageHeader, StatStrip, buttonClass, inputClass } from "@/components/ui";
import { Segmented, SelectBox } from "@/components/ui-client";
import { createTask, deleteTask, updateTask } from "@/app/(app)/actions";
import type { Task, TaskPatch, TaskStage } from "@/lib/gbp/types";
import { TASK_PRIORITIES, byOrder, dueIn, type TaskView } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import type { TaskMember } from "./task-bits";
import { TaskCalendar } from "./task-calendar";
import { TaskDialog, type TaskDraft } from "./task-dialog";
import { TaskKanban } from "./task-kanban";
import { TaskList } from "./task-list";

export interface TaskViewProps {
  tasks: Task[];
  subtasksOf: (id: string) => Task[];
  memberOf: (id?: string | null) => TaskMember | null;
  /** Small label under a task's title for its location / workspace (null = none). */
  scopeOf: (locationId?: string | null) => string | null;
  emptyHint?: string;
  onOpen: (task: Task) => void;
  onPatch: (id: string, patch: TaskPatch) => void;
  onToggleDone: (task: Task) => void;
  onNew: (preset: Partial<TaskDraft>) => void;
}

const VIEWS: { value: TaskView; label: React.ReactNode }[] = [
  {
    value: "list",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <List className="h-4 w-4" />
        List
      </span>
    ),
  },
  {
    value: "board",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Columns3 className="h-4 w-4" />
        Board
      </span>
    ),
  },
  {
    value: "calendar",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <CalendarDays className="h-4 w-4" />
        Calendar
      </span>
    ),
  },
];

type Res = { ok: true; id: string } | { ok: false; error: string };
/** Where tasks are saved: the workspace (default) or, in the platform admin panel, the platform team's own list. */
export interface TaskApi {
  create: (input: Parameters<typeof createTask>[0]) => Promise<Res>;
  update: (id: string, patch: TaskPatch) => Promise<Res>;
  remove: (id: string) => Promise<Res>;
}
const WORKSPACE_API: TaskApi = { create: createTask, update: updateTask, remove: deleteTask };

/** Platform admin tasks: `locationId` is the workspace a task is about; type filter = linked meeting / issue / workspace. */
export interface PlatformTaskOptions {
  subtitle: string;
  scope: { label: string; all: string };
}

export function TasksBoard({
  location,
  tasks: initial,
  members,
  locations,
  meId,
  view,
  openTaskId,
  api = WORKSPACE_API,
  platform,
}: {
  /** null on the platform admin's board (no location). */
  location: { id: string; title: string } | null;
  tasks: Task[];
  members: TaskMember[];
  locations: { id: string; title: string }[];
  meId: string;
  view: TaskView;
  openTaskId: string | null;
  api?: TaskApi;
  platform?: PlatformTaskOptions;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [tasks, setTasks] = useState(initial);
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [priority, setPriority] = useState("all");
  const [type, setType] = useState("all");
  const [dialog, setDialog] = useState<{ id: string | null; preset?: Partial<TaskDraft> } | null>(openTaskId ? { id: openTaskId } : null);

  // Server data wins after each refresh; local edits are optimistic until then.
  useEffect(() => setTasks(initial), [initial]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const memberOf = (id?: string | null) => (id ? (memberById.get(id) ?? null) : null);
  const subtasks = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) if (t.parentId) map.set(t.parentId, [...(map.get(t.parentId) ?? []), t]);
    for (const list of map.values()) list.sort(byOrder);
    return map;
  }, [tasks]);
  const subtasksOf = (id: string) => subtasks.get(id) ?? [];

  const parents = tasks.filter((t) => !t.parentId);
  const q = search.trim().toLowerCase();
  const shown = parents.filter(
    (t) =>
      (!q || t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || subtasksOf(t.id).some((s) => s.title.toLowerCase().includes(q))) &&
      (assignee === "all" || (assignee === "me" ? t.assigneeId === meId : assignee === "none" ? !t.assigneeId : t.assigneeId === assignee)) &&
      (priority === "all" || t.priority === priority) &&
      (type === "all" || (type === "team" ? !t.source : t.source?.type === type || (t.source?.type === "platform" && t.source.kind === type))),
  );

  const open = parents.filter((t) => t.stage !== "done");
  const overdue = open.filter((t) => (dueIn(t) ?? 0) < 0).length;
  const today = open.filter((t) => dueIn(t) === 0).length;
  const reviewOpen = open.filter((t) => t.source?.type === "review").length;
  const issueOpen = open.filter((t) => t.source?.type === "platform" && t.source.kind === "issue").length;
  const nameOf = useMemo(() => new Map(locations.map((l) => [l.id, l.title])), [locations]);
  const scopeOf = (id?: string | null) => (platform ? (id ? (nameOf.get(id) ?? null) : null) : id ? null : "All locations");

  const setView = (v: TaskView) => {
    const next = new URLSearchParams(params.toString());
    next.set("view", v);
    next.delete("task");
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  const applyLocal = (id: string, patch: TaskPatch) =>
    setTasks((ts) =>
      ts.map((t) => (t.id === id ? { ...t, ...patch, completedAt: patch.stage && patch.stage !== t.stage ? (patch.stage === "done" ? new Date().toISOString() : null) : t.completedAt } : t)),
    );

  const patchTask = async (id: string, patch: TaskPatch) => {
    const before = tasks;
    applyLocal(id, patch);
    const res = await api.update(id, patch);
    if (!res.ok) {
      setTasks(before);
      toast.error(res.error);
      return false;
    }
    router.refresh();
    return true;
  };

  const toggleDone = async (t: Task) => {
    const stage: TaskStage = t.stage === "done" ? "todo" : "done";
    const ok = await patchTask(t.id, { stage });
    if (ok && stage === "done" && !t.parentId)
      toast.success(t.source?.type === "review" ? "Follow-up done, review marked resolved" : "Task done", {
        action: { label: "Undo", onClick: () => patchTask(t.id, { stage: t.stage }) },
      });
  };

  const current = dialog?.id ? (tasks.find((t) => t.id === dialog.id) ?? null) : null;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Tasks"
        actions={
          <button type="button" className={buttonClass()} onClick={() => setDialog({ id: null })}>
            <Plus /> New task
          </button>
        }
      >
        {platform ? platform.subtitle : `Review follow-ups and team work for ${location?.title ?? ""}`}
      </PageHeader>

      <StatStrip
        items={[
          { label: "Open tasks", value: String(open.length), hint: `${parents.length - open.length} done` },
          { label: "Due today", value: String(today), hint: today ? "Keep these moving" : "Nothing due today" },
          { label: "Overdue", value: String(overdue), hint: overdue ? "Past their due date" : "All on track", alert: overdue > 0 },
          platform
            ? {
                label: "Issues to fix",
                value: String(issueOpen),
                hint: "Reported from the app",
                onClick: () => setType((t) => (t === "issue" ? "all" : "issue")),
                active: type === "issue",
              }
            : {
                label: "Review follow-ups",
                value: String(reviewOpen),
                hint: "Unhappy reviews to close",
                onClick: () => setType((t) => (t === "review" ? "all" : "review")),
                active: type === "review",
              },
        ]}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented label="Task view" value={view} onChange={setView} options={VIEWS} />
        <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
          <div className="relative min-w-0 flex-1 basis-48 lg:max-w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className={cn(inputClass, "h-9 py-1.5 pl-9")} />
          </div>
          <SelectBox
            label="Assignee"
            value={assignee}
            onChange={setAssignee}
            className="w-[calc(50%-0.25rem)] sm:w-40"
            options={[{ value: "all", label: "Anyone" }, { value: "me", label: "Assigned to me" }, { value: "none", label: "Unassigned" }, ...members.filter((m) => m.id !== meId).map((m) => ({ value: m.id, label: m.name }))]}
          />
          <SelectBox label="Priority" value={priority} onChange={setPriority} className="w-[calc(50%-0.25rem)] sm:w-36" options={[{ value: "all", label: "Any priority" }, ...TASK_PRIORITIES.map((p) => ({ value: p.key, label: p.label }))]} />
          <SelectBox
            label="Type"
            value={type}
            onChange={setType}
            className="w-full sm:w-44"
            options={
              platform
                ? [
                    { value: "all", label: "All tasks" },
                    { value: "issue", label: "Issues" },
                    { value: "meeting", label: "Meetings" },
                    { value: "workspace", label: "Workspaces" },
                    { value: "team", label: "Other tasks" },
                  ]
                : [
                    { value: "all", label: "All tasks" },
                    { value: "review", label: "Review follow-ups" },
                    { value: "audit", label: "Profile audit" },
                    { value: "team", label: "Team tasks" },
                  ]
            }
          />
        </div>
      </div>

      {(() => {
        const props: TaskViewProps = {
          tasks: shown,
          subtasksOf,
          memberOf,
          scopeOf,
          emptyHint: platform ? "Create a task, or add one from a meeting, issue or workspace." : undefined,
          onOpen: (t) => setDialog({ id: t.id }),
          onPatch: patchTask,
          onToggleDone: toggleDone,
          onNew: (preset) => setDialog({ id: null, preset }),
        };
        if (view === "board") return <TaskKanban {...props} />;
        if (view === "calendar") return <TaskCalendar {...props} />;
        return <TaskList {...props} filtered={shown.length !== parents.length} />;
      })()}

      <TaskDialog
        open={!!dialog && (!dialog.id || !!current)}
        task={current}
        preset={{ locationId: location?.id ?? null, ...dialog?.preset }}
        scope={platform?.scope}
        subtasks={current ? subtasksOf(current.id) : []}
        members={members}
        locations={locations}
        memberOf={memberOf}
        onClose={() => {
          setDialog(null);
          if (params.get("task")) {
            const next = new URLSearchParams(params.toString());
            next.delete("task");
            router.replace(`${pathname}?${next}`, { scroll: false });
          }
        }}
        onCreate={async (draft) => {
          const res = await api.create(draft);
          if (!res.ok) return toast.error(res.error), false;
          toast.success("Task created");
          router.refresh();
          return true;
        }}
        onPatch={patchTask}
        onToggleDone={toggleDone}
        onAddSubtask={async (parentId, title) => {
          const res = await api.create({ title, parentId, stage: "todo", priority: "medium" });
          if (!res.ok) return toast.error(res.error), false;
          router.refresh();
          return true;
        }}
        onDelete={async (t) => {
          const before = tasks;
          setTasks((ts) => ts.filter((x) => x.id !== t.id && x.parentId !== t.id));
          const res = await api.remove(t.id);
          if (!res.ok) {
            setTasks(before);
            return void toast.error(res.error);
          }
          if (!t.parentId) setDialog(null);
          toast.success(t.parentId ? "Subtask deleted" : "Task deleted");
          router.refresh();
        }}
      />
    </div>
  );
}
