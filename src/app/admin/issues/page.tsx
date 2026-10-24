import { IssuesBoard } from "@/components/admin/issues-board";
import { PageHeader } from "@/components/ui";
import { platformTeam } from "@/lib/admin";
import { listIssues, listPlatformTasks } from "@/lib/platform/store";
import { ISSUE_FILTERS, type IssueFilter } from "@/lib/platform/types";

export const metadata = { title: "Issues" };

export default async function AdminIssuesPage({ searchParams }: { searchParams: Promise<{ status?: string; issue?: string }> }) {
  const sp = await searchParams;
  const [issues, tasks] = await Promise.all([listIssues(), listPlatformTasks()]);
  const taskFor: Record<string, string> = {};
  for (const t of tasks) if (t.source?.type === "platform" && t.source.kind === "issue" && t.stage !== "done") taskFor[t.source.refId] = t.id;
  const filter = ISSUE_FILTERS.includes(sp.status as IssueFilter) ? (sp.status as IssueFilter) : sp.issue ? "all" : "open";
  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Issues">Problems and ideas reported from the app</PageHeader>
      <IssuesBoard issues={issues} team={platformTeam()} filter={filter} openId={sp.issue ?? null} taskFor={taskFor} />
    </div>
  );
}
