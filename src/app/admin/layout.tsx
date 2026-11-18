import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { platformMember } from "@/lib/admin";
import { listIssues, listLeads, listPlatformTasks } from "@/lib/platform/store";
import { isUpcomingMeeting } from "@/lib/platform/types";
import { setupChecklist } from "@/lib/platform/setup";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Platform admin · GBPNinja", template: "%s · Admin · GBPNinja" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await platformMember();
  // Not on the platform team: the panel doesn't exist for them.
  if (!me) notFound();
  const [leads, issues, tasks, setup] = await Promise.all([listLeads(), listIssues(), listPlatformTasks(), setupChecklist().catch(() => [])]);
  return (
    <AdminShell
      admin={me.email}
      badges={{
        meetings: leads.filter((l) => isUpcomingMeeting(l)).length,
        issues: issues.filter((i) => i.status === "open").length,
        tasks: tasks.filter((t) => !t.parentId && t.stage !== "done" && t.assigneeId === me.id).length,
        integrations: setup.filter((i) => !i.ok && !i.optional).length,
      }}
    >
      {children}
    </AdminShell>
  );
}
