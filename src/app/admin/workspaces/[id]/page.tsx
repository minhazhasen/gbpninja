import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Bug, CalendarClock, ChevronLeft, ListTodo } from "lucide-react";
import { WorkspaceDetail } from "@/components/admin/workspace-detail";
import { WorkspaceInsightsPanels } from "@/components/admin/workspace-insights";
import { WorkspaceOffers } from "@/components/admin/workspace-offers";
import { Badge, Card, PanelHeader, SectionLink } from "@/components/ui";
import { getWorkspace, listIssues, listLeads, listLog, listOffers, listPlatformTasks, offerHiddenReason, offerSentAt, workspaceInsights } from "@/lib/platform/store";
import { ISSUE_STATUS, LEAD_STATUS } from "@/lib/platform/types";
import { stageInfo } from "@/lib/tasks";

export default async function AdminWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wsId = decodeURIComponent(id);
  const [workspace, log, offers, issues, leads, tasks, insights] = await Promise.all([
    getWorkspace(wsId),
    listLog(),
    listOffers(),
    listIssues(),
    listLeads(),
    listPlatformTasks(),
    workspaceInsights(wsId).catch(() => null),
  ]);
  if (!workspace) notFound();
  const offerRows = offers.map((o) => ({ offer: o, hidden: offerHiddenReason(o, workspace), sentAt: offerSentAt(workspace.id, o.id) }));
  const mine = {
    issues: issues.filter((i) => i.workspaceId === workspace.id).slice(0, 6),
    meetings: leads.filter((l) => l.workspaceId === workspace.id).slice(0, 6),
    tasks: tasks.filter((t) => !t.parentId && t.locationId === workspace.id && t.stage !== "done").slice(0, 6),
  };

  return (
    <div className="space-y-5 pb-8">
      <Link href="/admin/workspaces" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Workspaces
      </Link>
      <WorkspaceDetail workspace={workspace} history={log.filter((e) => e.target?.includes(workspace.name)).slice(0, 8)} hideProfiles={!!insights}>
        <WorkspaceInsightsPanels insights={insights} />
      </WorkspaceDetail>

      <div className="grid gap-5 lg:grid-cols-2">
        <WorkspaceOffers workspace={{ id: workspace.id, name: workspace.name }} rows={offerRows} />
        <Card className="overflow-hidden">
          <PanelHeader title="Meetings" meta={mine.meetings.length || undefined} action={<SectionLink href="/admin/meetings?filter=all">All</SectionLink>} />
          {mine.meetings.length ? (
            <ul className="divide-y">
              {mine.meetings.map((l) => (
                <li key={l.id}>
                  <Link href={`/admin/meetings?filter=all&meeting=${l.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-muted/40 lg:px-6">
                    <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate" suppressHydrationWarning>
                      {format(parseISO(l.meetingAt), "d MMM, HH:mm")} · {l.name}
                    </span>
                    <Badge variant={LEAD_STATUS[l.status].variant} pill>
                      {LEAD_STATUS[l.status].label}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-center text-sm text-muted-foreground">No meetings booked.</p>
          )}
        </Card>
        <Card className="overflow-hidden">
          <PanelHeader title="Issues" meta={mine.issues.length || undefined} action={<SectionLink href="/admin/issues?status=all">All</SectionLink>} />
          {mine.issues.length ? (
            <ul className="divide-y">
              {mine.issues.map((i) => (
                <li key={i.id}>
                  <Link href={`/admin/issues?issue=${i.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-muted/40 lg:px-6">
                    <Bug className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{i.subject}</span>
                    <Badge variant={ISSUE_STATUS[i.status].variant} pill>
                      {ISSUE_STATUS[i.status].label}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-center text-sm text-muted-foreground">No issues reported.</p>
          )}
        </Card>
        <Card className="overflow-hidden">
          <PanelHeader title="Team tasks" meta={mine.tasks.length || undefined} action={<SectionLink href="/admin/tasks">All</SectionLink>} />
          {mine.tasks.length ? (
            <ul className="divide-y">
              {mine.tasks.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/tasks?task=${t.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-muted/40 lg:px-6">
                    <ListTodo className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{stageInfo(t.stage).label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-center text-sm text-muted-foreground">No open tasks about this workspace.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
