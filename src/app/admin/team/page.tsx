import { TeamBoard } from "@/components/admin/team-board";
import { PageHeader } from "@/components/ui";
import { platformMember, platformTeam } from "@/lib/admin";
import { listPlatformTasks } from "@/lib/platform/store";

export const metadata = { title: "Team" };

export default async function AdminTeamPage() {
  const [me, tasks] = await Promise.all([platformMember(), listPlatformTasks()]);
  const openTasks: Record<string, number> = {};
  for (const t of tasks) if (!t.parentId && t.stage !== "done" && t.assigneeId) openTasks[t.assigneeId] = (openTasks[t.assigneeId] ?? 0) + 1;
  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Team">Admins and staff who run the platform</PageHeader>
      <TeamBoard team={platformTeam()} me={me} openTasks={openTasks} />
    </div>
  );
}
