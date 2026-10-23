"use client";

// Reviews over time, two views: Monthly (default) = January–December of this year as bars, each next to the same month last year;
// Daily = a line per day across the picked date range (previous period dashed when comparing). Long ranges / All time show the
// last 90 days in the daily view, so the line stays readable.
import { useMemo, useState } from "react";
import { subDays } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LabelProps } from "recharts";
import { PanelHeader } from "@/components/ui";
import { Segmented } from "@/components/ui-client";
import { previousRange, rangeLabel, type DateRangeValue } from "@/lib/date-ranges";
import type { Review } from "@/lib/gbp/types";
import { monthlyComparison, reviewSeries } from "@/lib/reviews";
import { cn } from "@/lib/utils";

const AXIS = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const MAX_DAILY = 366;

type Row = { label: string; tip: string; prevTip?: string; count: number; prev: number; forecast?: number | null; extra?: number };

/** Number above a bar (hidden for zero). `dy` lifts it clear of the bar top. */
const barLabel = (fill: string) =>
  function BarNumber(props: LabelProps) {
    const v = Number(props.value ?? 0);
    if (!v) return null;
    return (
      <text x={Number(props.x) + Number(props.width) / 2} y={Number(props.y) - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill={fill} className="tabular-nums">
        {v}
      </text>
    );
  };

function TipBox({ title, rows }: { title: string; rows: [string, number, "cur" | "prev" | "forecast"][] }) {
  return (
    <div className="min-w-[160px] rounded-md border bg-popover px-3 py-2 text-xs shadow-elegant">
      <p className="mb-1 font-semibold">{title}</p>
      {rows.map(([name, n, kind]) => (
        <div key={name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className={cn("h-2 w-2 rounded-sm", kind === "prev" && "bg-muted-foreground/40")}
              style={kind === "cur" ? { background: "var(--viz-1)" } : kind === "forecast" ? { background: "var(--viz-1)", opacity: 0.3 } : undefined}
            />
            {name}
          </span>
          <span className="tabular-nums">{n.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ cur, prev, forecast }: { cur: string; prev?: string; forecast?: boolean }) {
  return (
    <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-1)" }} />
        {cur}
      </span>
      {forecast && (
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-1)", opacity: 0.3 }} />
          Forecast
        </span>
      )}
      {prev && (
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/35" />
          {prev}
        </span>
      )}
    </div>
  );
}

/** `timeZone`: the business's (reviews are counted in its own calendar, not the viewer's). */
export function ReviewTrendChart({ items, range, timeZone }: { items: Pick<Review, "createTime">[]; range: DateRangeValue; timeZone?: string }) {
  const [view, setView] = useState<"monthly" | "daily">("monthly");
  const monthly = useMemo(() => monthlyComparison(items, timeZone), [items, timeZone]);

  // Daily: the picked range, or its last 90 days when it's longer than a year / all time.
  const capped = !range.from || (range.to.getTime() - range.from.getTime()) / 86_400_000 > MAX_DAILY;
  const from = capped ? subDays(range.to, 89) : range.from!;
  const compare = range.compare;
  const daily = useMemo(() => reviewSeries(items, from, range.to, compare ? previousRange({ from, to: range.to }) : null, "day", timeZone).rows, [items, from, range.to, compare, timeZone]);

  const thisYear = new Date().getFullYear();
  return (
    <div className="min-w-0">
      <PanelHeader
        title={view === "monthly" ? "Reviews by month" : "Reviews by day"}
        meta={view === "monthly" ? `${thisYear} vs ${thisYear - 1}` : capped ? "last 90 days" : rangeLabel(range).toLowerCase()}
        action={
          // -my-1: keeps this header the same 56px height as the Ratings header next to it, so their borders line up.
          <div className="-my-1 flex items-center gap-3">
            {view === "monthly" ? <Legend cur={String(thisYear)} prev={String(thisYear - 1)} forecast /> : <Legend cur="This period" prev={compare ? "Previous" : undefined} />}
            <Segmented
              label="Chart view"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "daily", label: "Daily" },
              ]}
            />
          </div>
        }
      />
      <div className="h-[220px] px-2 pb-3 pt-4 sm:px-4">
        <ResponsiveContainer width="100%" height="100%">
          {view === "monthly" ? (
            <BarChart data={monthly} margin={{ top: 18, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} interval={0} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={AXIS} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Row;
                  const rows: [string, number, "cur" | "prev" | "forecast"][] = [[p.forecast != null ? "So far" : "Reviews", p.count, "cur"]];
                  if (p.forecast != null) rows.push(["Forecast", p.forecast, "forecast"]);
                  rows.push([p.prevTip ?? "Year before", p.prev, "prev"]);
                  return <TipBox title={p.tip} rows={rows} />;
                }}
              />
              <Bar dataKey="prev" name={String(thisYear - 1)} stackId="last" fill="hsl(var(--muted-foreground))" fillOpacity={0.35} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false}>
                <LabelList dataKey="prev" content={barLabel("hsl(var(--muted-foreground))")} />
              </Bar>
              {/* This year: what's in (solid) with the forecast still to come stacked on top (light). */}
              <Bar dataKey="count" name={String(thisYear)} stackId="year" fill="var(--viz-1)" maxBarSize={22} isAnimationActive={false}>
                {monthly.map((r) => (
                  <Cell key={r.key} radius={(r.extra ? [0, 0, 0, 0] : [3, 3, 0, 0]) as unknown as number} />
                ))}
                <LabelList dataKey="count" content={barLabel("hsl(var(--foreground))")} />
              </Bar>
              <Bar dataKey="extra" name="Forecast" stackId="year" fill="var(--viz-1)" fillOpacity={0.3} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false}>
                <LabelList dataKey="forecast" content={barLabel("hsl(var(--muted-foreground))")} />
              </Bar>
            </BarChart>
          ) : (
            <LineChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} interval="preserveStartEnd" minTickGap={24} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={AXIS} />
              <Tooltip
                cursor={{ stroke: "hsl(var(--border))" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Row;
                  const rows: [string, number, "cur" | "prev"][] = [["Reviews", p.count, "cur"]];
                  if (compare) rows.push(["Previous period", p.prev, "prev"]);
                  return <TipBox title={p.tip} rows={rows} />;
                }}
              />
              {compare && (
                <Line type="monotone" dataKey="prev" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              )}
              <Line type="monotone" dataKey="count" stroke="var(--viz-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
