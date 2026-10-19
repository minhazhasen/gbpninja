"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MetricPoint } from "@/lib/gbp/types";

const series = [
  { key: "calls", name: "Calls", color: "#1a73e8" },
  { key: "websiteClicks", name: "Website clicks", color: "#e8710a" },
  { key: "directions", name: "Directions", color: "#12b5cb" },
] as const;

export function MetricsChart({ data, metric }: { data: MetricPoint[]; metric: "impressions" | "actions" }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11, fill: "var(--muted)" }} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12 }} />
          {metric === "impressions" ? (
            <Line type="monotone" dataKey="impressions" name="Impressions" stroke="#1a73e8" strokeWidth={2} dot={false} />
          ) : (
            series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} />)
          )}
          {metric === "actions" && <Legend wrapperStyle={{ fontSize: 12 }} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
