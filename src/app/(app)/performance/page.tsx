import { ChartLegend, MetricsChart } from "@/components/metrics-chart";
import { Card, PageHeader, PanelHeader, PillTabs, StatStrip } from "@/components/ui";
import { getProvider } from "@/lib/gbp";
import { resolveLocation } from "@/lib/location";
import { RANGES, SERIES, splitCompare, totals, type RangeKey, type SeriesKey } from "@/lib/metrics";
import { delta, fmt, withLocation } from "@/lib/utils";

type Props = { searchParams: Promise<{ location?: string; range?: string; series?: string }> };

export default async function PerformancePage({ searchParams }: Props) {
  const { location } = await resolveLocation(searchParams);
  const sp = await searchParams;
  const range: RangeKey = sp.range && sp.range in RANGES ? (sp.range as RangeKey) : "28";
  const series: SeriesKey = sp.series && sp.series in SERIES ? (sp.series as SeriesKey) : "interactions";
  const days = Number(range);

  const points = await (await getProvider()).getMetrics(location.id, days * 2);
  const { current, previous, chart } = splitCompare(points, days, series);
  const cur = totals(current);
  const prev = totals(previous);
  const href = (extra: Record<string, string>) => withLocation("/performance", location.id, { range, series, ...extra });
  const stat = (key: SeriesKey, hint?: string) => ({
    label: SERIES[key],
    value: fmt(cur[key]),
    delta: delta(cur[key], prev[key]),
    hint,
    href: href({ series: key }),
    active: series === key,
  });

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Performance"
        actions={<PillTabs label="Date range" items={Object.entries(RANGES).map(([k, label]) => ({ href: href({ range: k }), label, active: k === range }))} />}
      >
        {location.title}
      </PageHeader>

      <StatStrip
        cols={5}
        items={[
          stat("interactions"),
          stat("websiteClicks"),
          stat("calls"),
          stat("directions"),
          { ...stat("impressions"), hint: `${fmt(cur.searchImpressions)} search · ${fmt(cur.mapsImpressions)} maps`, delta: null },
        ]}
      />

      <Card className="min-w-0 overflow-hidden">
        <PanelHeader
          title={SERIES[series]}
          meta="vs previous period"
          action={
            <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
              <ChartLegend color="var(--viz-1)" label="This period" />
              <ChartLegend color="hsl(var(--muted-foreground))" label="Previous" dashed />
            </div>
          }
        />
        <div className="border-b px-4 py-2.5 lg:px-6">
          <PillTabs label="Metric" items={Object.entries(SERIES).map(([k, label]) => ({ href: href({ series: k }), label, active: k === series }))} />
        </div>
        <MetricsChart data={chart} metric={SERIES[series]} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <PanelHeader title="How customers find you" />
          <div className="space-y-4 p-5 lg:p-6">
            <Split label="Google Search" value={cur.searchImpressions} total={cur.impressions} color="var(--viz-1)" />
            <Split label="Google Maps" value={cur.mapsImpressions} total={cur.impressions} color="var(--viz-2)" />
          </div>
        </Card>
        <Card className="overflow-hidden">
          <PanelHeader title="Customer actions" meta={fmt(cur.interactions)} />
          <div className="space-y-4 p-5 lg:p-6">
            <Split label="Website clicks" value={cur.websiteClicks} total={cur.interactions} color="var(--viz-1)" />
            <Split label="Calls" value={cur.calls} total={cur.interactions} color="var(--viz-2)" />
            <Split label="Directions" value={cur.directions} total={cur.interactions} color="var(--viz-3)" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Split({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{fmt(value)}</span> · {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
