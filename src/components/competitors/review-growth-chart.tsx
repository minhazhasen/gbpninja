"use client";

// Review growth over time: one line per business (you + chosen competitors). "Total" = review count; "Growth" = reviews gained
// since the start of the range (every line starts at 0, so big and small businesses compare fairly). Date range = the Performance
// page's DateRangePicker. The Competitors menu picks
// which lines show (up to 8, each with its own colour).
import { useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Check, ChevronDown } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, PanelHeader, buttonClass } from "@/components/ui";
import { Popover, Segmented } from "@/components/ui-client";
import { DateRangePicker } from "@/components/date-range-picker";
import { daysBetween, makeRange, rangeLabel, type DateRangeValue } from "@/lib/date-ranges";
import type { CompetitorPoint } from "@/lib/gbp/types";
import { cn } from "@/lib/utils";

export interface GrowthSeries {
  id: string;
  name: string;
  you?: boolean;
  reviewCount: number;
  history?: CompetitorPoint[];
}

const MAX_LINES = 8;
const COLORS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)", "var(--viz-6)", "var(--viz-7)", "var(--viz-8)"];

/** The value on `date`: the latest point at or before it (checks can skip days). null before the first point. */
function valueOn(history: CompetitorPoint[], date: string) {
  let v: number | null = null;
  for (const p of history) {
    if (p.date > date) break;
    v = p.reviewCount;
  }
  return v;
}

export function ReviewGrowthChart({ series }: { series: GrowthSeries[] }) {
  const withData = useMemo(() => series.filter((s) => (s.history?.length ?? 0) > 0), [series]);
  // Default: you + the 4 competitors with the most reviews.
  const [selected, setSelected] = useState<string[]>(() => [
    ...withData.filter((s) => s.you).map((s) => s.id),
    ...withData
      .filter((s) => !s.you)
      .sort((a, b) => b.reviewCount - a.reviewCount)
      .slice(0, 4)
      .map((s) => s.id),
  ]);
  const [mode, setMode] = useState<"total" | "growth">("total");
  const [range, setRange] = useState<DateRangeValue>(() => makeRange("last30"));
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  const shown = withData.filter((s) => selected.includes(s.id));
  // Colours go to the lines on screen (at most 8, so always distinct), in list order: you first = viz-1.
  const colorOf = (id: string) => {
    const i = shown.findIndex((s) => s.id === id);
    return i < 0 ? "hsl(var(--muted-foreground) / 0.4)" : COLORS[i];
  };

  const data = useMemo(() => {
    // "All time" starts at the oldest history point.
    const oldest = shown.flatMap((s) => s.history ?? []).reduce<string | null>((m, p) => (m == null || p.date < m ? p.date : m), null);
    const from = range.from ?? (oldest ? parseISO(oldest) : range.to);
    const dates = daysBetween(from, range.to);
    const base: Record<string, number | null> = {};
    if (mode === "growth")
      for (const s of shown) {
        const sorted = [...(s.history ?? [])].sort((a, b) => a.date.localeCompare(b.date));
        base[s.id] = dates.map((d) => valueOn(sorted, d)).find((v) => v != null) ?? null;
      }
    return dates.map((date) => {
      const row: Record<string, number | string | null> = { date };
      for (const s of shown) {
        const v = valueOn(
          [...(s.history ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
          date,
        );
        row[s.id] = v == null ? null : mode === "growth" ? v - (base[s.id] ?? v) : v;
      }
      return row;
    });
  }, [shown, mode, range]);

  /** How many days a business has a value in the range (1 = just added today: drawn as a dot, a line needs two). */
  const pointsIn = (id: string) => data.filter((row) => row[id] != null).length;
  const toggle = (id: string) => setSelected((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length >= MAX_LINES ? xs : [...xs, id]));
  const competitors = withData.filter((s) => !s.you);
  const nameOf = (id: string) => withData.find((s) => s.id === id)?.name ?? id;

  return (
    <Card className="overflow-hidden">
      <PanelHeader
        title="Review growth"
        meta={`${mode === "growth" ? "new reviews" : "total reviews"} · ${rangeLabel(range).toLowerCase() || "custom range"}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Show"
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "total", label: "Total" },
                { value: "growth", label: "Growth" },
              ]}
            />
            <DateRangePicker className="w-full sm:w-[300px]" value={range} onChange={setRange} />
            <button ref={anchor} type="button" className={buttonClass("outline", "sm")} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
              Competitors · {shown.filter((s) => !s.you).length}
              <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
            </button>
            <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end" label="Choose competitors" className="w-72">
              <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
                <span className="text-muted-foreground">Up to {MAX_LINES} lines</span>
                <span className="flex gap-3">
                  <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setSelected(withData.slice(0, MAX_LINES).map((s) => s.id))}>
                    All
                  </button>
                  <button type="button" className="font-semibold text-muted-foreground hover:underline" onClick={() => setSelected(withData.filter((s) => s.you).map((s) => s.id))}>
                    Clear
                  </button>
                </span>
              </div>
              <ul className="max-h-72 overflow-y-auto p-1">
                {withData.map((s) => {
                  const on = selected.includes(s.id);
                  const full = !on && selected.length >= MAX_LINES;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={on}
                        disabled={full}
                        onClick={() => toggle(s.id)}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40"
                      >
                        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(s.id) }} />
                        <span className="min-w-0 flex-1 truncate">
                          {s.name}
                          {s.you && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">{s.reviewCount.toLocaleString()}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Popover>
          </div>
        }
      />
      {!competitors.length && !shown.length ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Review history appears here once competitors are added and checked.</p>
      ) : !shown.length ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Pick businesses in the Competitors menu to compare.</p>
      ) : (
        <>
          <div className="h-[280px] px-2 pb-2 pt-4 sm:px-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(d: string) => format(parseISO(d), "MMM d")}
                  interval="preserveStartEnd"
                  minTickGap={32}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--border))" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const rows = [...payload].filter((p) => p.value != null).sort((a, b) => Number(b.value) - Number(a.value));
                    return (
                      <div className="min-w-[200px] rounded-md border bg-popover px-3 py-2 text-xs shadow-elegant">
                        <p className="mb-1.5 font-semibold">{format(parseISO(String(label)), "EEE d MMM yyyy")}</p>
                        {rows.map((p) => (
                          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
                            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color }} />
                              <span className="truncate">{nameOf(String(p.dataKey))}</span>
                            </span>
                            <span className="tabular-nums">
                              {mode === "growth" && Number(p.value) > 0 ? "+" : ""}
                              {Number(p.value).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                {shown.map((s) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    name={s.name}
                    stroke={colorOf(s.id)}
                    strokeWidth={s.you ? 2.5 : 1.75}
                    // A business with one check in range (just added) shows as a dot until its line builds up.
                    dot={pointsIn(s.id) === 1 ? { r: 3.5, fill: colorOf(s.id), strokeWidth: 0 } : false}
                    activeDot={{ r: 4 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t px-5 py-2.5 text-xs lg:px-6">
            {shown.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(s.id) }} />
                <span className={cn(s.you && "font-semibold")}>{s.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
