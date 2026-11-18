"use client";

// Admin → workspace → Activity: everything the workspace did (and the reviews it got) in the last 30 days, grouped by day,
// filterable by kind. Also the short "Recent activity" list on the Overview tab.
import { useMemo, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from "date-fns";
import { CalendarDays, CheckCircle2, ListTodo, MessageSquareReply, PlugZap, Send, Star, Swords, UserPlus } from "lucide-react";
import { Card, PanelHeader, SectionLink } from "@/components/ui";
import type { ActivityKind, WorkspaceInsights } from "@/lib/platform/store";
import { cn } from "@/lib/utils";

const ICON: Record<ActivityKind, typeof Star> = {
  post: CalendarDays,
  review: Star,
  reply: MessageSquareReply,
  task: CheckCircle2,
  request: Send,
  member: UserPlus,
  connection: PlugZap,
  competitor: Swords,
};
const KIND_LABEL: Record<ActivityKind, string> = {
  review: "Reviews",
  reply: "Replies",
  post: "Posts",
  request: "Requests",
  task: "Tasks",
  competitor: "Competitors",
  member: "Team",
  connection: "Connections",
};

type Item = WorkspaceInsights["activity"][number];

function Row({ a }: { a: Item }) {
  const Icon = ICON[a.kind];
  return (
    <li className="flex items-start gap-3 px-5 py-2.5 lg:px-6">
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", a.kind === "review" ? "bg-warning/10 text-warning" : a.kind === "reply" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 text-sm">{a.text}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground" suppressHydrationWarning>
        {format(parseISO(a.at), "HH:mm")}
      </span>
    </li>
  );
}

const dayLabel = (iso: string) => {
  const d = parseISO(iso);
  return isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEEE d MMM");
};

/** Full timeline with kind filters. */
export function ActivityTimeline({ activity }: { activity: Item[] }) {
  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const counts = useMemo(() => {
    const c = new Map<ActivityKind, number>();
    for (const a of activity) c.set(a.kind, (c.get(a.kind) ?? 0) + 1);
    return c;
  }, [activity]);
  const shown = kind === "all" ? activity : activity.filter((a) => a.kind === kind);
  const groups = useMemo(() => {
    const out: { day: string; items: Item[] }[] = [];
    for (const a of shown) {
      const day = format(parseISO(a.at), "yyyy-MM-dd"); // local day, same as the heading
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(a);
      else out.push({ day, items: [a] });
    }
    return out;
  }, [shown]);
  const chips: (ActivityKind | "all")[] = ["all", ...(Object.keys(KIND_LABEL) as ActivityKind[]).filter((k) => counts.get(k))];

  return (
    <Card className="overflow-hidden">
      <PanelHeader title="Activity" meta={`${activity.length} · last 30 days`} />
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b px-5 py-2.5 lg:px-6">
        {chips.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
              kind === k ? "border-transparent bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {k === "all" ? "All" : KIND_LABEL[k]}
            <span className="tabular-nums opacity-70">{k === "all" ? activity.length : counts.get(k)}</span>
          </button>
        ))}
      </div>
      {groups.length ? (
        groups.map((g) => (
          <section key={g.day}>
            <h3 className="sticky top-0 border-b bg-muted/40 px-5 py-1.5 text-xs font-semibold text-muted-foreground lg:px-6" suppressHydrationWarning>
              {dayLabel(g.items[0].at)} <span className="font-normal">· {g.items.length}</span>
            </h3>
            <ul className="divide-y">
              {g.items.map((a, i) => (
                <Row key={`${a.at}-${i}`} a={a} />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-muted-foreground">
          <ListTodo className="h-5 w-5" /> No activity in the last 30 days.
        </p>
      )}
    </Card>
  );
}

/** The latest few, with a link to the Activity tab. */
export function RecentActivity({ activity, href }: { activity: Item[]; href: string }) {
  return (
    <Card className="overflow-hidden">
      <PanelHeader title="Recent activity" meta="30 days" action={activity.length > 8 ? <SectionLink href={href}>All {activity.length}</SectionLink> : undefined} />
      {activity.length ? (
        <ul className="divide-y">
          {activity.slice(0, 8).map((a, i) => {
            const Icon = ICON[a.kind];
            return (
              <li key={`${a.at}-${i}`} className="flex items-start gap-3 px-5 py-2.5 lg:px-6">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 text-sm">{a.text}</span>
                <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                  {formatDistanceToNowStrict(parseISO(a.at), { addSuffix: true })}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">No activity in the last 30 days.</p>
      )}
      {activity.length > 0 && activity.length <= 8 && (
        <Link href={href} className="block border-t px-5 py-2.5 text-center text-xs font-semibold text-primary hover:bg-muted/40">
          Open the timeline
        </Link>
      )}
    </Card>
  );
}
