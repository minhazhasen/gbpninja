// Admin → one workspace: how its profiles perform and what the team has been doing (last 30 days). Counts only, no review texts.
// Overview tab (stats, trend, needs attention, actions / reviews / content, feature usage), Profiles tab, Connections card.
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { BadgeCheck, Check, CircleAlert, Minus, TriangleAlert } from "lucide-react";
import { Badge, Card, PanelHeader, StarBars, StatStrip } from "@/components/ui";
import { WorkspaceTrend } from "@/components/admin/workspace-trend";
import { RecentActivity } from "@/components/admin/workspace-activity";
import type { WorkspaceInsights } from "@/lib/platform/store";
import { cn, fmt } from "@/lib/utils";

const change = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);
const ago = (iso: string | null) => (iso ? formatDistanceToNowStrict(parseISO(iso), { addSuffix: true }) : "Never");
const scoreTone = (n: number) => (n >= 80 ? "text-success" : n >= 60 ? "text-warning" : "text-destructive");

export function NoInsights() {
  return (
    <Card className="px-5 py-8 text-center text-sm text-muted-foreground">
      Activity and performance show for workspaces that use the app. This sample workspace has no data.
    </Card>
  );
}

export function OverviewPanels({ insights: x, activityHref }: { insights: WorkspaceInsights; activityHref: string }) {
  const t = x.totals;
  const r = x.reviewHealth;
  const viewTotal = x.viewMix.search + x.viewMix.maps;
  return (
    <>
      <StatStrip
        items={[
          { label: "Profile views", value: fmt(t.views), delta: change(t.views, t.viewsBefore), hint: change(t.views, t.viewsBefore) == null ? "Last 30 days" : "vs previous 30 days" },
          { label: "Customer actions", value: fmt(t.actions), delta: change(t.actions, t.actionsBefore), hint: change(t.actions, t.actionsBefore) == null ? "Calls, website, directions" : "vs previous 30 days" },
          { label: "Rating", value: t.rating != null ? t.rating.toFixed(1) : "—", hint: `${fmt(t.reviews)} reviews · ${t.newReviews} new` },
          { label: "Reply rate", value: t.replyRate != null ? `${t.replyRate}%` : "—", hint: `${fmt(r.unreplied)} waiting for a reply`, alert: r.unrepliedNegative > 0 },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <WorkspaceTrend daily={x.daily} />
        <Card className="overflow-hidden">
          <PanelHeader title="Needs attention" meta={x.attention.length || undefined} />
          {x.attention.length ? (
            <ul className="divide-y">
              {x.attention.map((a) => (
                <li key={a.text} className="flex items-start gap-3 px-5 py-3 text-sm lg:px-6">
                  {a.level === "high" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
                  <span className="min-w-0 flex-1">{a.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-muted-foreground">
              <BadgeCheck className="h-5 w-5 text-success" /> Nothing needs attention.
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Card className="overflow-hidden">
          <PanelHeader title="Customer actions" meta="30 days" />
          <ul className="divide-y">
            {x.actionMix.map((m) => {
              const d = change(m.now, m.before);
              return (
                <li key={m.label} className="flex items-center gap-3 px-5 py-3 text-sm lg:px-6">
                  <span className="min-w-0 flex-1 text-muted-foreground">{m.label}</span>
                  <span className="font-semibold tabular-nums">{fmt(m.now)}</span>
                  <span className={cn("w-14 text-right text-xs tabular-nums", d == null ? "text-muted-foreground" : d >= 0 ? "text-success" : "text-destructive")}>
                    {d == null ? "—" : `${d >= 0 ? "+" : ""}${d}%`}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="border-t px-5 py-3 lg:px-6">
            <p className="label-caps mb-2">Where views came from</p>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full" style={{ width: `${viewTotal ? (x.viewMix.search / viewTotal) * 100 : 0}%`, background: "var(--viz-1)" }} />
              <div className="h-full" style={{ width: `${viewTotal ? (x.viewMix.maps / viewTotal) * 100 : 0}%`, background: "var(--viz-2)" }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--viz-1)" }} />
                Search {fmt(x.viewMix.search)}
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--viz-2)" }} />
                Maps {fmt(x.viewMix.maps)}
              </span>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <PanelHeader title="Reviews" meta={`${fmt(t.reviews)} · ${t.rating != null ? `${t.rating.toFixed(1)}★` : "no rating"}`} />
          <div className="px-5 py-4 lg:px-6">
            <StarBars counts={r.stars} />
          </div>
          <dl className="grid grid-cols-3 border-t">
            {(
              [
                ["New", fmt(t.newReviews), "30 days", false],
                ["Unanswered", fmt(r.unreplied), `${r.unrepliedNegative} are 1–3★`, r.unrepliedNegative > 0],
                ["Reply time", r.replyHours == null ? "—" : r.replyHours < 1 ? "<1 h" : r.replyHours < 48 ? `${r.replyHours} h` : `${Math.round(r.replyHours / 24)} d`, "median", false],
              ] as const
            ).map(([k, v, hint, warn], i) => (
              <div key={k} className={cn("min-w-0 px-4 py-3", i && "border-l")}>
                <dt className="label-caps truncate">{k}</dt>
                <dd className={cn("text-lg font-semibold tabular-nums", warn && "text-destructive")}>{v}</dd>
                <dd className="truncate text-[11px] text-muted-foreground">{hint}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="overflow-hidden md:col-span-2 xl:col-span-1">
          <PanelHeader title="Content & work" meta="30 days" />
          <dl className="grid grid-cols-2">
            {(
              [
                ["Posts published", t.published, `${t.scheduled} scheduled${t.failed ? ` · ${t.failed} failed` : ""}`],
                ["Review requests", t.requests, "sent"],
                ["Tasks done", t.doneTasks, `${t.openTasks} open`],
                ["Competitors", t.competitors, "tracked"],
              ] as const
            ).map(([k, v, hint], i) => (
              <div key={k} className={cn("min-w-0 px-5 py-3 lg:px-6", i % 2 && "border-l", i >= 2 && "border-t")}>
                <dt className="label-caps truncate">{k}</dt>
                <dd className="text-lg font-semibold tabular-nums">{fmt(v)}</dd>
                <dd className="truncate text-[11px] text-muted-foreground">{hint}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-1.5 border-t px-5 py-3 lg:px-6">
            <span className="label-caps mr-1">Posted to</span>
            {x.postsByChannel.length ? (
              x.postsByChannel.map((c) => (
                <Badge key={c.channel} variant="secondary" pill>
                  {c.channel} · {c.count}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No posts in 30 days</span>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <PanelHeader title="Feature usage" meta={`${x.usage.filter((u) => u.used).length} of ${x.usage.length} used`} />
          <ul className="grid divide-y sm:grid-cols-2 sm:divide-y-0">
            {x.usage.map((u, i) => (
              <li key={u.feature} className={cn("flex items-center gap-3 px-5 py-2.5 lg:px-6", "sm:border-b", i % 2 === 1 && "sm:border-l")}>
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", u.used ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                  {u.used ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", u.used ? "font-medium" : "text-muted-foreground")}>{u.feature}</span>
                  <span className="block truncate text-xs text-muted-foreground">{u.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <RecentActivity activity={x.activity} href={activityHref} />
      </div>
      {!!x.errors.length && <p className="text-xs text-muted-foreground">Couldn&apos;t load: {x.errors.join(" · ")}</p>}
    </>
  );
}

const COLS = "lg:grid-cols-[minmax(0,1fr)_4rem_5.5rem_4.5rem_6.5rem_5rem_5rem_4.5rem_6.5rem] lg:gap-3";

/** Every profile: audit score, reviews, rating, unanswered, views, actions, photos, last Google post. */
export function ProfilesTable({ insights: x }: { insights: WorkspaceInsights }) {
  const rows = [...x.profiles].sort((a, b) => b.views - a.views);
  return (
    <Card className="overflow-hidden">
      <PanelHeader title="Profiles" meta={`${x.profiles.length} · views and actions over 30 days`} />
      {rows.length ? (
        <>
          <div className={cn("hidden gap-2 border-b bg-muted/30 px-6 py-2 lg:grid", COLS)}>
            {["Profile", "Score", "Reviews", "Rating", "Unanswered", "Views", "Actions", "Photos", "Last post"].map((h, i) => (
              <span key={h} className={cn("label-caps", i && "text-right")}>
                {h}
              </span>
            ))}
          </div>
          <ul className="divide-y">
            {rows.map((p) => (
              <li key={p.id} className={cn("px-5 py-3 lg:grid lg:items-center lg:gap-2 lg:px-6", COLS)}>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    <span className="truncate">{p.title}</span>
                    {p.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Verified" />}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{p.address}</p>
                </div>
                <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground lg:contents">
                  {(
                    [
                      ["Score", <span key="s" className={scoreTone(p.score)}>{p.score}</span>],
                      ["Reviews", <>{fmt(p.reviews)}{p.newReviews ? <span className="ml-1 text-xs text-success">+{p.newReviews}</span> : null}</>],
                      ["Rating", p.rating != null ? `${p.rating.toFixed(1)}★` : "—"],
                      ["Unanswered", <span key="u" className={p.unreplied ? "text-warning" : undefined}>{fmt(p.unreplied)}</span>],
                      ["Views", fmt(p.views)],
                      ["Actions", fmt(p.actions)],
                      ["Photos", fmt(p.photos)],
                      ["Last post", <span key="l" className={!p.lastPost || Date.now() - Date.parse(p.lastPost) > 30 * 86400_000 ? "text-warning" : undefined} suppressHydrationWarning>{ago(p.lastPost)}</span>],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex gap-1 lg:block lg:text-right">
                      <dt className="lg:sr-only">{k}</dt>
                      <dd className="font-medium tabular-nums text-foreground lg:text-sm">{v}</dd>
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
    </Card>
  );
}

const STATUS: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "destructive" }> = {
  connected: { label: "Connected", variant: "success" },
  not_connected: { label: "Not connected", variant: "secondary" },
  needs_selection: { label: "Needs setup", variant: "warning" },
  expired: { label: "Expired", variant: "destructive" },
  error: { label: "Error", variant: "destructive" },
};

/** Google, Facebook, Instagram, LinkedIn: status, account and when it was connected. */
export function ConnectionsCard({ insights: x }: { insights: WorkspaceInsights }) {
  return (
    <Card className="overflow-hidden">
      <PanelHeader title="Connected accounts" meta={`${x.connections.filter((c) => c.status === "connected").length} of ${x.connections.length}`} />
      <ul className="divide-y">
        {x.connections.map((c) => {
          const st = STATUS[c.status] ?? { label: c.status, variant: "secondary" as const };
          return (
            <li key={c.channel} className="flex items-center gap-3 px-5 py-2.5 lg:px-6">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.channel}</span>
                <span className="block truncate text-xs text-muted-foreground" suppressHydrationWarning>
                  {[c.account, c.connectedAt ? `connected ${ago(c.connectedAt)}` : null].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
              <Badge variant={st.variant} pill>
                {st.label}
              </Badge>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
