import { MessageSquareReply } from "lucide-react";
import { Avatar, Badge, Card, EmptyState, PageHeader, PanelHeader, PillTabs, StarBars, Stars, StatStrip, buttonClass, inputClass } from "@/components/ui";
import { getProvider } from "@/lib/gbp";
import { resolveLocation } from "@/lib/location";
import { suggestReply } from "@/lib/reply-templates";
import { withLocation } from "@/lib/utils";
import { replyToReview } from "../actions";

type Props = { searchParams: Promise<{ location?: string; filter?: string }> };

const FILTERS = { all: "All", unreplied: "Needs reply", negative: "1–3 stars", replied: "Replied" } as const;
type Filter = keyof typeof FILTERS;

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default async function ReviewsPage({ searchParams }: Props) {
  const { location } = await resolveLocation(searchParams);
  const sp = await searchParams;
  const filter: Filter = sp.filter && sp.filter in FILTERS ? (sp.filter as Filter) : "all";
  const all = await (await getProvider()).listReviews(location.id);

  const match: Record<Filter, (r: (typeof all)[number]) => boolean> = {
    all: () => true,
    unreplied: (r) => !r.reply,
    negative: (r) => r.rating <= 3,
    replied: (r) => !!r.reply,
  };
  const reviews = all.filter(match[filter]);
  const avg = all.length ? all.reduce((s, r) => s + r.rating, 0) / all.length : 0;
  const unreplied = all.filter((r) => !r.reply).length;
  const replyRate = all.length ? Math.round(((all.length - unreplied) / all.length) * 100) : 0;
  const counts = all.reduce<Record<number, number>>((c, r) => ({ ...c, [r.rating]: (c[r.rating] ?? 0) + 1 }), {});
  const last30 = all.filter((r) => Date.now() - new Date(r.createTime).getTime() < 30 * 86_400_000).length;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Reviews">{location.title}</PageHeader>

      <StatStrip
        items={[
          { label: "Average rating", value: avg.toFixed(1), hint: `${all.length} reviews on Google` },
          { label: "New (30 days)", value: last30, hint: "Reviews received" },
          { label: "Needs reply", value: unreplied, hint: unreplied ? "Reply within 24h" : "All caught up", alert: unreplied > 0, href: withLocation("/reviews", location.id, { filter: "unreplied" }) },
          { label: "Reply rate", value: `${replyRate}%`, hint: "Target 80%+" },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card className="min-w-0 overflow-hidden">
          <PanelHeader title="All reviews" meta={reviews.length} />
          <div className="border-b px-4 py-2.5 lg:px-6">
            <PillTabs
              label="Filter reviews"
              items={(Object.keys(FILTERS) as Filter[]).map((f) => ({
                href: withLocation("/reviews", location.id, { filter: f }),
                label: FILTERS[f],
                active: f === filter,
                count: all.filter(match[f]).length,
              }))}
            />
          </div>
          {reviews.length === 0 ? (
            <EmptyState title="No reviews here">Try another filter.</EmptyState>
          ) : (
            <ul className="divide-y">
              {reviews.map((r) => (
                <li key={r.id} className="px-5 py-4 lg:px-6">
                  <div className="flex items-start gap-3">
                    <Avatar name={r.reviewer} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold">{r.reviewer}</span>
                        <Stars rating={r.rating} />
                        <span className="text-xs text-muted-foreground">{ago(r.createTime)}</span>
                        <span className="ml-auto">
                          {r.reply ? <Badge variant="success" pill>Replied</Badge> : <Badge variant="warning" pill>Needs reply</Badge>}
                        </span>
                      </div>
                      {r.comment && <p className="mt-1.5 text-sm leading-relaxed">{r.comment}</p>}

                      {r.reply ? (
                        <div className="mt-3 rounded-lg bg-muted px-3 py-2.5 text-sm">
                          <span className="label-caps mb-0.5 block">Your reply</span>
                          {r.reply.comment}
                        </div>
                      ) : (
                        <details className="group mt-3">
                          <summary className={buttonClass("outline", "sm", "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                            <MessageSquareReply />
                            Reply
                          </summary>
                          <form action={replyToReview} className="mt-3 space-y-2">
                            <input type="hidden" name="locationId" value={location.id} />
                            <input type="hidden" name="reviewId" value={r.id} />
                            <textarea name="comment" required rows={3} maxLength={4096} defaultValue={suggestReply(r.rating, r.reviewer, location.title)} className={inputClass} />
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-muted-foreground">Suggested reply — edit before posting. It appears publicly on Google.</span>
                              <button className={buttonClass("default", "sm")}>Post reply</button>
                            </div>
                          </form>
                        </details>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <PanelHeader title="Rating" />
            <div className="p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="text-4xl font-semibold tabular-nums tracking-tight">{avg.toFixed(1)}</span>
                <div>
                  <Stars rating={Math.round(avg)} size="h-4 w-4" />
                  <p className="text-xs text-muted-foreground">{all.length} reviews</p>
                </div>
              </div>
              <StarBars counts={counts} />
            </div>
          </Card>
          <Card className="p-5">
            <p className="label-caps mb-2">Tip</p>
            <p className="text-sm text-muted-foreground">
              Replying to reviews — especially negative ones — within a day improves trust and can help your local ranking.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
