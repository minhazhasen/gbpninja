"use client";

// Monthly search queries: active month vs a compare month.
// Ported from TasksBook CRM (src/components/marketing/SearchQueriesPanel.tsx).

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, ChevronDown, ChevronsUpDown, Copy, Search } from "lucide-react";
import { Card, PanelHeader, buttonClass, inputClass } from "@/components/ui";
import {
  compareKeywords,
  defaultKeywordMonths,
  filterKeywordRows,
  keywordLabel,
  sortKeywordRows,
  type KeywordChange,
  type KeywordCount,
  type KeywordMonth,
  type KeywordSortKey,
} from "@/lib/keywords";
import { cn } from "@/lib/utils";

const PAGE = 25;
const monthLabel = (ym: string) => format(parseISO(`${ym}-01`), "MMM yyyy");

export function SearchQueriesPanel({ months }: { months: KeywordMonth[] }) {
  const ids = useMemo(() => months.map((m) => m.month), [months]);
  const [active, setActive] = useState<string | null>(null);
  const [compare, setCompare] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: KeywordSortKey; dir: 1 | -1 }>({ key: "active", dir: -1 });
  const [limit, setLimit] = useState(PAGE);

  // Default: latest available month vs the one before.
  useEffect(() => {
    if (active && ids.includes(active)) return;
    const d = defaultKeywordMonths(ids);
    setActive(d.active);
    setCompare(d.compare);
  }, [ids, active]);

  const byMonth = useMemo(() => new Map(months.map((m) => [m.month, m.keywords])), [months]);
  const all = useMemo(() => compareKeywords(active ? byMonth.get(active) : [], compare ? byMonth.get(compare) : []), [byMonth, active, compare]);
  const rows = useMemo(() => sortKeywordRows(filterKeywordRows(all, q), sort.key, sort.dir), [all, q, sort]);
  useEffect(() => setLimit(PAGE), [q, sort, active, compare]);

  const pickActive = (m: string) => {
    setActive(m);
    if (m === compare) setCompare(ids[ids.indexOf(m) + 1] ?? null);
  };
  const onSort = (k: KeywordSortKey) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: k === "keyword" ? 1 : -1 }));
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied"),
      () => toast.error("Could not copy"),
    );

  const shown = rows.slice(0, limit);
  const sortTh = (label: string, k: KeywordSortKey, className?: string, right?: boolean) => {
    const on = sort.key === k;
    const Icon = !on ? ChevronsUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th className={cn("label-caps whitespace-nowrap px-3 py-2.5", right && "text-right", className)} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
        <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 uppercase hover:text-foreground", on && "text-foreground", right && "flex-row-reverse")}>
          {label}
          <Icon className={cn("h-3 w-3", !on && "opacity-40")} />
        </button>
      </th>
    );
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <PanelHeader title="Search queries" meta={ids.length ? rows.length.toLocaleString() : undefined} />
      {ids.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted-foreground lg:px-6">No search query data yet</p>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b px-4 py-3 sm:flex lg:px-6">
            <div className="relative col-span-3 min-w-0 sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search queries" aria-label="Search queries" className={cn(inputClass, "h-9 py-1.5 pl-9")} />
            </div>
            <MonthSelect label="Active" value={active} months={ids} onChange={pickActive} />
            <span className="text-xs text-muted-foreground sm:hidden">vs</span>
            <MonthSelect label="Compare" value={compare} months={ids.filter((m) => m !== active)} onChange={setCompare} />
          </div>

          {rows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground lg:px-6">No queries match</p>
          ) : (
            <>
              {/* Phones: query + active value + change */}
              <ul className="divide-y md:hidden">
                {shown.map((r) => (
                  <li key={r.keyword} className="flex items-center gap-2 py-2.5 pl-4 pr-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.keyword}</span>
                    <CopyButton onClick={() => copy(r.keyword)} />
                    <Value c={r.active} className="w-14 shrink-0 text-right" />
                    <ChangeCell change={r.change} className="w-16 shrink-0" />
                  </li>
                ))}
              </ul>

              <div className="hidden md:block">
                <table className="w-full table-fixed text-sm">
                  <thead className="border-b text-left">
                    <tr>
                      {sortTh("Query", "keyword", "pl-6")}
                      {sortTh(compare ? monthLabel(compare) : "Compare", "prior", "w-36", true)}
                      {sortTh(active ? monthLabel(active) : "Active", "active", "w-36", true)}
                      {sortTh("Change", "change", "w-32 pr-6", true)}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {shown.map((r) => (
                      <tr key={r.keyword} className="hover:bg-muted/40">
                        <td className="py-2 pl-6 pr-3">
                          <span className="flex min-w-0 items-center gap-1">
                            <span className="truncate font-medium">{r.keyword}</span>
                            <CopyButton onClick={() => copy(r.keyword)} />
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Value c={r.prior} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Value c={r.active} strong />
                        </td>
                        <td className="py-2 pl-3 pr-6">
                          <ChangeCell change={r.change} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rows.length > limit && (
                <div className="border-t px-4 py-2.5 text-center lg:px-6">
                  <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setLimit((n) => n + PAGE)}>
                    Show more
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}

function MonthSelect({ label, value, months, onChange }: { label: string; value: string | null; months: string[]; onChange: (m: string) => void }) {
  return (
    <label className="relative flex h-9 w-full min-w-0 items-center gap-1.5 rounded-lg border border-input bg-card pl-3 pr-8 text-sm focus-within:ring-2 focus-within:ring-ring sm:w-[200px]">
      <span className="label-caps hidden shrink-0 sm:block">{label}</span>
      <select aria-label={`${label} month`} value={value ?? ""} disabled={!months.length} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 appearance-none truncate bg-transparent outline-none">
        {!value && <option value="">—</option>}
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground" />
    </label>
  );
}

function CopyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Copy query"
      title="Copy"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

function Value({ c, strong, className }: { c: KeywordCount | null; strong?: boolean; className?: string }) {
  const exact = c?.impressions != null;
  return <span className={cn("text-sm tabular-nums", exact ? (strong ? "font-semibold" : "") : "text-muted-foreground", className)}>{keywordLabel(c)}</span>;
}

function ChangeCell({ change, className }: { change: KeywordChange; className?: string }) {
  const base = "flex items-center justify-end gap-0.5 text-xs font-semibold tabular-nums";
  if (change === "new")
    return (
      <span className={cn("flex justify-end", className)}>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">New</span>
      </span>
    );
  if (change == null) return <span className={cn(base, "font-normal text-muted-foreground", className)}>—</span>;
  if (change === 0) return <span className={cn(base, "text-muted-foreground", className)}>0%</span>;
  const up = change > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn(base, up ? "text-success" : "text-destructive", className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {Math.abs(change).toLocaleString()}%
    </span>
  );
}
