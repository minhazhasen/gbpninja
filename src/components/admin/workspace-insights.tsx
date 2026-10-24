// Admin → one workspace: how its profiles perform and what the team has been doing (last 30 days). Counts only, no review texts.
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { CalendarDays, CheckCircle2, ListTodo, MessageSquareReply, PlugZap, Send, Star, UserPlus } from "lucide-react";
import { Badge, Card, PanelHeader, StatStrip } from "@/components/ui";
import type { WorkspaceInsights } from "@/lib/platform/store";
import { fmt } from "@/lib/utils";

const ICON = {
  post: CalendarDays,
  review: Star,
  reply: MessageSquareReply,
  task: CheckCircle2,
  request: Send,
  member: UserPlus,
  connection: PlugZap,
} as const;

const change = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);

export function WorkspaceInsightsPanels({ insights: x }: { insights: WorkspaceInsights | null }) {
  if (!x)
    return (
      <Card className="px-5 py-8 text-center text-sm text-muted-foreground">
        Activity and performance show for workspaces that use the app. This sample workspace has no data.
      </Card>
    );
  const t = x.totals;
  return (
    <>
      <StatStrip
        items={[
          { label: "Profile views", value: fmt(t.views), delta: change(t.views, t.viewsBefore), hint: change(t.views, t.viewsBefore) == null ? "Last 30 days" : "vs previous 30 days" },
          { label: "Customer actions", value: fmt(t.actions), delta: change(t.actions, t.actionsBefore), hint: change(t.actions, t.actionsBefore) == null ? "Calls, website, directions" : "vs previous 30 days" },
          { label: "Rating", value: t.rating != null ? t.rating.toFixed(1) : "—", hint: `${fmt(t.reviews)} reviews · ${t.newReviews} new` },
          { label: "Reply rate", value: t.replyRate != null ? `${t.replyRate}%` : "—", hint: "Reviews answered" },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <PanelHeader title="Profiles" meta={`${x.profiles.length} · last 30 days`} />
          {x.profiles.length ? (
            <>
              <div className="hidden grid-cols-[minmax(0,1fr)_repeat(5,5.5rem)] gap-2 border-b px-6 py-2 lg:grid">
                {["Profile", "Reviews", "Rating", "Unreplied", "Views", "Actions"].map((h, i) => (
                  <span key={h} className={`label-caps ${i ? "text-right" : ""}`}>
                    {h}
                  </span>
                ))}
              </div>
              <ul className="divide-y">
                {x.profiles.map((p) => (
                  <li key={p.id} className="px-5 py-3 lg:grid lg:grid-cols-[minmax(0,1fr)_repeat(5,5.5rem)] lg:items-center lg:gap-2 lg:px-6">
                    <p className="truncate text-sm font-semibold">{p.title}</p>
                    <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground lg:contents">
                      {(
                        [
                          ["Reviews", fmt(p.reviews)],
                          ["Rating", p.rating != null ? `${p.rating.toFixed(1)}★` : "—"],
                          ["Unreplied", fmt(p.unreplied)],
                          ["Views", fmt(p.views)],
                          ["Actions", fmt(p.actions)],
                        ] as const
                      ).map(([k, v]) => (
                        <div key={k} className="flex gap-1 lg:block lg:text-right">
                          <dt className="lg:sr-only">{k}</dt>
                          <dd className={`font-medium tabular-nums text-foreground lg:text-sm ${k === "Unreplied" && v !== "0" ? "text-warning" : ""}`}>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No profiles connected yet.</p>
          )}
          <dl className="grid grid-cols-2 border-t sm:grid-cols-4">
            {(
              [
                ["Posts published", t.published, `${t.scheduled} scheduled`],
                ["Review requests", t.requests, "sent"],
                ["Tasks done", t.doneTasks, `${t.openTasks} open`],
                ["New reviews", t.newReviews, "received"],
              ] as const
            ).map(([k, v, hint], i) => (
              <div key={k} className={`px-5 py-3 lg:px-6 ${i % 2 ? "border-l" : ""} ${i >= 2 ? "border-t sm:border-t-0" : ""} ${i ? "sm:border-l" : ""}`}>
                <dt className="label-caps truncate">{k}</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {fmt(v)} <span className="text-xs font-normal text-muted-foreground">{hint}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="overflow-hidden">
          <PanelHeader title="Recent activity" meta="30 days" />
          {x.activity.length ? (
            <ul className="max-h-[420px] divide-y overflow-y-auto">
              {x.activity.map((a, i) => {
                const Icon = ICON[a.kind];
                return (
                  <li key={`${a.at}-${i}`} className="flex items-start gap-3 px-5 py-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm">{a.text}</span>
                    <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                      {formatDistanceToNowStrict(parseISO(a.at))}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-muted-foreground">
              <ListTodo className="h-5 w-5" /> No activity in the last 30 days.
            </p>
          )}
          {!!x.connections.length && (
            <div className="flex flex-wrap items-center gap-1.5 border-t px-5 py-3">
              <span className="label-caps mr-1">Connected</span>
              {x.connections.map((c) => (
                <Badge key={c.channel} variant={c.status === "connected" ? "success" : c.status === "not_connected" ? "secondary" : "warning"} pill>
                  {c.channel}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      </div>
      {!!x.errors.length && <p className="text-xs text-muted-foreground">Couldn&apos;t load: {x.errors.join(" · ")}</p>}
    </>
  );
}
