import { SearchConsoleBoard } from "@/components/ranking/search-console-board";
import { channelAvailable } from "@/lib/connections";
import { getProvider } from "@/lib/gbp";
import { resolveLocation } from "@/lib/location";
import { scRange } from "@/lib/search-console";

type Params = { location?: string; range?: string; from?: string; to?: string; compare?: string };

/** Rankings come from Google Search Console for every profile: average position, clicks, impressions and CTR per search query. */
export default async function RankingPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { location } = await resolveLocation(searchParams);
  const sp = await searchParams;
  const provider = await getProvider();
  const [connection, report] = await Promise.all([provider.getSearchConsole(), provider.getSearchConsoleReport(location.id, scRange(sp))]);
  return (
    <SearchConsoleBoard
      key={location.id}
      location={{ id: location.id, title: location.title }}
      connection={connection}
      report={report}
      canConnect={channelAvailable("google")}
    />
  );
}
