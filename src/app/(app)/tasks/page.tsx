import { TasksBoard } from "@/components/tasks/tasks-board";
import { getProvider } from "@/lib/gbp";
import { resolveLocation } from "@/lib/location";
import { TASK_VIEWS, type TaskView } from "@/lib/tasks";

type Params = { location?: string; view?: string; task?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { location } = await resolveLocation(searchParams);
  const sp = await searchParams;
  const provider = await getProvider();
  const [tasks, members, locations, me] = await Promise.all([provider.listTasks(), provider.listMembers(), provider.listLocations(), provider.getCurrentMember()]);
  // This location's tasks plus workspace-wide ones (no location); subtasks come along with their task.
  const here = (t: { locationId?: string | null }) => t.locationId == null || t.locationId === location.id;
  const parents = new Set(tasks.filter((t) => !t.parentId && here(t)).map((t) => t.id));
  return (
    <TasksBoard
      key={location.id}
      location={{ id: location.id, title: location.title }}
      tasks={tasks.filter((t) => (t.parentId ? parents.has(t.parentId) : parents.has(t.id)))}
      members={members.filter((m) => m.status === "active").map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl ?? m.googleAvatarUrl ?? null }))}
      locations={locations.map(({ id, title }) => ({ id, title }))}
      meId={me.id}
      view={TASK_VIEWS.includes(sp.view as TaskView) ? (sp.view as TaskView) : "list"}
      openTaskId={sp.task ?? null}
    />
  );
}
