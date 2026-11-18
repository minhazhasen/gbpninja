import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Bug, CalendarClock, ChevronLeft, ListTodo } from "lucide-react";
import { AdminHistory, WorkspaceHeader, WorkspaceMembers, WorkspaceNotes } from "@/components/admin/workspace-detail";
import { ConnectionsCard, NoInsights, OverviewPanels, ProfilesTable } from "@/components/admin/workspace-insights";
import { ActivityTimeline } from "@/components/admin/workspace-activity";
import { WorkspaceOffers } from "@/components/admin/workspace-offers";
import { Badge, Card, PanelHeader, PillTabs, SectionLink } from "@/components/ui";
import { cachedInsights, getWorkspace, listIssues, listLeads, listLog, listOffers, listPlatformTasks, offerHiddenReason, offerSentAt, workspaceInsights } from "@/lib/platform/store";
import type { Workspace } from "@/lib/platform/types";
import { ISSUE_STATUS, LEAD_STATUS } from "@/lib/platform/types";
import { stageInfo } from "@/lib/tasks";

export const metadata = { title: "Workspace" };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "profiles", label: "Profiles" },
  { id: "activity", label: "Activity" },
  { id: "people", label: "People" },
  { id: "support", label: "Support" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** One workspace for the platform team, in tabs (`?tab=`): Overview, Profiles, Activity, People (members + connections), Support. */
export default async function AdminWorkspacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : "overview";
  const wsId = decodeURIComponent(id);
  const [workspace, log, offers, issues, leads, tasks] = await Promise.all([
    getWorkspace(wsId),
    listLog(),
    listOffers(),
    listIssues(),
    listLeads(),
    listPlatformTasks(),
  ]);
  // The Google numbers stream in below (Suspense); the header uses the last ones read, when there are any.
  const insights = cachedInsights(wsId);
  if (!workspace) notFound();
  const offerRows = offers.map((o) => ({ offer: o, hidden: offerHiddenReason(o, workspace), sentAt: offerSentAt(workspace.id, o.id) }));
  const mine = {
    issues: issues.filter((i) => i.workspaceId === workspace.id).slice(0, 8),
    meetings: leads.filter((l) => l.workspaceId === workspace.id).slice(0, 8),
    tasks: tasks.filter((t) => !t.parentId && t.locationId === workspace.id && t.stage !== "done").slice(0, 8),
  };
  const history = log.filter((e) => e.target?.includes(workspace.name)).slice(0, 20);
  const base = `/admin/workspaces/${encodeURIComponent(workspace.id)}`;
  const href = (t: Tab) => (t === "overview" ? base : `${base}?tab=${t}`);
  const openSupport = mine.issues.filter((i) => i.status !== "resolved" && i.status !== "closed").length + mine.tasks.length;
  const counts: Partial<Record<Tab, number>> = {
    profiles: insights?.profiles.length ?? workspace.profiles.length,
    activity: insights?.activity.length,
    people: workspace.members.length,
    support: openSupport || undefined,
  };

  return (
    <div className="space-y-5 pb-8">
      <Link href="/admin/workspaces" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Workspaces
      </Link>
      <WorkspaceHeader workspace={workspace} score={insights?.totals.score} />
      <PillTabs label="Workspace sections" items={TABS.map((t) => ({ href: href(t.id), label: t.label, active: tab === t.id, count: counts[t.id] }))} />

      {tab !== "support" && (
        <Suspense key={tab} fallback={<InsightsLoading />}>
          <InsightsTab wsId={wsId} tab={tab} workspace={workspace} history={history} activityHref={href("activity")} />
        </Suspense>
      )}

      {tab === "support" && (
      <div className="grid items-start gap-5 lg:grid-cols-2">
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
        <WorkspaceNotes workspace={workspace} />
      </div>
      )}
    </div>
  );
}

/** Overview / Profiles / Activity / People: wait for the workspace's 30-day numbers (cached 10 minutes in the store). */
async function InsightsTab({ wsId, tab, workspace, history, activityHref }: { wsId: string; tab: Tab; workspace: Workspace; history: Parameters<typeof AdminHistory>[0]["history"]; activityHref: string }) {
  const insights = await workspaceInsights(wsId).catch(() => null);
  if (tab === "overview") return insights ? <OverviewPanels insights={insights} activityHref={activityHref} /> : <NoInsights />;
  if (tab === "profiles")
    return insights ? (
      <ProfilesTable insights={insights} />
    ) : (
      <Card className="overflow-hidden">
        <PanelHeader title="Profiles" meta={workspace.profiles.length || undefined} />
        <ul className="divide-y">
          {workspace.profiles.map((p) => (
            <li key={p.id} className="px-5 py-3 lg:px-6">
              <p className="truncate text-sm font-semibold">{p.title}</p>
              <p className="truncate text-xs text-muted-foreground">{p.address}</p>
            </li>
          ))}
        </ul>
        {!workspace.profiles.length && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No profiles connected yet.</p>}
      </Card>
    );
  if (tab === "activity")
    return (
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {insights ? <ActivityTimeline activity={insights.activity} /> : <NoInsights />}
        <AdminHistory history={history} />
      </div>
    );
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <WorkspaceMembers workspace={workspace} />
      {insights ? <ConnectionsCard insights={insights} /> : <NoInsights />}
    </div>
  );
}

function InsightsLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading this workspace's numbers">
      <Card className="grid grid-cols-2 overflow-hidden lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 border-l px-5 py-4 first:border-l-0">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-6 w-16 animate-pulse rounded bg-muted" />
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </Card>
      <Card className="space-y-3 p-5">
        <p className="text-sm text-muted-foreground">Reading the last 30 days from Google…</p>
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      </Card>
    </div>
  );
}
