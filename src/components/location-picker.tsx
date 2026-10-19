"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function LocationPicker({ locations }: { locations: { id: string; title: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("location") ?? locations[0]?.id;
  return (
    <select
      aria-label="Location"
      value={current}
      onChange={(e) => router.push(`${pathname}?location=${encodeURIComponent(e.target.value)}`)}
      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
    >
      {locations.map((l) => (
        <option key={l.id} value={l.id}>
          {l.title}
        </option>
      ))}
    </select>
  );
}
