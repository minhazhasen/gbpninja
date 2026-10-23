import { after } from "next/server";
import { CompetitorsBoard } from "@/components/competitors/competitors-board";
import { refreshCompetitors } from "@/lib/competitor-refresh";
import { resolveTenant } from "@/lib/gbp/tenancy";
import { runInTenant } from "@/lib/gbp/tenant-context";
import { reviewHistory } from "@/lib/competitors";
import { getProvider } from "@/lib/gbp";
import { resolveLocation } from "@/lib/location";
import { withLocation } from "@/lib/utils";

/** This profile next to nearby businesses with the same main category: categories, reviews and rating. */
export default async function CompetitorsPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const { location } = await resolveLocation(searchParams);
  const provider = await getProvider();
  const [competitors, reviews] = await Promise.all([provider.listCompetitors(location.id), provider.listReviews(location.id)]);
  // Catch-up: competitors not checked in the last day are re-read after this page is sent (the next visit shows the new numbers).
  // Runs after the response: pin it to this person's workspace now rather than re-reading the sign-in later.
  const tenant = await resolveTenant();
  after(() => (tenant ? runInTenant(tenant, () => refreshCompetitors({ locationId: location.id })) : refreshCompetitors({ locationId: location.id })).then(() => undefined));
  const rating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  return (
    <CompetitorsBoard
      key={location.id}
      locationId={location.id}
      you={{
        id: location.id,
        name: location.title,
        address: location.address,
        distanceKm: 0,
        primaryCategory: location.primaryCategory,
        additionalCategories: location.additionalCategories,
        rating,
        reviewCount: reviews.length,
        history: reviewHistory(reviews),
        websiteUri: location.websiteUri ?? null,
      }}
      competitors={competitors}
      categoriesHref={withLocation("/audit", location.id, { tab: "about" })}
    />
  );
}
