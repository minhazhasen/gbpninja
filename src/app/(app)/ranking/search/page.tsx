import { redirect } from "next/navigation";
import { SearchQueryDetail } from "@/components/ranking/search-query-detail";
import { getProvider } from "@/lib/gbp";
import { resolveLocation } from "@/lib/location";
import { scRange } from "@/lib/search-console";
import { withLocation } from "@/lib/utils";

type Params = { q?: string; location?: string; range?: string; from?: string; to?: string; compare?: string };

/** One Search Console query: /ranking/search?q=…&location=… */
export default async function SearchQueryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { location } = await resolveLocation(searchParams);
  const sp = await searchParams;
  const query = sp.q?.trim().toLowerCase();
  if (!query) redirect(withLocation("/ranking", location.id));
  const provider = await getProvider();
  // Google refused (API off, access removed): the Ranking page explains why.
  const detail = await provider.getSearchConsoleQuery(location.id, query, scRange(sp)).catch(() => null);
  // Not connected / no website picked: the Ranking page explains how to connect.
  if (!detail) redirect(withLocation("/ranking", location.id));
  return <SearchQueryDetail key={`${location.id}|${query}`} location={{ id: location.id, title: location.title }} detail={detail} />;
}
