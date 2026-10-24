import Link from "next/link";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { Bug, Clock, ListTodo, Megaphone, PlugZap, ShieldAlert, Tag } from "lucide-react";
import { QuickAction } from "@/components/admin/quick-action";
import { Card, PageHeader, PanelHeader, SectionLink, StatStrip, buttonClass } from "@/components/ui";
import { platformMember } from "@/lib/admin";
import { listIssues, listLeads, listLog, listOffers, listPlatformTasks, listWorkspaces } from "@/lib/platform/store";
import { setupChecklist } from "@/lib/platform/setup";
import { isUpcomingMeeting } from "@/lib/platform/types";
import { fmt } from "@/lib/utils";

type Todo = { key: string; icon: React.ElementType; tone: string; title: string; action: React.ReactNode };

export default async function AdminOverviewPage() {
  const [workspaces, offers, log, leads, issues, tasks, me] = await Promise.all([listWorkspaces(), listOffers(), listLog(), listLeads(), listIssues(), listPlatformTasks(), platformMember()]);
  const openIssues = issues.filter((i) => i.status === "open").length;
  const today = new Date().toISOString().slice(0, 10);
  const myDue = tasks.filter((t) => !t.parentId && t.stage !== "done" && t.assigneeId === me?.id && t.dueDate && t.dueDate <= today).length;
  const newLeads = leads.filter((l) => l.status === "booked").length;
  const moveRequests = leads.filter((l) => (l.changeRequest || l.cancelRequest) && l.status === "booked").length;
  const missing = setupChecklist().filter((s) => !s.ok).length;

  const users = workspaces.reduce((n, w) => n + w.members.filter((m) => m.status === "active").length, 0);
  const profiles = workspaces.reduce((n, w) => n + w.profiles.length, 0);
  const upcoming = leads.filter((l) => isUpcomingMeeting(l)).length;
  const suspended = workspaces.filter((w) => w.status === "suspended");
  const link = (href: string, label: string) => (
    <Link href={href} className={buttonClass("outline", "sm")}>
      {label}
    </Link>
  );

  // Each row: what's wrong in a few words + the one action that fixes it.
  const todos: Todo[] = [
    ...(moveRequests
      ? [
          {
            key: "moves",
            icon: Clock,
            tone: "bg-warning/10 text-warning",
            title: `${moveRequests} meeting request${moveRequests === 1 ? "" : "s"} (new time or cancel)`,
            action: link("/admin/meetings?filter=requests", "Review"),
          },
        ]
      : []),
    ...(newLeads
      ? [{ key: "leads", icon: Tag, tone: "bg-success/10 text-success", title: `${newLeads} offer meeting${newLeads === 1 ? "" : "s"} booked`, action: link("/admin/meetings", "View") }]
      : []),
    ...(openIssues
      ? [{ key: "issues", icon: Bug, tone: "bg-warning/10 text-warning", title: `${openIssues} new issue${openIssues === 1 ? "" : "s"} reported`, action: link("/admin/issues", "Open") }]
      : []),
    ...(myDue
      ? [{ key: "tasks", icon: ListTodo, tone: "bg-info/10 text-info", title: `${myDue} of your tasks due today or overdue`, action: link("/admin/tasks", "Tasks") }]
      : []),
    ...suspended.map((w) => ({
      key: `sus-${w.id}`,
      icon: ShieldAlert,
      tone: "bg-destructive/10 text-destructive",
      title: `${w.name} is suspended`,
      action: <QuickAction kind="reactivate" workspaceId={w.id} label="Reactivate" />,
    })),
    ...(missing
      ? [{ key: "setup", icon: PlugZap, tone: "bg-accent text-accent-foreground", title: `${missing} integration${missing === 1 ? "" : "s"} missing`, action: link("/admin/integrations", "Set up") }]
      : []),
  ];

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Overview"
        actions={
          <Link href="/admin/announcements" className={buttonClass("outline", "sm")}>
            <Megaphone /> Announce
          </Link>
        }
      />

      <StatStrip
        items={[
          { label: "Workspaces", value: fmt(workspaces.length), href: "/admin/workspaces" },
          { label: "Profiles", value: fmt(profiles) },
          { label: "Users", value: fmt(users) },
          { label: "Meetings", value: fmt(upcoming), hint: "Upcoming", href: "/admin/meetings" },
        ]}
      />

      <Card className="overflow-hidden">
        <PanelHeader title="To do" meta={todos.length || undefined} />
        {todos.length ? (
          <ul className="divide-y">
            {todos.map((t) => (
              <li key={t.key} className="flex items-center gap-3 px-5 py-3 lg:px-6">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.tone}`}>
                  <t.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 line-clamp-2 text-sm font-medium sm:truncate">{t.title}</span>
                {t.action}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">All clear.</p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <PanelHeader title="Offers" action={<SectionLink href="/admin/offers">Manage</SectionLink>} />
          <dl className="grid grid-cols-4 divide-x">
            {(
              [
                ["Seen", offers.reduce((n, o) => n + o.views, 0)],
                ["Clicked", offers.reduce((n, o) => n + o.clicks, 0)],
                ["Booked", leads.length],
                ["Won", leads.filter((l) => l.status === "won").length],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="px-5 py-4">
                <dt className="label-caps">{label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{fmt(n)}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t px-5 py-2.5 text-xs text-muted-foreground lg:px-6">
            {offers.filter((o) => o.active).length} live offer{offers.filter((o) => o.active).length === 1 ? "" : "s"}
          </p>
        </Card>
        <Card className="overflow-hidden">
          <PanelHeader title="Recent activity" action={<SectionLink href="/admin/activity">All</SectionLink>} />
          {log.length ? (
            <ul className="divide-y">
              {log.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm lg:px-6">
                  <span className="min-w-0 flex-1 truncate">{e.action}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNowStrict(parseISO(e.at))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
