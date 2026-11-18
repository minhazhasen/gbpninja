"use client";

// Review growth, as bars (you + chosen competitors). "Total" = one bar per business: its review count at the end of the
// range. "Growth" = new reviews per day / week / month (by range length), one bar per business in each period, so big and small
// businesses compare fairly. Growth covers the last 30 days (no date picker). The Competitors menu picks which businesses
// show (up to 8, each with its own colour).
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Check, ChevronDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, PanelHeader, buttonClass } from "@/components/ui";
import { Popover, Segmented } from "@/components/ui-client";
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
  // Fixed window: Growth shows the last 30 days; Total is the count today.
  const [range] = useState<DateRangeValue>(() => makeRange("last30"));
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  const shown = withData.filter((s) => selected.includes(s.id));
  // Colours go to the lines on screen (at most 8, so always distinct), in list order: you first = viz-1.
  const colorOf = (id: string) => {
    const i = shown.findIndex((s) => s.id === id);
    return i < 0 ? "hsl(var(--muted-foreground) / 0.4)" : COLORS[i];
  };

  const sorted = useMemo(() => new Map(shown.map((s) => [s.id, [...(s.history ?? [])].sort((a, b) => a.date.localeCompare(b.date))])), [shown]);

  // Days in the range ("All time" starts at the oldest history point).
  const dates = useMemo(() => {
    const oldest = shown.flatMap((s) => s.history ?? []).reduce<string | null>((m, p) => (m == null || p.date < m ? p.date : m), null);
    return daysBetween(range.from ?? (oldest ? parseISO(oldest) : range.to), range.to);
  }, [shown, range]);

  // Total: each business's review count on the last day of the range, biggest first.
  const totals = useMemo(
    () =>
      shown
        .map((s) => ({ id: s.id, name: s.name, you: !!s.you, value: valueOn(sorted.get(s.id) ?? [], dates[dates.length - 1] ?? "") }))
        .filter((r): r is { id: string; name: string; you: boolean; value: number } => r.value != null)
        .sort((a, b) => b.value - a.value),
    [shown, sorted, dates],
  );

  // Growth: reviews gained per period. Days for up to 2 weeks, weeks up to ~4 months, then months.
  const unit: "day" | "week" | "month" = dates.length <= 14 ? "day" : dates.length <= 120 ? "week" : "month";
  const periods = useMemo(() => {
    const groups: string[][] = [];
    for (const d of dates) {
      const last = groups[groups.length - 1];
      const same = last && (unit === "day" ? false : unit === "week" ? last.length < 7 : last[0].slice(0, 7) === d.slice(0, 7));
      if (same) last.push(d);
      else groups.push([d]);
    }
    return groups.map((days) => {
      const row: Record<string, number | string | null> = { start: days[0], end: days[days.length - 1] };
      for (const s of shown) {
        const h = sorted.get(s.id) ?? [];
        const end = valueOn(h, days[days.length - 1]);
        // Before the period; for a business first checked inside it, its first value there (gain since it was added).
        const before = valueOn(h, format(addDays(parseISO(days[0]), -1), "yyyy-MM-dd")) ?? h.find((p) => p.date >= days[0] && p.date <= days[days.length - 1])?.reviewCount ?? null;
        row[s.id] = end == null || before == null ? null : Math.max(0, end - before);
      }
      return row;
    });
  }, [dates, unit, shown, sorted]);
  const periodLabel = (start: string, end: string) =>
    unit === "day" ? format(parseISO(start), "EEE d MMM") : unit === "month" ? format(parseISO(start), "MMMM yyyy") : `${format(parseISO(start), "d MMM")} – ${format(parseISO(end), "d MMM")}`;

  // Business names under the Total chart's bars: wrapped to two lines, shorter when each bar has less room (phones, many bars).
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const perLine = Math.max(8, Math.floor((narrow ? 300 : 900) / Math.max(1, totals.length) / 7));
  const nameLines = (name: string) => {
    const words = name.split(/\s+/);
    const lines: string[] = [""];
    for (const w of words) {
      const cur = lines[lines.length - 1];
      if (!cur || (cur + " " + w).length <= perLine) lines[lines.length - 1] = cur ? `${cur} ${w}` : w;
      else lines.push(w);
    }
    const two = lines.slice(0, 2).map((l) => (l.length > perLine ? `${l.slice(0, perLine - 1)}…` : l));
    if (lines.length > 2 && !two[1].endsWith("…")) two[1] = `${two[1].slice(0, Math.max(1, perLine - 1))}…`;
    return two;
  };
  const toggle = (id: string) => setSelected((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length >= MAX_LINES ? xs : [...xs, id]));
  const competitors = withData.filter((s) => !s.you);
  const nameOf = (id: string) => withData.find((s) => s.id === id)?.name ?? id;

  return (
    <Card className="overflow-hidden">
      <PanelHeader
        title="Review growth"
        meta={mode === "growth" ? `new reviews per ${unit} · ${rangeLabel(range).toLowerCase()}` : "total reviews today"}
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
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
            <button ref={anchor} type="button" className={buttonClass("outline", "sm", "ml-auto sm:ml-0")} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
              Competitors · {shown.filter((s) => !s.you).length}
              <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
            </button>
            <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end" label="Choose competitors" className="w-72">
              <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
                <span className="text-muted-foreground">Up to {MAX_LINES} businesses</span>
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
          {mode === "total" ? (
            <div className="h-[300px] px-2 pb-4 pt-6 sm:px-4 [&_*:focus]:outline-none">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={totals} margin={{ top: 16, right: 12, left: 0, bottom: 0 }} barCategoryGap="25%">
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    height={40}
                    // Names under the bars: up to two lines, shortened when long.
                    tick={({ x, y, payload, index }) => {
                      const lines = nameLines(String(payload.value));
                      return (
                        <text x={x} y={Number(y) + 12} textAnchor="middle" fontSize={11} fill="hsl(var(--foreground))" fontWeight={totals[index]?.you ? 600 : 400}>
                          {lines.map((l, k) => (
                            <tspan key={k} x={x} dy={k ? 14 : 0}>
                              {l}
                            </tspan>
                          ))}
                        </text>
                      );
                    }}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted) / 0.6)" }}
                    content={({ active, payload }) => {
                      const r = active ? (payload?.[0]?.payload as (typeof totals)[number] | undefined) : undefined;
                      if (!r) return null;
                      return (
                        <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-elegant">
                          <p className="font-semibold">{r.name}</p>
                          <p className="text-muted-foreground">
                            {r.value.toLocaleString()} reviews on {format(parseISO(dates[dates.length - 1]), "d MMM yyyy")}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
                    {totals.map((r) => (
                      <Cell key={r.id} fill={colorOf(r.id)} />
                    ))}
                    <LabelList dataKey="value" position="top" fontSize={12} fill="hsl(var(--foreground))" formatter={(v: unknown) => Number(v).toLocaleString()} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] px-2 pb-4 pt-4 sm:px-4 [&_*:focus]:outline-none">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={periods} margin={{ top: 18, right: 12, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="start"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(d: string) => format(parseISO(d), unit === "month" ? "MMM" : "MMM d")}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted) / 0.6)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as { start: string; end: string };
                      const rows = [...payload].filter((p) => p.value != null).sort((a, b) => Number(b.value) - Number(a.value));
                      return (
                        <div className="min-w-[200px] rounded-md border bg-popover px-3 py-2 text-xs shadow-elegant">
                          <p className="mb-1.5 font-semibold">{periodLabel(row.start, row.end)}</p>
                          {rows.map((p) => (
                            <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
                              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color }} />
                                <span className="truncate">{nameOf(String(p.dataKey))}</span>
                              </span>
                              <span className="tabular-nums">+{Number(p.value).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  {shown.map((s) => (
                    <Bar key={s.id} dataKey={s.id} name={s.name} fill={colorOf(s.id)} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false}>
                      {/* Count on top of each bar (none for 0 or no data). */}
                      <LabelList dataKey={s.id} position="top" fontSize={11} fill="hsl(var(--foreground))" formatter={(v: unknown) => (Number(v) > 0 ? Number(v).toLocaleString() : "")} />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
