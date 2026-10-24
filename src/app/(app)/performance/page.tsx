import { format } from "date-fns";
import { ExportCsvButton } from "@/components/export-csv-button";
import { ChartLegend, MetricsChart } from "@/components/metrics-chart";
import { PerformanceControls } from "@/components/performance/performance-controls";
import { SearchQueriesPanel } from "@/components/performance/search-queries-panel";
import { SyncIssues } from "@/components/sync-issues";
import { Card, PanelHeader, PillTabs, StatStrip } from "@/components/ui";
import { csvFilename } from "@/lib/csv";
import { rangeFromParams } from "@/lib/date-ranges";
import { getProvider } from "@/lib/gbp";
import { mergeKeywordMonths } from "@/lib/keywords";
import { parseLocationScope } from "@/lib/location-scope";
import { SERIES, daysNeeded, periodLabel, rangeView, type SeriesKey } from "@/lib/metrics";
import { delta, fmt } from "@/lib/utils";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function PerformancePage({ searchParams }: Props) {
  const sp = await searchParams;
  const provider = await getProvider();
  const locations = await provider.listLocations();
  // `?location=` is "all", one id, or several ids joined by ","; the picked locations are added together.
  const scope = parseLocationScope(
    sp.location,
    locations.map((l) => l.id),
  );
  const picked = locations.filter((l) => scope.includes(l.id));

  const range = rangeFromParams(sp);
  const series: SeriesKey = sp.series && sp.series in SERIES ? (sp.series as SeriesKey) : "interactions";

  const [perLocation, keywordMonths] = await Promise.all([
    Promise.all(picked.map((l) => provider.getMetrics(l.id, daysNeeded(range)))),
    Promise.all(picked.map((l) => provider.getSearchKeywords(l.id))),
  ]);
  const { cur, before, chart, start } = rangeView(perLocation, range, series);
  const issues = (await provider.getSyncIssues?.(picked.map((l) => l.id))) ?? [];
  // CSV: one row per location per day in the picked range (newest first).
  const ymd = (d: Date) => format(d, "yyyy-MM-dd");
  const fromDay = range.from ? ymd(range.from) : "", toDay = ymd(range.to);
  const csvRows = [
    ["Date", "Location", "Profile views", "Search views", "Maps views", "Calls", "Website clicks", "Directions", "Interactions"],
    ...picked
      .flatMap((l, i) => perLocation[i].filter((p) => p.date >= fromDay && p.date <= toDay).map((p) => ({ l, p })))
      .sort((a, b) => b.p.date.localeCompare(a.p.date) || a.l.title.localeCompare(b.l.title))
      .map(({ l, p }) => [p.date, l.title, p.impressions, p.searchImpressions, p.mapsImpressions, p.calls, p.websiteClicks, p.directions, p.calls + p.websiteClicks + p.directions]),
  ];
  const csvName = csvFilename("performance", picked.length === 1 ? picked[0].title : `${picked.length}-locations`, fromDay || "all-time", "to", toDay);

  const qs = (extra: Record<string, string>) => `?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => v != null)) as Record<string, string>), ...extra })}`;
  const stat = (key: SeriesKey, hint?: string) => ({
    label: SERIES[key],
    value: fmt(cur[key]),
    delta: before ? delta(cur[key], before[key]) : null,
    hint,
    href: qs({ series: key }),
    active: series === key,
  });

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <PerformanceControls locations={locations.map(({ id, title }) => ({ id, title }))} scope={scope} />
          <ExportCsvButton filename={csvName} rows={csvRows} what="days" className="self-start sm:self-auto" />
        </div>
      </div>

      <SyncIssues issues={issues} />
      <StatStrip
        cols={5}
        items={[
          stat("interactions", before ? undefined : "Calls, clicks, directions"),
          stat("websiteClicks"),
          stat("calls"),
          stat("directions"),
          stat("impressions", before ? undefined : `${fmt(cur.searchImpressions)} search · ${fmt(cur.mapsImpressions)} maps`),
        ]}
      />

      <Card className="min-w-0 overflow-hidden">
        <PanelHeader
          title={SERIES[series]}
          meta={before ? "vs previous period" : periodLabel(start, range.to)}
          action={
            <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
              <ChartLegend color="var(--viz-1)" label="This period" />
              {before && <ChartLegend color="hsl(var(--muted-foreground))" label="Previous" dashed />}
            </div>
          }
        />
        <div className="border-b px-4 py-2.5 lg:px-6">
          <PillTabs label="Metric" items={(Object.keys(SERIES) as SeriesKey[]).map((k) => ({ href: qs({ series: k }), label: SERIES[k], active: k === series }))} />
        </div>
        <MetricsChart data={chart} metric={SERIES[series]} />
      </Card>

      <SearchQueriesPanel key={scope.join(",")} months={mergeKeywordMonths(keywordMonths.flat())} />
    </div>
  );
}
