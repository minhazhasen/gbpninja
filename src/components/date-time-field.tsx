"use client";

// Date, time and date-time fields in the app's style (replaces the browser's native pickers).
// Values are local wall-clock strings: "yyyy-MM-dd", "HH:mm" and "yyyy-MM-ddTHH:mm".

import { useEffect, useRef, useState } from "react";
import { addMonths, format, isBefore, isSameDay, isSameMonth, isToday, isValid, parse, startOfDay, startOfMonth, subMonths } from "date-fns";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { Popover } from "@/components/ui-client";
import { monthGrid } from "@/lib/posts";
import { cn } from "@/lib/utils";

const MINUTE_STEP = 5;
const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
const MONTHS = Array.from({ length: 12 }, (_, i) => format(new Date(2000, i, 1), "MMMM"));

const pad = (n: number) => String(n).padStart(2, "0");
const parseDate = (v: string) => {
  const d = v ? parse(v.slice(0, 10), "yyyy-MM-dd", new Date()) : null;
  return d && isValid(d) ? d : null;
};
/** "HH:mm" → minutes after midnight. */
const parseTime = (v: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const timeLabel = (mins: number) => format(new Date(2000, 0, 1, Math.floor(mins / 60), mins % 60), "h:mm a");

// ---------------------------------------------------------------- shared bits
function FieldButton({
  anchor,
  open,
  onClick,
  id,
  icon: Icon,
  text,
  placeholder,
  invalid,
  disabled,
  onClear,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  open: boolean;
  onClick: () => void;
  id?: string;
  icon: React.ElementType;
  text: string | null;
  placeholder: string;
  invalid?: boolean;
  disabled?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className="relative min-w-0">
      <button
        ref={anchor}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onClick}
        className={cn(
          "flex h-10 w-full min-w-0 items-center gap-2.5 rounded-xl border border-input bg-card px-3 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-70",
          open && "border-primary ring-2 ring-primary/20",
          invalid && "border-destructive",
          onClear && text && "pr-9",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", text ? "text-foreground/70" : "text-muted-foreground")} />
        <span className={cn("min-w-0 flex-1 truncate", !text && "text-muted-foreground")}>{text ?? placeholder}</span>
      </button>
      {onClear && text && !disabled && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Month/year dropdown shown as plain text with a small chevron underneath. */
function HeaderSelect({ value, options, onChange, label }: { value: number; options: { value: number; label: string }[]; onChange: (v: number) => void; label: string }) {
  return (
    <label className="relative inline-flex flex-col items-center rounded-lg px-1.5 pt-0.5 hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
      <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="text-[15px] font-semibold leading-tight">{options.find((o) => o.value === value)?.label}</span>
      <ChevronDown className="h-3 w-3 text-muted-foreground" strokeWidth={3} />
    </label>
  );
}

function Calendar({ month, setMonth, selected, onPick, minDay }: { month: Date; setMonth: (d: Date) => void; selected: Date | null; onPick: (d: Date) => void; minDay?: Date | null }) {
  const year = month.getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => year - 5 + i);
  const navBtn = "flex h-9 w-9 items-center justify-center rounded-xl border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  return (
    <div className="w-[300px] p-4">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className={navBtn} aria-label="Previous month" onClick={() => setMonth(subMonths(month, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-2">
          <HeaderSelect label="Month" value={month.getMonth()} options={MONTHS.map((m, i) => ({ value: i, label: m }))} onChange={(m) => setMonth(new Date(year, m, 1))} />
          <HeaderSelect label="Year" value={year} options={years.map((y) => ({ value: y, label: String(y) }))} onChange={(y) => setMonth(new Date(y, month.getMonth(), 1))} />
        </div>
        <button type="button" className={navBtn} aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <span key={d} className="pb-2 text-xs font-semibold text-muted-foreground">
            {d}
          </span>
        ))}
        {monthGrid(month)
          // Drop a trailing week that belongs entirely to the next month.
          .filter((day, i, all) => i < 35 || isSameMonth(all[35], month))
          .map((day) => {
            const disabled = !!minDay && isBefore(day, minDay);
            const sel = !!selected && isSameDay(day, selected);
            const outside = !isSameMonth(day, month);
            return (
              <span key={day.toISOString()} className="flex justify-center p-0.5">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(day)}
                  aria-pressed={sel}
                  aria-label={format(day, "EEEE, MMMM d, yyyy")}
                  className={cn(
                    "h-9 w-9 rounded-xl text-sm tabular-nums transition-colors",
                    disabled ? "cursor-default text-muted-foreground/35" : "hover:bg-muted",
                    outside && !disabled && "text-muted-foreground/40",
                    isToday(day) && !sel && "font-semibold text-primary ring-2 ring-inset ring-primary",
                    sel && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                  )}
                >
                  {day.getDate()}
                </button>
              </span>
            );
          })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- DateField
/** Date only ("yyyy-MM-dd"). `min` is "yyyy-MM-dd". */
export function DateField({
  value,
  onChange,
  min,
  id,
  invalid,
  disabled,
  placeholder = "Select date",
  clearable = true,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const current = parseDate(value);
  const minDay = min ? parseDate(min) : null;
  const [month, setMonth] = useState<Date>(startOfMonth(current ?? minDay ?? new Date()));
  useEffect(() => {
    if (open) setMonth(startOfMonth(current ?? minDay ?? new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const todayOff = !!minDay && isBefore(startOfDay(new Date()), minDay);

  return (
    <>
      <FieldButton anchor={anchor} open={open} onClick={() => setOpen(!open)} id={id} icon={CalendarDays} text={current ? format(current, "EEE, MMM d, yyyy") : null} placeholder={placeholder} invalid={invalid} disabled={disabled} />
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label="Choose date">
        <Calendar
          month={month}
          setMonth={setMonth}
          selected={current}
          minDay={minDay}
          onPick={(d) => {
            onChange(format(d, "yyyy-MM-dd"));
            setOpen(false);
          }}
        />
        <div className="flex items-center justify-between border-t px-4 py-3">
          {clearable ? (
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm font-semibold hover:bg-muted"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={todayOff}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-primary hover:bg-accent disabled:opacity-40"
            onClick={() => {
              onChange(format(new Date(), "yyyy-MM-dd"));
              setOpen(false);
            }}
          >
            Today
          </button>
        </div>
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------- TimeField
function Column<T extends string | number>({ items, value, onPick, render, isOff, label }: { items: T[]; value: T | null; onPick: (v: T) => void; render: (v: T) => string; isOff?: (v: T) => boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView({ block: "center" });
  }, [value]);
  return (
    <div ref={ref} role="listbox" aria-label={label} className="no-scrollbar h-[264px] w-[76px] space-y-1 overflow-y-auto px-1.5 py-2 [&+&]:border-l">
      {items.map((it) => {
        const sel = it === value;
        const off = isOff?.(it) ?? false;
        return (
          <button
            key={String(it)}
            type="button"
            role="option"
            aria-selected={sel}
            disabled={off}
            onClick={() => onPick(it)}
            className={cn(
              "flex h-10 w-full items-center justify-center rounded-xl text-[15px] tabular-nums transition-colors",
              off ? "cursor-default text-muted-foreground/30" : "hover:bg-muted",
              sel && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
            )}
          >
            {render(it)}
          </button>
        );
      })}
    </div>
  );
}

/** Time only ("HH:mm", 5-minute steps). `minMinutes` disables earlier times (e.g. earlier today). */
export function TimeField({
  value,
  onChange,
  id,
  invalid,
  disabled,
  placeholder = "Select time",
  defaultTime = "09:00",
  minMinutes = -1,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  defaultTime?: string;
  minMinutes?: number;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const mins = parseTime(value);
  // Show the default time highlighted while nothing is picked yet.
  const shown = mins ?? parseTime(defaultTime) ?? 9 * 60;
  const h24 = Math.floor(shown / 60);
  const minute = shown % 60;
  const pm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

  const set = (h: number, m: number, isPm: boolean) => {
    const hh = (h % 12) + (isPm ? 12 : 0);
    onChange(`${pad(hh)}:${pad(m)}`);
  };
  const total = (h: number, m: number, isPm: boolean) => ((h % 12) + (isPm ? 12 : 0)) * 60 + m;

  return (
    <>
      <FieldButton anchor={anchor} open={open} onClick={() => setOpen(!open)} id={id} icon={Clock} text={mins != null ? timeLabel(mins) : null} placeholder={placeholder} invalid={invalid} disabled={disabled} />
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label="Choose time">
        <div className="flex">
          <Column label="Hour" items={HOURS_12} value={h12} render={(h) => String(h)} onPick={(h) => set(h, minute, pm)} isOff={(h) => total(h, 55, pm) < minMinutes} />
          <Column label="Minute" items={MINUTES} value={minute - (minute % MINUTE_STEP)} render={pad} onPick={(m) => set(h12, m, pm)} isOff={(m) => total(h12, m, pm) < minMinutes} />
          <Column label="AM or PM" items={["AM", "PM"]} value={pm ? "PM" : "AM"} render={(v) => v} onPick={(v) => set(h12, minute, v === "PM")} isOff={(v) => total(11, 55, v === "PM") < minMinutes} />
        </div>
        <div className="flex justify-end border-t px-3 py-3">
          <button
            type="button"
            className={buttonClass("default", "sm", "rounded-xl px-5")}
            onClick={() => {
              if (mins == null) set(h12, minute, pm); // accept the highlighted default
              setOpen(false);
            }}
          >
            Done
          </button>
        </div>
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------- DateTimeField
/** Date + time side by side ("yyyy-MM-ddTHH:mm"). `min` blocks earlier days and, on that day, earlier times. */
export function DateTimeField({
  value,
  onChange,
  min,
  id,
  invalid,
  disabled,
  defaultTime = "09:00",
  clearable,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: Date | null;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  defaultTime?: string;
  clearable?: boolean;
}) {
  const date = value.slice(0, 10);
  const time = value.length >= 16 ? value.slice(11, 16) : "";
  const minDate = min ? format(min, "yyyy-MM-dd") : undefined;
  const minMinutes = min && date === minDate ? min.getHours() * 60 + min.getMinutes() : -1;

  const emit = (d: string, t: string) => {
    if (!d) return onChange("");
    let mins = parseTime(t) ?? parseTime(defaultTime) ?? 9 * 60;
    const floor = min && d === minDate ? min.getHours() * 60 + min.getMinutes() : -1;
    if (mins < floor) mins = Math.min(23 * 60 + 55, Math.ceil(floor / MINUTE_STEP) * MINUTE_STEP); // keep it valid on min's day
    onChange(`${d}T${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
      <DateField id={id} value={date} min={minDate} invalid={invalid} disabled={disabled} clearable={clearable} onChange={(d) => emit(d, time)} />
      <TimeField
        value={time}
        defaultTime={defaultTime}
        invalid={invalid}
        disabled={disabled}
        minMinutes={minMinutes}
        // Picking a time first fills in today (or the earliest allowed day).
        onChange={(t) => emit(date || (minDate && isBefore(startOfDay(new Date()), parseDate(minDate)!) ? minDate : format(new Date(), "yyyy-MM-dd")), t)}
      />
    </div>
  );
}
