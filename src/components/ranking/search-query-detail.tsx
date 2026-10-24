"use client";

// One Search Console query: position and traffic day by day, which pages showed for it, and devices.
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Minus, Monitor, Smartphone, Tablet, TrendingDown, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DateRangePicker } from "@/components/date-range-picker";
import { ExportCsvButton } from "@/components/export-csv-button";
import { Card, EmptyState, PageHeader, PanelHeader, StatStrip, buttonClass } from "@/components/ui";
import { csvFilename } from "@/lib/csv";
import { Segmented } from "@/components/ui-client";
import { propertyLabel } from "@/components/settings/search-console-card";
import { rangeFromParams, rangeToParams, type DateRangeValue } from "@/lib/date-ranges";
import type { SearchConsoleDevice, SearchConsoleMetrics, SearchConsoleQueryDetail } from "@/lib/gbp/types";
import { cn } from "@/lib/utils";
import { CopyButton, fmtDay, fmtLong, num, pct, pctChange, tier } from "./search-console-board";

type Metric = "position" | "clicks" | "impressions" | "ctr";
const METRICS: { value: Metric; label: string }[] = [
  { value: "position", label: "Position" },
  { value: "clicks", label: "Clicks" },
  { value: "impressions", label: "Impressions" },
  { value: "ctr", label: "CTR" },
];
const DEVICE: Record<SearchConsoleDevice, { label: string; icon: React.ElementType }> = {
  MOBILE: { label: "Mobile", icon: Smartphone },
  DESKTOP: { label: "Desktop", icon: Monitor },
  TABLET: { label: "Tablet", icon: Tablet },
};
const DAYS_SHOWN = 14;

/** "https://example.com/menu/" → "/menu/" (the property is shown in the header). */
const pagePath = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
};
const posText = (m: SearchConsoleMetrics) => (m.impressions ? `#${m.position.toFixed(1)}` : "—");

function PositionBadge({ m }: { m: SearchConsoleMetrics }) {
  if (!m.impressions) return <span className="text-muted-foreground">—</span>;
  return <span className={cn("inline-flex min-w-[3.25rem] items-center justify-center rounded-md px-2 py-1 text-xs font-semibold tabular-nums", tier(m.position))}>#{m.position.toFixed(1)}</span>;
}

/** Places gained (green) or lost (red) vs the previous period. */
function PositionChange({ now, before }: { now: SearchConsoleMetrics; before?: SearchConsoleMetrics | null }) {
  if (!before?.impressions || !now.impressions) return null;
  const change = Math.round((before.position - now.position) * 10) / 10;
  if (Math.abs(change) < 0.5)
    return (
      <span className="inline-flex items-center text-muted-foreground" title="About the same as the previous period">
        <Minus className="h-3 w-3" />
      </span>
    );
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", change > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}
      title={`${change > 0 ? "Up" : "Down"} ${Math.abs(change)} vs previous period`}
    >
      {change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(change)}
    </span>
  );
}

