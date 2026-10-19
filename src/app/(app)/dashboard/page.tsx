import Link from "next/link";
import { CalendarDays, ChevronRight, ClipboardCheck, MessageSquareText } from "lucide-react";
import { ChartLegend, MetricsChart } from "@/components/metrics-chart";
import { Avatar, Badge, Card, PageHeader, PanelHeader, SectionLink, Stars, StatStrip } from "@/components/ui";
import { auditLocation } from "@/lib/audit";
import { getProvider } from "@/lib/gbp";
import { resolveLocation, type PageProps } from "@/lib/location";
import { splitCompare, totals } from "@/lib/metrics";
import { POST_STATUS } from "@/lib/posts";
import { delta, fmt, withLocation } from "@/lib/utils";

const DAYS = 28;

export default async function DashboardPage({ searchParams }: PageProps) {
  const { location } = await resolveLocation(searchParams);
  const provider = await getProvider();
  const [points, reviews, posts] = await Promise.all([
    provider.getMetrics(location.id, DAYS * 2),
    provider.listReviews(location.id),
    provider.listPosts(location.id),
  ]);
  const { current, previous, chart } = splitCompare(points, DAYS, "interactions");
  const cur = totals(current);
  const prev = totals(previous);
  const audit = auditLocation(location, reviews);
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const unreplied = reviews.filter((r) => !r.reply);
  const upcoming = posts.filter((p) => p.status === "SCHEDULED" && new Date(p.scheduledFor) > new Date()).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const failed = posts.filter((p) => p.status === "FAILED");
  const to = (path: string, extra?: Record<string, string>) => withLocation(path, location.id, extra);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const tasks = [
    unreplied.length > 0 && { icon: MessageSquareText, title: `Reply to ${unreplied.length} review${unreplied.length === 1 ? "" : "s"}`, sub: "Unanswered reviews on Google", href: to("/reviews", { filter: "unreplied" }), tone: "text-warning bg-warning/10" },
    failed.length > 0 && { icon: CalendarDays, title: `${failed.length} post${failed.length === 1 ? "" : "s"} failed to publish`, sub: "Check and reschedule", href: to("/calendar", { view: "list" }), tone: "text-destructive bg-destructive/10" },
    audit.issues.length > 0 && { icon: ClipboardCheck, title: `Fix ${audit.issues.length} profile issue${audit.issues.length === 1 ? "" : "s"}`, sub: `Profile score ${audit.score}/100`, href: to("/audit"), tone: "text-accent-foreground bg-accent" },
    upcoming.length === 0 && { icon: CalendarDays, title: "Schedule your next post", sub: "Post weekly to stay fresh", href: to("/calendar", { compose: "1" }), tone: "text-accent-foreground bg-accent" },
  ].filter(Boolean) as { icon: React.ElementType; title: string; sub: string; href: string; tone: string }[];

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title={greeting}>
        {location.title} · {location.primaryCategory}
      </PageHeader>

      <StatStrip
        cols={5}
        items={[
          { label: "Profile views", value: fmt(cur.impressions), delta: delta(cur.impressions, prev.impressions), href: to("/performance", { series: "impressions" }) },
          { label: "Interactions", value: fmt(cur.interactions), delta: delta(cur.interactions, prev.interactions), href: to("/performance") },
          { label: "Avg rating", value: avg.toFixed(1), hint: `${reviews.length} reviews`, href: to("/reviews") },
          { label: "Needs reply", value: unreplied.length, hint: unreplied.length ? "Unanswered reviews" : "All caught up", alert: unreplied.length > 0, href: to("/reviews", { filter: "unreplied" }) },
          { label: "Profile score", value: `${audit.score}`, hint: `${audit.issues.length} issues`, href: to("/audit") },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="min-w-0 overflow-hidden">
          <PanelHeader
            title="Interactions"
            meta={`last ${DAYS} days`}
            action={
              <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
                <ChartLegend color="var(--viz-1)" label="This period" />
                <ChartLegend color="hsl(var(--muted-foreground))" label="Previous" dashed />
              </div>
            }
          />
          <MetricsChart data={chart} metric="Interactions" />
        </Card>

        <Card className="overflow-hidden">
          <PanelHeader title="Needs attention" meta={tasks.length || undefined} />
          {tasks.length ? (
            <ul className="divide-y">
              {tasks.map((t) => (
                <li key={t.title}>
                  <Link href={t.href} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.tone}`}>
                      <t.icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{t.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t.sub}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">All caught up.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <PanelHeader title="Latest reviews" action={<SectionLink href={to("/reviews")}>View all</SectionLink>} />
          <ul className="divide-y">
            {reviews.slice(0, 4).map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-5 py-3 lg:px-6">
                <Avatar name={r.reviewer} className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{r.reviewer}</span>
                    <Stars rating={r.rating} size="h-3 w-3" />
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{r.comment}</p>
                </div>
                {!r.reply && <Badge variant="warning" pill>Reply</Badge>}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="overflow-hidden">
          <PanelHeader title="Upcoming posts" action={<SectionLink href={to("/calendar")}>Calendar</SectionLink>} />
          {upcoming.length ? (
            <ul className="divide-y">
              {upcoming.slice(0, 4).map((p) => {
                const d = new Date(p.scheduledFor);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3 lg:px-6">
                    <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border bg-card leading-none">
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">{d.toLocaleDateString("en-US", { month: "short" })}</span>
                      <span className="text-sm font-semibold tabular-nums">{d.getDate()}</span>
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm">{p.summary}</p>
                    <Badge variant={POST_STATUS[p.status].badge} pill>
                      {POST_STATUS[p.status].label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
