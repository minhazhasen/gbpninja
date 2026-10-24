import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { platformMember } from "@/lib/admin";
import { listIssues, listLeads, listPlatformTasks } from "@/lib/platform/store";
import { isUpcomingMeeting } from "@/lib/platform/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await platformMember();
  // Not on the platform team: the panel doesn't exist for them.
  if (!me) notFound();
  const [leads, issues, tasks] = await Promise.all([listLeads(), listIssues(), listPlatformTasks()]);
  return (
    <AdminShell
      admin={me.email}
      badges={{
        meetings: leads.filter((l) => isUpcomingMeeting(l)).length,
        issues: issues.filter((i) => i.status === "open").length,
        tasks: tasks.filter((t) => !t.parentId && t.stage !== "done" && t.assigneeId === me.id).length,
      }}
    >
      {children}
    </AdminShell>
  );
}
