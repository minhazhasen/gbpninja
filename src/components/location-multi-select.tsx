"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { Popover } from "@/components/ui-client";
import { cn } from "@/lib/utils";

/** Pick one, several or all locations. At least one stays selected. */
export function LocationMultiSelect({
  locations,
  value,
  onChange,
  className,
}: {
  locations: { id: string; title: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const all = value.length === locations.length;
  const label = all ? `All locations (${locations.length})` : value.length === 1 ? (locations.find((l) => l.id === value[0])?.title ?? "1 location") : `${value.length} of ${locations.length} locations`;

  const toggle = (id: string) => {
    const next = value.includes(id) ? value.filter((x) => x !== id) : locations.map((l) => l.id).filter((x) => x === id || value.includes(x));
    if (next.length) onChange(next);
  };

  const row = (checked: boolean, text: React.ReactNode, onClick: () => void, bold?: boolean) => (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none", bold && "font-semibold")}
    >
      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
    </button>
  );

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Locations: ${label}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 min-w-0 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm transition-colors hover:bg-muted/50",
          open && "border-primary ring-2 ring-primary/20",
          className,
        )}
      >
        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label="Choose locations" className="w-72 p-1.5">
        <div role="menu">
          {row(all, `All locations (${locations.length})`, () => onChange(all ? locations.slice(0, 1).map((l) => l.id) : locations.map((l) => l.id)), true)}
          <div className="my-1 h-px bg-border" />
          {locations.map((l) => (
            <div key={l.id}>{row(value.includes(l.id), l.title, () => toggle(l.id))}</div>
          ))}
        </div>
        <p className="px-2.5 pb-1.5 pt-2 text-xs text-muted-foreground">Pick one or more locations.</p>
      </Popover>
    </>
  );
}
