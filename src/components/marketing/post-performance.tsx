"use client";

// Performance of a published post, per channel, as the network reports it (Facebook / Instagram / LinkedIn / X). Google doesn't
// share per-post numbers through its API, so Google isn't listed: nothing is estimated or typed in.
import { formatDistanceToNow, parseISO } from "date-fns";
import { ChannelIcon } from "@/components/marketing/channel-icon";
import { CHANNEL_LABEL, POST_STAT_LABEL, postStatChannels, type Channel, type Post, type PostStats } from "@/lib/posts";

const num = (n: number) => n.toLocaleString("en-US");
const STAT_ORDER = Object.keys(POST_STAT_LABEL) as (keyof typeof POST_STAT_LABEL)[];

export function PostPerformance({ post }: { post: Post }) {
  const shown = postStatChannels(post);
  if (!shown.length) return null;
  return (
    <div className="space-y-2.5">
      {shown.map((c) => (
        <ChannelStats key={c} channel={c} stats={post.stats?.[c] ?? null} />
      ))}
    </div>
  );
}

function Frame({ channel, meta, children }: { channel: Channel; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border">
      <p className="flex items-center gap-2 border-b px-3 py-2 text-sm">
        <ChannelIcon channel={channel} />
        <span className="font-semibold">{CHANNEL_LABEL[channel]}</span>
        {meta && <span className="ml-auto text-xs text-muted-foreground">{meta}</span>}
      </p>
      <div className="px-3 py-3">{children}</div>
    </div>
  );
}

function ChannelStats({ channel, stats }: { channel: Channel; stats: PostStats | null }) {
  const shown = stats ? STAT_ORDER.filter((k) => stats[k] != null) : [];
  return (
    <Frame channel={channel} meta={stats ? `Updated ${formatDistanceToNow(parseISO(stats.fetched_at), { addSuffix: true })}` : undefined}>
      {shown.length ? (
        <dl className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {shown.map((k) => (
            <div key={k} className="rounded-md bg-muted/50 px-2.5 py-2">
              <dt className="text-[11px] text-muted-foreground">{POST_STAT_LABEL[k]}</dt>
              <dd className="text-base font-semibold tabular-nums">{num(stats![k]!)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">No stats yet. They appear after the next sync of your {CHANNEL_LABEL[channel]} account.</p>
      )}
    </Frame>
  );
}
