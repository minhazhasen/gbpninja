import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmt = (v: number) => v.toLocaleString("en-US");

/** Percent change from `prev` to `cur`, rounded; null when there is no baseline. */
export function delta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Builds a query string that keeps the selected location. */
export function withLocation(path: string, locationId: string, extra: Record<string, string> = {}) {
  const qs = new URLSearchParams({ location: locationId, ...extra });
  return `${path}?${qs}`;
}
