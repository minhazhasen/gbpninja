import Link from "next/link";
import { Badge, Card, PageHeader, Stars } from "@/components/ui";
import { getProvider } from "@/lib/gbp";
import { resolveLocation } from "@/lib/location";
import { suggestReply } from "@/lib/reply-templates";
import { replyToReview } from "../actions";

type Props = { searchParams: Promise<{ location?: string; filter?: string }> };

const filters = [
  { id: "all", label: "All" },
  { id: "unreplied", label: "Needs reply" },
  { id: "negative", label: "1–3 stars" },
];

export default async function ReviewsPage({ searchParams }: Props) {
  const { location } = await resolveLocation(searchParams);
  const { filter = "all" } = await searchParams;
  const all = await (await getProvider()).listReviews(location.id);
  const reviews = all.filter((r) => (filter === "unreplied" ? !r.reply : filter === "negative" ? r.rating <= 3 : true));

  return (
    <>
      <PageHeader title="Reviews" subtitle={`${location.title} · ${all.length} reviews`} />
      <div className="mb-4 flex gap-2">
        {filters.map((f) => (
          <Link
            key={f.id}
            href={`?location=${encodeURIComponent(location.id)}&filter=${f.id}`}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f.id ? "border-accent text-accent" : "border-border text-muted"}`}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <div className="space-y-3">
        {reviews.length === 0 && <p className="text-sm text-muted">No reviews match this filter.</p>}
        {reviews.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{r.reviewer}</span>
              <Stars rating={r.rating} />
              <span className="text-muted">{new Date(r.createTime).toLocaleDateString()}</span>
              {!r.reply && <Badge tone="medium">Needs reply</Badge>}
            </div>
            {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
            {r.reply ? (
              <div className="mt-3 border-l-2 border-accent pl-3 text-sm text-muted">
                <span className="font-medium text-foreground">Owner reply: </span>
                {r.reply.comment}
              </div>
            ) : (
              <form action={replyToReview} className="mt-3 space-y-2">
                <input type="hidden" name="locationId" value={location.id} />
                <input type="hidden" name="reviewId" value={r.id} />
                <textarea
                  name="comment"
                  required
                  rows={3}
                  defaultValue={suggestReply(r.rating, r.reviewer, location.title)}
                  className="w-full rounded-md border border-border bg-background p-2 text-sm"
                />
                <button className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">Post reply</button>
              </form>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
