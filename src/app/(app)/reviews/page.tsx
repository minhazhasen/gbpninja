import { SyncIssues } from "@/components/sync-issues";
import { timeZoneFor } from "@/lib/time-zones";
import { ReviewsBoard } from "@/components/reviews/reviews-board";
import { getProvider } from "@/lib/gbp";
import { parseLocationScope } from "@/lib/location-scope";

type Props = { searchParams: Promise<{ location?: string; filter?: string; review?: string }> };

export default async function ReviewsPage({ searchParams }: Props) {
  const { location, filter, review } = await searchParams;
  const provider = await getProvider();
  const [locations, members, requests, templates, sender] = await Promise.all([
    provider.listLocations(),
    provider.listTeamMembers(),
    provider.listReviewRequests(),
    provider.listTemplates(),
    provider.getEmailSender(),
  ]);
  const titleOf = (id: string) => locations.find((l) => l.id === id)?.title ?? "Location";
  const reviews = (await Promise.all(locations.map((l) => provider.listReviews(l.id)))).flat().map((r) => ({ ...r, locationTitle: titleOf(r.locationId) }));
  // `?location=` is "all", one id, or several ids joined by ",".
  const scope = parseLocationScope(
    location,
    locations.map((l) => l.id),
  );
  const issues = (await provider.getSyncIssues?.(scope)) ?? [];
  // Count reviews in the business's own time zone (from its address); several profiles → the first one's.
  const timeZone = timeZoneFor(locations.find((l) => scope.includes(l.id))?.postalAddress ?? locations[0]?.postalAddress);

  const board = (
    <ReviewsBoard
      scope={scope}
      initialStatus={filter === "unreplied" ? "reply" : filter === "attention" ? "attention" : "all"}
      initialReviewId={review && reviews.some((r) => r.id === review) ? review : undefined}
      templates={templates}
      sender={sender}
      settingsHref={`/settings?tab=email${scope.length === 1 ? `&location=${encodeURIComponent(scope[0])}` : ""}`}
      reviews={reviews}
      requests={requests.map((r) => ({ ...r, locationTitle: titleOf(r.locationId) }))}
      members={members}
      locations={locations.map(({ id, title, placeId }) => ({ id, title, placeId }))}
      timeZone={timeZone}
    />
  );
  return issues.length ? (
    <div className="space-y-5">
      <SyncIssues issues={issues} />
      {board}
    </div>
  ) : (
    board
  );
}
