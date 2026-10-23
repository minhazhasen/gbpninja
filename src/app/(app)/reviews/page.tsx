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
  const scope = parseLocationScope(location, locations.map((l) => l.id));

  return (
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
    />
  );
}
