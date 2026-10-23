"use client";

// Date range picker, ported from TasksBook CRM (src/components/common/DateRangePicker.tsx).
// The two-month range calendar is built in-house instead of react-day-picker.

import { useEffect, useRef, useState } from "react";
import { addMonths, format, isAfter, isBefore, isSameDay, isSameMonth, isToday, startOfDay, subDays, subMonths } from "date-fns";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { Popover, Switch } from "@/components/ui-client";
import { MENU_PRESETS, RANGE_PRESETS, presetRange, rangeLabel, type DateRangeValue, type RangePreset } from "@/lib/date-ranges";
import { monthGrid } from "@/lib/posts";
import { cn } from "@/lib/utils";

export function DateRangePicker({ value, onChange, className }: { value: DateRangeValue; onChange: (v: DateRangeValue) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRangeValue>(value);
  const [picking, setPicking] = useState(false); // first click of a custom range made, waiting for the second
  const [month, setMonth] = useState<Date>(subMonths(value.to, 1));
  const [twoMonths, setTwoMonths] = useState(true);
  const anchor = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setPicking(false);
    const wide = window.matchMedia("(min-width: 768px)").matches;
    setTwoMonths(wide);
    setMonth(wide ? subMonths(value.to, 1) : value.to);
  }, [open, value]);

  const today = startOfDay(new Date());

  const pickPreset = (key: Exclude<RangePreset, "custom">) => {
    const r = presetRange(key);
    setDraft((d) => ({ ...d, preset: key, ...r }));
    setPicking(false);
    setMonth(subMonths(r.to, twoMonths ? 1 : 0));
  };

  const pickDay = (day: Date) => {
    if (isAfter(day, today)) return;
    if (!picking || !draft.from) {
      setDraft((d) => ({ ...d, preset: "custom", from: day, to: day }));
      setPicking(true);
      return;
    }
    const [a, b] = isBefore(day, draft.from) ? [day, draft.from] : [draft.from, day];
    setDraft((d) => ({ ...d, preset: "custom", from: a, to: b }));
    setPicking(false);
  };

  const fmtShort = (d: Date) => format(d, "MM/dd");
  const months = twoMonths ? [month, addMonths(month, 1)] : [month];

  return (
    <div className={cn("min-w-0", className)}>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg border border-input bg-card px-3 text-sm transition-colors hover:bg-muted/50",
          open && "border-primary ring-2 ring-primary/20",
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-left font-semibold">{rangeLabel(value)}</span>
        <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:inline">{value.from ? `${fmtShort(value.from)} – ${fmtShort(value.to)}` : "Since start"}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end" label="Choose dates" className="w-max">
        <div>
          <div className="flex flex-col md:flex-row">
            {/* presets */}
            <div className="border-b p-3 md:w-48 md:border-b-0 md:border-r">
              <p className="label-caps mb-2 px-2">Select interval</p>
              <div className="no-scrollbar flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
                {[...MENU_PRESETS.map((k) => RANGE_PRESETS.find((p) => p.key === k)!), { key: "custom" as const, label: "Custom range" }].map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => (p.key === "custom" ? setDraft((d) => ({ ...d, preset: "custom", from: d.from ?? subDays(d.to, 29) })) : pickPreset(p.key))}
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      draft.preset === p.key ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* calendar + footer */}
            <div className="flex min-w-0 flex-col">
              <div className="flex flex-col gap-6 p-4 md:flex-row">
                {months.map((m, mi) => (
                  <div key={m.toISOString()} className="space-y-2">
                    <div className="flex h-8 items-center justify-between">
                      {mi === 0 ? (
                        <button type="button" className={buttonClass("outline", "icon", "h-8 w-8")} aria-label="Previous month" onClick={() => setMonth((x) => subMonths(x, 1))}>
                          <ChevronLeft />
                        </button>
                      ) : (
                        <span className="w-8" />
                      )}
                      <span className="text-sm font-semibold">{format(m, "MMMM yyyy")}</span>
                      {mi === months.length - 1 ? (
                        <button
                          type="button"
                          className={buttonClass("outline", "icon", "h-8 w-8")}
                          aria-label="Next month"
                          disabled={isSameMonth(m, today) || isAfter(m, today)}
                          onClick={() => setMonth((x) => addMonths(x, 1))}
                        >
                          <ChevronRight />
                        </button>
                      ) : (
                        <span className="w-8" />
                      )}
                    </div>
                    <div className="grid grid-cols-7 text-center">
                      {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                        <span key={d} className="w-10 py-1 text-xs font-semibold text-muted-foreground">
                          {d}
                        </span>
                      ))}
                      {monthGrid(m)
                        .slice(0, 42)
                        .map((day) => {
                          const disabled = isAfter(day, today);
                          const outside = !isSameMonth(day, m);
                          const from = draft.from;
                          const isStart = !!from && isSameDay(day, from);
                          const isEnd = !!from && isSameDay(day, draft.to);
                          const inRange = !!from && !isBefore(day, from) && !isAfter(day, draft.to);
                          return (
                            <span key={day.toISOString()} className="p-0.5">
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => pickDay(day)}
                                aria-pressed={inRange}
                                aria-label={format(day, "EEEE, MMMM d, yyyy")}
                                className={cn(
                                  "h-9 w-9 rounded-md text-sm tabular-nums transition-colors",
                                  disabled ? "cursor-default text-muted-foreground/30" : "hover:bg-muted",
                                  outside && !inRange && !disabled && "text-muted-foreground/40",
                                  isToday(day) && !inRange && "font-semibold text-primary",
                                  inRange && "bg-primary/10 text-primary hover:bg-primary/15",
                                  (isStart || isEnd) && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                                )}
                              >
                                {day.getDate()}
                              </button>
                            </span>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Interval</span>
                  <span className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-foreground">{draft.from ? format(draft.from, "MMM d, yyyy") : "Start"}</span>
                  <span>→</span>
                  <span className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-foreground">{format(draft.to, "MMM d, yyyy")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("flex items-center gap-2 text-sm", !draft.from && "opacity-40")}>
                    <Switch checked={draft.compare && !!draft.from} onChange={(c) => draft.from && setDraft((d) => ({ ...d, compare: c }))} label="Compare previous period" />
                    Compare prev period
                  </span>
                  <button
                    type="button"
                    className={buttonClass("default", "sm")}
                    onClick={() => {
                      onChange({ ...draft, compare: draft.compare && !!draft.from });
                      setOpen(false);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Popover>
    </div>
  );
}
