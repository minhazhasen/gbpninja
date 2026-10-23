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
  const connection = await provider.getSearchConsole();
  // Google can refuse (API not turned on, access removed): show why instead of breaking the page.
  let report = null;
  let error: string | null = null;
  try {
    report = await provider.getSearchConsoleReport(location.id, scRange(sp));
  } catch (e) {
    error = e instanceof Error ? e.message : "Google Search Console didn't answer. Try again in a minute.";
  }
  return (
    <SearchConsoleBoard
      key={location.id}
      location={{ id: location.id, title: location.title }}
      connection={connection}
      report={report}
      error={error}
      canConnect={channelAvailable("google")}
    />
  );
}