export function SearchQueryDetail({ location, detail }: { location: { id: string; title: string }; detail: SearchConsoleQueryDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [metric, setMetric] = useState<Metric>("position");
  const [allDays, setAllDays] = useState(false);
  const range = rangeFromParams(Object.fromEntries(params), "last28");

  // Back to the Ranking page with the same location and range.
  const backQs = new URLSearchParams(params.toString());
  backQs.delete("q");
  const back = `/ranking?${backQs}`;

  const go = (v: DateRangeValue) => {
    const next = new URLSearchParams(params.toString());
    for (const k of ["range", "from", "to", "compare"]) next.delete(k);
    for (const [k, val] of Object.entries(rangeToParams(v))) next.set(k, val);
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  const t = detail.totals;
  const p = detail.prevTotals;
  const posDelta = p?.impressions && t.impressions ? Math.round((p.position - t.position) * 10) / 10 : null;
  const days = [...detail.daily].reverse();
  const shownDays = allDays ? days : days.slice(0, DAYS_SHOWN);
  const seen = detail.daily.filter((d) => d.impressions > 0);
  const best = seen.length ? seen.reduce((a, b) => (b.position < a.position ? b : a)) : null;
  const deviceTotal = detail.devices.reduce((a, d) => a + d.impressions, 0);

  // Days without impressions have no position: leave a gap instead of dropping to 0.
  const chart = detail.daily.map((d) => ({ ...d, value: metric === "position" ? (d.impressions ? d.position : null) : metric === "ctr" ? (d.impressions ? d.ctr * 100 : null) : d[metric] }));
  const maxPos = Math.ceil(Math.max(10, ...seen.map((d) => d.position)) / 5) * 5;
  const step = maxPos > 20 ? 10 : 5;

  return (
    <div className={cn("space-y-5 pb-8 transition-opacity", pending && "opacity-70")}>
      <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Ranking
      </Link>
      <PageHeader
        title={
          <span className="group inline-flex min-w-0 items-center gap-1.5">
            <span className="truncate">{detail.query}</span>
            <CopyButton text={detail.query} />
          </span>
        }
        actions={
          <>
            <DateRangePicker className="w-full sm:w-[300px]" value={range} onChange={go} />
            <a href={`https://www.google.com/search?q=${encodeURIComponent(detail.query)}`} target="_blank" rel="noreferrer" className={buttonClass("outline")}>
              <ExternalLink /> Search on Google
            </a>
          </>
        }
      >
        {location.title} · Google Search · {propertyLabel(detail.siteUrl)}
      </PageHeader>

      {!t.impressions ? (
        <Card>
          <EmptyState title="Your website didn't show for this search in this period">Try a longer date range. Search Console only counts searches where your website appeared.</EmptyState>
        </Card>
      ) : (
        <>
          <StatStrip
            items={[
              {
                label: "Avg position",
                value: posText(t),
                hint: posDelta != null ? (posDelta === 0 ? "No change vs previous period" : `${posDelta > 0 ? "↑" : "↓"} ${Math.abs(posDelta)} vs previous period`) : best ? `Best day #${best.position.toFixed(1)}` : "Lower is better",
              },
              { label: "Clicks", value: num(t.clicks), delta: pctChange(t.clicks, p?.clicks) },
              { label: "Impressions", value: num(t.impressions), delta: pctChange(t.impressions, p?.impressions) },
              { label: "Click-through rate", value: pct(t.ctr), delta: pctChange(t.ctr, p?.ctr) },
            ]}
          />

          <Card className="overflow-hidden">
            <PanelHeader
              title={METRICS.find((m) => m.value === metric)!.label}
              meta={`${fmtDay(detail.from)} – ${fmtDay(detail.to)}${metric === "position" ? " · 1 = top" : ""}`}
              action={<Segmented size="sm" label="Chart metric" value={metric} onChange={setMetric} options={METRICS} className="hidden sm:inline-flex" />}
            />
            {/* Phones: the switch gets its own row */}
            <div className="px-4 pt-3 sm:hidden">
              <Segmented size="sm" label="Chart metric" value={metric} onChange={setMetric} options={METRICS} className="flex w-full [&>button]:flex-1" />
            </div>
            <div className="h-[280px] px-2 pb-4 pt-4 sm:px-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={fmtDay} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={28} />
                  {metric === "position" ? (
                    <YAxis
                      reversed
                      domain={[1, maxPos]}
                      ticks={[1, ...Array.from({ length: Math.floor(maxPos / step) }, (_, i) => (i + 1) * step)]}
                      interval={0}
                      allowDecimals={false}
                      tickFormatter={(v) => `#${v}`}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    />
                  ) : (
                    <YAxis
                      allowDecimals={metric === "ctr"}
                      tickFormatter={(v) => (metric === "ctr" ? `${v}%` : num(v))}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    />
                  )}
                  <Tooltip
                    cursor={{ stroke: "hsl(var(--border))" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as SearchConsoleQueryDetail["daily"][number];
                      return (
                        <div className="min-w-[180px] rounded-md border bg-popover px-3 py-2 text-xs shadow-elegant">
                          <p className="mb-1.5 font-semibold">{fmtLong(d.date)}</p>
                          {d.impressions ? (
                            [
                              ["Avg position", posText(d)],
                              ["Clicks", num(d.clicks)],
                              ["Impressions", num(d.impressions)],
                              ["CTR", pct(d.ctr)],
                            ].map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-4 py-0.5">
                                <span className="text-muted-foreground">{k}</span>
                                <span className="tabular-nums">{v}</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-muted-foreground">Didn&apos;t show this day</p>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="value" stroke="var(--viz-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="overflow-hidden lg:col-span-3">
              <PanelHeader title="Pages" meta="that showed for this search" />
              <ul className="divide-y">
                {detail.pages.map((pg) => (
                  <li key={pg.page} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 lg:px-6">
                    <a href={pg.page} target="_blank" rel="noreferrer" title={pg.page} className="min-w-0 flex-1 basis-48 truncate text-sm font-medium hover:text-primary hover:underline">
                      {pagePath(pg.page)}
                    </a>
                    <span className="flex items-center gap-2">
                      <PositionBadge m={pg} />
                      <PositionChange now={pg} before={pg.prev} />
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground sm:w-44 sm:text-right">
                      <span className="font-semibold tabular-nums text-foreground">{num(pg.clicks)}</span> clicks · <span className="font-semibold tabular-nums text-foreground">{num(pg.impressions)}</span> impr.
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="overflow-hidden lg:col-span-2">
              <PanelHeader title="Devices" meta="share of impressions" />
              <ul className="space-y-4 px-5 py-4 lg:px-6">
                {detail.devices.map((d) => {
                  const Icon = DEVICE[d.device].icon;
                  const share = deviceTotal ? Math.round((d.impressions / deviceTotal) * 100) : 0;
                  return (
                    <li key={d.device} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{DEVICE[d.device].label}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {num(d.clicks)} clicks · avg <span className="font-semibold tabular-nums text-foreground">{posText(d)}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${share}%` }} />
                        </div>
                        <span className="w-9 text-right text-xs font-semibold tabular-nums">{share}%</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <PanelHeader
              title="By day"
              meta={`${seen.length} of ${detail.daily.length} days with impressions`}
              action={
                <ExportCsvButton
                  filename={csvFilename("search", detail.query, location.title, detail.from, "to", detail.to)}
                  what="days"
                  rows={() => [
                    ["Date", "Search query", "Clicks", "Impressions", "CTR %", "Avg position"],
                    ...days.map((d) => [d.date, detail.query, d.clicks, d.impressions, Math.round(d.ctr * 1000) / 10, d.impressions ? Math.round(d.position * 10) / 10 : ""]),
                  ]}
                />
              }
            />
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[34%] sm:w-[30%]" />
                <col className="w-[22%]" />
                <col className="w-[18%] sm:w-[14%]" />
                <col className="w-[26%] sm:w-[18%]" />
                <col className="hidden sm:table-column sm:w-[16%]" />
              </colgroup>
              <thead>
                <tr className="border-b text-left">
                  <th className="label-caps px-5 py-2.5 font-medium lg:px-6">Date</th>
                  <th className="label-caps px-3 py-2.5 font-medium">Position</th>
                  <th className="label-caps px-3 py-2.5 text-right font-medium">Clicks</th>
                  <th className="label-caps py-2.5 pl-3 pr-5 text-right font-medium sm:px-3">Impr.</th>
                  <th className="label-caps hidden py-2.5 pl-3 pr-5 text-right font-medium sm:table-cell lg:pr-6">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shownDays.map((d) => (
                  <tr key={d.date} className={cn(!d.impressions && "text-muted-foreground")}>
                    <td className="truncate px-5 py-2.5 lg:px-6">
                      <span className="sm:hidden">{fmtDay(d.date)}</span>
                      <span className="hidden sm:inline">{fmtLong(d.date)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <PositionBadge m={d} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{num(d.clicks)}</td>
                    <td className="py-2.5 pl-3 pr-5 text-right tabular-nums sm:px-3">{num(d.impressions)}</td>
                    <td className="hidden py-2.5 pl-3 pr-5 text-right tabular-nums text-muted-foreground sm:table-cell lg:pr-6">{d.impressions ? pct(d.ctr) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!allDays && days.length > shownDays.length && (
              <div className="border-t px-5 py-3 text-center lg:px-6">
                <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setAllDays(true)}>
                  Show all {days.length} days
                </button>
              </div>
            )}
            <p className="border-t px-5 py-2.5 text-xs text-muted-foreground lg:px-6">Position is Google&apos;s average for the day across everyone who searched. Search Console data is about 2 days behind.</p>
          </Card>
        </>
      )}
    </div>
  );
}
