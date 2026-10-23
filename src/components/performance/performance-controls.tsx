"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { DateRangePicker } from "@/components/date-range-picker";
import { LocationMultiSelect } from "@/components/location-multi-select";
import { rangeFromParams, rangeToParams, type DateRangeValue, type RangePreset } from "@/lib/date-ranges";
import { serializeLocationScope } from "@/lib/location-scope";
import { cn } from "@/lib/utils";

/** Location + date range controls. State lives in the URL so the page stays server-rendered. */
export function PerformanceControls({
  locations,
  scope,
  fallback = "last30",
}: {
  locations: { id: string; title: string }[];
  scope: string[];
  /** Preset used when the URL has no range. */
  fallback?: Exclude<RangePreset, "custom">;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const range = rangeFromParams(Object.fromEntries(params), fallback);

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${next}`, { scroll: false }));
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-2 transition-opacity sm:flex-row sm:items-center", pending && "opacity-60")}>
      {locations.length > 1 && (
        <LocationMultiSelect
          className="w-full sm:w-60"
          locations={locations}
          value={scope}
          onChange={(ids) => go({ location: serializeLocationScope(ids, locations.map((l) => l.id)) })}
        />
      )}
      <DateRangePicker
        className="sm:w-[300px]"
        value={range}
        onChange={(v: DateRangeValue) => go({ from: null, to: null, ...rangeToParams(v) })}
      />
    </div>
  );
}
