import { ContentBoard } from "@/components/marketing/content-board";
import { getProvider } from "@/lib/gbp";
import { resolveLocation, type PageProps } from "@/lib/location";
import { postForLocation } from "@/lib/posts";

export default async function CalendarPage({ searchParams }: PageProps) {
  const { locations, location } = await resolveLocation(searchParams);
  const provider = await getProvider();
  const [posts, connected] = await Promise.all([provider.listPosts(), provider.getConnectedChannels()]);

  return (
    <ContentBoard
      // Remount per location so view state (opened post, optimistic moves) doesn't leak across locations.
      key={location.id}
      posts={posts.filter((p) => postForLocation(p, location.id))}
      connected={connected}
      locations={locations.map(({ id, title }) => ({ id, title }))}
      currentLocationId={location.id}
    />
  );
}
