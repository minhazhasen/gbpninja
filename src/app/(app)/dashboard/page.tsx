import Link from "next/link";
import { Card, PageHeader, Stat } from "@/components/ui";
import { auditLocation } from "@/lib/audit";
import { getProvider } from "@/lib/gbp";
import { resolveLocation, type PageProps } from "@/lib/location";

export default async function DashboardPage({ searchParams }: PageProps) {
  const { location } = await resolveLocation(searchParams);
  const provider = await getProvider();
  const [metrics, reviews, posts] = await Promise.all([
    provider.getMetrics(location.id, 28),
    provider.listReviews(location.id),
    provider.listPosts(location.id),
  ]);
  const audit = auditLocation(location, reviews);
  const impressions = metrics.reduce((s, m) => s + m.impressions, 0);
  const actions = metrics.reduce((s, m) => s + m.calls + m.websiteClicks + m.directions, 0);
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const unreplied = reviews.filter((r) => !r.reply).length;
  const upcoming = posts.filter((p) => p.status === "SCHEDULED").length;
  const q = `?location=${encodeURIComponent(location.id)}`;

  return (
    <>
      <PageHeader title={location.title} subtitle={`${location.primaryCategory} · ${location.address}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Impressions (28d)" value={impressions.toLocaleString()} />
        <Stat label="Actions (28d)" value={actions.toLocaleString()} hint="Calls, website, directions" />
        <Stat label="Avg rating" value={avgRating.toFixed(1)} hint={`${reviews.length} reviews`} />
        <Stat label="Unreplied reviews" value={unreplied} />
        <Stat label="Audit score" value={`${audit.score}/100`} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card title="Next steps">
          <ul className="space-y-2 text-sm">
            {unreplied > 0 && <li><Link className="text-accent hover:underline" href={`/reviews${q}`}>Reply to {unreplied} reviews</Link></li>}
            {audit.issues.length > 0 && <li><Link className="text-accent hover:underline" href={`/audit${q}`}>Fix {audit.issues.length} profile issues</Link></li>}
            {upcoming === 0 && <li><Link className="text-accent hover:underline" href={`/calendar${q}`}>Schedule a post</Link></li>}
            {unreplied === 0 && audit.issues.length === 0 && upcoming > 0 && <li className="text-muted">All caught up.</li>}
          </ul>
        </Card>
        <Card title="Content" className="md:col-span-2">
          <p className="text-sm text-muted">{upcoming} scheduled post{upcoming === 1 ? "" : "s"}.</p>
        </Card>
      </div>
    </>
  );
}
