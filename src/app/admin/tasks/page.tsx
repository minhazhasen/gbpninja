import { PlatformTasks } from "@/components/admin/platform-tasks";
import { platformMember, platformTeam } from "@/lib/admin";
import { listPlatformTasks, listWorkspaces } from "@/lib/platform/store";
import { TASK_VIEWS, type TaskView } from "@/lib/tasks";

export const metadata = { title: "Tasks" };

export default async function AdminTasksPage({ searchParams }: { searchParams: Promise<{ view?: string; task?: string }> }) {
  const sp = await searchParams;
  const [tasks, workspaces, me] = await Promise.all([listPlatformTasks(), listWorkspaces(), platformMember()]);
  return (
    <PlatformTasks
      tasks={tasks}
      members={platformTeam().map((m) => ({ id: m.id, name: m.name, avatarUrl: null }))}
      workspaces={workspaces.map((w) => ({ id: w.id, title: w.name }))}
      meId={me?.id ?? ""}
      view={TASK_VIEWS.includes(sp.view as TaskView) ? (sp.view as TaskView) : "list"}
      openTaskId={sp.task ?? null}
    />
  );
}
