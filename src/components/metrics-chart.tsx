"use client";

import type { ComparePoint } from "@/lib/metrics";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";


const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });

/** Current period (solid blue) vs previous period (dashed gray), like TasksBook's performance chart. */
export function MetricsChart({ data, metric }: { data: ComparePoint[]; metric: string }) {
  return (
    <div className="h-[280px] px-2 pb-4 pt-4 sm:px-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip
            cursor={{ stroke: "hsl(var(--border))" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as ComparePoint;
              return (
                <div className="min-w-[170px] rounded-md border bg-popover px-3 py-2 text-xs shadow-elegant">
                  <p className="mb-1.5 font-semibold">{metric}</p>
                  <Row color="var(--viz-1)" label={fmtDay(p.date)} value={p.current} />
                  {p.previous != null && p.previousDate && <Row color="hsl(var(--muted-foreground) / 0.6)" label={fmtDay(p.previousDate)} value={p.previous} />}
                </div>
              );
            }}
          />
          <Line type="monotone" dataKey="previous" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.6} strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="current" stroke="var(--viz-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
        {label}
      </span>
      <span className="tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}

export function ChartLegend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="18" height="6" aria-hidden="true">
        <line x1="0" y1="3" x2="18" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}
