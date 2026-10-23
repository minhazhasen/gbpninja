import { needsReply } from "@/lib/reviews";
import Link from "next/link";
import { Badge, Card, PageHeader, StatStrip } from "@/components/ui";
import { auditLocation } from "@/lib/audit";
import { getProvider } from "@/lib/gbp";
import { cn, withLocation } from "@/lib/utils";

export default async function LocationsPage() {
  const provider = await getProvider();
  const posts = await provider.listPosts();
  const locations = await provider.listLocations();
  const rows = await Promise.all(
    locations.map(async (l) => {
      const reviews = await provider.listReviews(l.id);
      const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
      return { l, avg, reviews: reviews.length, unreplied: reviews.filter(needsReply).length, score: auditLocation(l, reviews, posts).score };
    }),
  );
  const totalReviews = rows.reduce((s, r) => s + r.reviews, 0);
  const avgScore = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Locations">All Google Business Profiles in this workspace</PageHeader>
      <StatStrip
        items={[
          { label: "Locations", value: rows.length, hint: `${rows.filter((r) => r.l.verified).length} verified` },
          { label: "Total reviews", value: totalReviews },
          { label: "Needs reply", value: rows.reduce((s, r) => s + r.unreplied, 0), hint: "Across all locations" },
          { label: "Avg profile score", value: avgScore, hint: "Out of 100" },
        ]}
      />
      <Card className="min-w-0 overflow-hidden">
        {/* Phones and tablets */}
        <ul className="divide-y lg:hidden">
          {rows.map(({ l, avg, reviews, unreplied, score }) => (
            <li key={l.id} className="px-4 py-3.5 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <Link href={withLocation("/dashboard", l.id)} className="min-w-0">
                  <p className="truncate font-semibold">{l.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{l.primaryCategory} · {l.address}</p>
                </Link>
                {l.verified ? <Badge variant="success" pill>Verified</Badge> : <Badge variant="warning" pill>Unverified</Badge>}
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                  <p className="text-muted-foreground">Rating</p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    {avg.toFixed(1)} <span className="font-normal text-muted-foreground">({reviews})</span>
                  </p>
                </div>
                <Link href={withLocation("/reviews", l.id, { filter: "unreplied" })} className="rounded-lg bg-muted/50 px-2.5 py-2">
                  <p className="text-muted-foreground">Needs reply</p>
                  <p className={cn("mt-0.5 font-semibold tabular-nums", unreplied > 0 && "text-warning")}>{unreplied}</p>
                </Link>
                <Link href={withLocation("/audit", l.id)} className="rounded-lg bg-muted/50 px-2.5 py-2">
                  <p className="text-muted-foreground">Score</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{score}</p>
                </Link>
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                {["Location", "Category", "Rating", "Needs reply", "Score", "Status"].map((h) => (
                  <th key={h} className="label-caps whitespace-nowrap px-5 py-3 font-semibold lg:px-6">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(({ l, avg, reviews, unreplied, score }) => (
                <tr key={l.id} className="hover:bg-muted/40">
                  <td className="px-5 py-3 lg:px-6">
                    <Link href={withLocation("/dashboard", l.id)} className="font-semibold hover:text-primary">
                      {l.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{l.address}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-muted-foreground lg:px-6">{l.primaryCategory}</td>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums lg:px-6">
                    {avg.toFixed(1)} <span className="text-muted-foreground">({reviews})</span>
                  </td>
                  <td className="px-5 py-3 tabular-nums lg:px-6">
                    <Link href={withLocation("/reviews", l.id, { filter: "unreplied" })} className={cn(unreplied > 0 && "font-semibold text-warning")}>
                      {unreplied}
                    </Link>
                  </td>
                  <td className="px-5 py-3 lg:px-6">
                    <Link href={withLocation("/audit", l.id)} className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <span className={cn("block h-full rounded-full", score >= 80 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-destructive")} style={{ width: `${score}%` }} />
                      </span>
                      <span className="tabular-nums">{score}</span>
                    </Link>
                  </td>
                  <td className="px-5 py-3 lg:px-6">
                    {l.verified ? <Badge variant="success" pill>Verified</Badge> : <Badge variant="warning" pill>Unverified</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
