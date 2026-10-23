import { needsReply } from "@/lib/reviews";
import Link from "next/link";
import { CalendarDays, ChevronRight, ClipboardCheck, MessageSquareText } from "lucide-react";
import { ChartLegend, MetricsChart } from "@/components/metrics-chart";
import { Avatar, Badge, Card, PageHeader, PanelHeader, SectionLink, Stars, StatStrip } from "@/components/ui";
import { auditLocation } from "@/lib/audit";
import { getProvider } from "@/lib/gbp";
import { SyncIssues } from "@/components/sync-issues";
import { resolveLocation } from "@/lib/location";
import { PerformanceControls } from "@/components/performance/performance-controls";
import { rangeFromParams, rangeLabel, rangeToParams } from "@/lib/date-ranges";
import { daysNeeded, periodLabel, rangeView } from "@/lib/metrics";
import { POST_STATUS, postForLocation } from "@/lib/posts";
import { ChannelStack } from "@/components/marketing/channel-icon";
import { delta, fmt, withLocation } from "@/lib/utils";
import { MeetingCard } from "@/components/meeting-card";
import { OfferCard } from "@/components/offer-card";
import { currentWorkspaceId, getWorkspace, offerFor, takenSlots, upcomingMeetingFor } from "@/lib/platform/store";
import { meetingReminderVisible } from "@/lib/platform/types";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function DashboardPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { location } = await resolveLocation(searchParams);
  const range = rangeFromParams(sp, "last28");
  const provider = await getProvider();
  const [points, reviews, allPosts, workspace] = await Promise.all([
    provider.getMetrics(location.id, daysNeeded(range)),
    provider.listReviews(location.id),
    provider.listPosts(),
    getWorkspace((await currentWorkspaceId())),
  ]);
  const issues = (await provider.getSyncIssues?.([location.id])) ?? [];
  // A booked meeting with the platform team (from an offer) replaces the offer card until it's over. Its reminder can be closed;
  // it comes back 1 hour before the meeting or when a new Meet link is sent.
  // Otherwise the live offer: shown from 7 days after sign-up (per offer),
  // every day until the workspace closes it; then hidden for the offer's snooze days.
  const meeting = await upcomingMeetingFor(location.id);
  const offer = !meeting && workspace ? await offerFor(workspace) : null;
  const [taken, me] = meeting || offer ? await Promise.all([takenSlots(), provider.getCurrentMember()]) : [[], null];
  const posts = allPosts.filter((p) => postForLocation(p, location.id));
  const { cur, before: prev, chart, start } = rangeView([points], range, "interactions");
  const audit = auditLocation(location, reviews, allPosts);
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const unreplied = reviews.filter(needsReply);
  const upcoming = posts
    .filter((p): p is typeof p & { scheduled_at: string } => p.status === "scheduled" && !!p.scheduled_at && new Date(p.scheduled_at) > new Date())
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const failed = posts.filter((p) => p.status === "failed" || p.status === "partially_failed");
  const to = (path: string, extra?: Record<string, string>) => withLocation(path, location.id, extra);
  const rangeQs = rangeToParams(range);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const tasks = [
    unreplied.length > 0 && {
      icon: MessageSquareText,
      title: `Reply to ${unreplied.length} review${unreplied.length === 1 ? "" : "s"}`,
      sub: "Unanswered reviews on Google",
      href: to("/reviews", { filter: "unreplied" }),
      tone: "text-warning bg-warning/10",
    },
    failed.length > 0 && {
      icon: CalendarDays,
      title: `${failed.length} post${failed.length === 1 ? "" : "s"} failed to publish`,
      sub: "Retry the failed channels",
      href: to("/calendar", { post: failed[0]?.id ?? "" }),
      tone: "text-destructive bg-destructive/10",
    },
    audit.issues.length > 0 && {
      icon: ClipboardCheck,
      title: `Fix ${audit.issues.length} profile issue${audit.issues.length === 1 ? "" : "s"}`,
      sub: `Profile score ${audit.score}/100`,
      href: to("/audit"),
      tone: "text-accent-foreground bg-accent",
    },
    upcoming.length === 0 && {
      icon: CalendarDays,
      title: "Schedule your next post",
      sub: "Post weekly to stay fresh",
      href: to("/calendar", { compose: "1" }),
      tone: "text-accent-foreground bg-accent",
    },
  ].filter(Boolean) as { icon: React.ElementType; title: string; sub: string; href: string; tone: string }[];

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title={greeting} actions={<PerformanceControls locations={[]} scope={[]} fallback="last28" />}>
        {location.title} · {location.primaryCategory}
      </PageHeader>

      {meeting
        ? meetingReminderVisible(meeting) && (
            <MeetingCard
              // Only what the client may see (never the platform team's private notes).
              meeting={{
                id: meeting.id,
                offerTitle: meeting.offerTitle,
                meetingAt: meeting.meetingAt,
                meetUrl: meeting.meetSharedAt ? meeting.meetUrl : null,
                meetSharedAt: meeting.meetSharedAt,
                name: meeting.name,
                email: meeting.email,
                phone: meeting.phone,
                changeRequest: meeting.changeRequest ?? null,
                changeAnswer: meeting.changeAnswer ?? null,
                cancelRequest: meeting.cancelRequest ?? null,
                cancelAnswer: meeting.cancelAnswer ?? null,
              }}
              locationId={location.id}
              taken={taken}
            />
          )
        : offer && <OfferCard offer={offer} locationId={location.id} taken={taken} me={me ? { name: me.name, email: me.email } : undefined} />}

      <SyncIssues issues={issues} />
      <StatStrip
        cols={5}
        items={[
          {
            label: "Profile views",
            value: fmt(cur.impressions),
            delta: prev ? delta(cur.impressions, prev.impressions) : null,
            hint: prev ? undefined : rangeLabel(range),
            href: to("/performance", { ...rangeQs, series: "impressions" }),
          },
          {
            label: "Interactions",
            value: fmt(cur.interactions),
            delta: prev ? delta(cur.interactions, prev.interactions) : null,
            hint: prev ? undefined : "Calls, clicks, directions",
            href: to("/performance", rangeQs),
          },
          { label: "Avg rating", value: avg.toFixed(1), hint: `${reviews.length} reviews`, href: to("/reviews") },
          {
            label: "Needs reply",
            value: unreplied.length,
            hint: unreplied.length ? "Unanswered reviews" : "All caught up",
            alert: unreplied.length > 0,
            href: to("/reviews", { filter: "unreplied" }),
          },
          { label: "Profile score", value: `${audit.score}`, hint: `${audit.issues.length} issues`, href: to("/audit") },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="min-w-0 overflow-hidden">
          <PanelHeader
            title="Interactions"
            meta={periodLabel(start, range.to)}
            action={
              <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
                <ChartLegend color="var(--viz-1)" label="This period" />
                {prev && <ChartLegend color="hsl(var(--muted-foreground))" label="Previous" dashed />}
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
                <Avatar name={r.reviewer} photo={r.reviewerPhoto} className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{r.reviewer}</span>
                    <Stars rating={r.rating} size="h-3 w-3" />
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{r.comment}</p>
                </div>
                {!r.reply && (
                  <Badge variant="warning" pill>
                    Reply
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="overflow-hidden">
          <PanelHeader title="Upcoming posts" action={<SectionLink href={to("/calendar")}>Calendar</SectionLink>} />
          {upcoming.length ? (
            <ul className="divide-y">
              {upcoming.slice(0, 4).map((p) => {
                const d = new Date(p.scheduled_at);
                return (
                  <li key={p.id}>
                    <Link href={to("/calendar", { post: p.id })} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 lg:px-6">
                      <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border bg-card leading-none">
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">{d.toLocaleDateString("en-US", { month: "short" })}</span>
                        <span className="text-sm font-semibold tabular-nums">{d.getDate()}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{p.title || "Untitled"}</span>
                        <span className="block truncate text-xs text-muted-foreground">{p.body}</span>
                      </span>
                      <ChannelStack channels={p.channels} />
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${POST_STATUS[p.status].tone}`}>{POST_STATUS[p.status].label}</span>
                    </Link>
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
