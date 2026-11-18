"use client";

// Admin → workspace → Overview: last 30 days, one bar per day, all profiles together. Views / Customer actions / New reviews.
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, PanelHeader } from "@/components/ui";
import { Segmented } from "@/components/ui-client";
import type { WorkspaceInsights } from "@/lib/platform/store";
import { fmt } from "@/lib/utils";

type Metric = "views" | "actions" | "reviews";
const LABEL: Record<Metric, string> = { views: "Profile views", actions: "Customer actions", reviews: "New reviews" };

export function WorkspaceTrend({ daily }: { daily: WorkspaceInsights["daily"] }) {
  const [metric, setMetric] = useState<Metric>("views");
  const total = daily.reduce((n, d) => n + d[metric], 0);
  return (
    <Card className="overflow-hidden">
      <PanelHeader
        title="Last 30 days"
        meta={`${fmt(total)} ${LABEL[metric].toLowerCase()}`}
        action={
          <Segmented
            label="Metric"
            size="sm"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "views", label: "Views" },
              { value: "actions", label: "Actions" },
              { value: "reviews", label: "Reviews" },
            ]}
          />
        }
      />
      <div className="h-[240px] px-2 pb-4 pt-4 sm:px-4 [&_*:focus]:outline-none">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(d: string) => format(parseISO(d), "MMM d")}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.6)" }}
              content={({ active, payload }) => {
                const d = active ? (payload?.[0]?.payload as WorkspaceInsights["daily"][number] | undefined) : undefined;
                if (!d) return null;
                return (
                  <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-elegant">
                    <p className="mb-1 font-semibold">{format(parseISO(d.date), "EEE d MMM yyyy")}</p>
                    <p className="text-muted-foreground">
                      {fmt(d.views)} views · {fmt(d.actions)} actions · {d.reviews} reviews
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey={metric} fill="var(--viz-1)" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
