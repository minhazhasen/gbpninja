"use client";

// Ranking page: Google's own average positions, clicks and impressions per search, from Search Console.
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Copy, Globe, Minus, Search, TrendingDown, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SearchConsoleIcon } from "@/components/brand-icons";
import { DateRangePicker } from "@/components/date-range-picker";
import { Card, EmptyState, PageHeader, PanelHeader, StatStrip, buttonClass, inputClass } from "@/components/ui";
import { GoogleConnectButton, propertyLabel } from "@/components/settings/search-console-card";
import { connectSearchConsole } from "@/app/(app)/actions";
import { rangeFromParams, rangeToParams, type DateRangeValue } from "@/lib/date-ranges";
import type { SearchConsoleConnection, SearchConsoleQueryRow, SearchConsoleReport } from "@/lib/gbp/types";
import { queryHref } from "@/lib/search-console";
import { cn } from "@/lib/utils";

export const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const fmtLong = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
export const num = (n: number) => n.toLocaleString("en-US");
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
export const pctChange = (now: number, before?: number | null) => (before ? Math.round(((now - before) / before) * 100) : null);

type SortKey = "query" | "position" | "clicks" | "impressions" | "ctr";

export function SearchConsoleBoard({
  location,
  connection,
  report,
  canConnect,
}: {
  location: { id: string; title: string };
  connection: SearchConsoleConnection;
  report: SearchConsoleReport | null;
  /** Google sign-in is set up (or demo). */
  canConnect: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [connecting, setConnecting] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "impressions", desc: true });
  const [showAll, setShowAll] = useState(false);
  const range = rangeFromParams(Object.fromEntries(params), "last28");
  const connected = connection.status === "connected";

  const go = (v: DateRangeValue) => {
    const next = new URLSearchParams(params.toString());
    for (const k of ["range", "from", "to", "compare"]) next.delete(k);
    for (const [k, val] of Object.entries(rangeToParams(v))) next.set(k, val);
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  const connect = async () => {
    setConnecting(true);
    const res = await connectSearchConsole();
    setConnecting(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Google Search Console connected");
    router.refresh();
  };

  const header = (
    <PageHeader title="Ranking" actions={report && <DateRangePicker className="w-full sm:w-[300px]" value={range} onChange={go} />}>
      {report ? (
        <>
          Google Search positions for {location.title} · from Search Console · {propertyLabel(report.siteUrl)}
        </>
      ) : (
        `Where ${location.title} shows up in Google Search`
      )}
    </PageHeader>
  );

  if (!connected || !report) {
    return (
      <div className="space-y-5 pb-8">
        {header}
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border bg-background">
            <SearchConsoleIcon className="h-8 w-8" />
          </span>
          <h2 className="mt-4 text-lg font-semibold tracking-tight">{connected ? `Choose the website for ${location.title}` : "See your Google rankings for free"}</h2>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            {connected
              ? "Search Console is connected, but no website is linked to this location yet."
              : "Connect Google Search Console to see your average position, clicks and impressions for every search that shows your website. Read-only, takes a few seconds."}
          </p>
          <div className="mt-5">
            {connected ? (
              <Link href="/settings#search-console" className={buttonClass()}>
                <Globe /> Choose website
              </Link>
            ) : canConnect ? (
              <GoogleConnectButton onClick={connect} busy={connecting} label="Connect Google Search Console" />
            ) : (
              <p className="text-sm text-muted-foreground">Google sign-in isn&apos;t available yet.</p>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const t = report.totals;
  const p = report.prevTotals;
  const posDelta = p && t.position && p.position ? Math.round((p.position - t.position) * 10) / 10 : null;
  const q = query.trim().toLowerCase();
  const rows = report.queries
    .filter((r) => !q || r.query.includes(q))
    .sort((a, b) => {
      const dir = sort.desc ? -1 : 1;
      if (sort.key === "query") return a.query.localeCompare(b.query) * dir;
      return (a[sort.key] - b[sort.key]) * dir;
    });
  const shown = showAll || q ? rows : rows.slice(0, 25);
  const maxPos = Math.ceil(Math.max(10, ...report.daily.map((d) => d.position)) / 5) * 5;

  const th = (key: SortKey, label: string, className: string) => (
    <th className={cn("label-caps py-2.5 font-medium", className)}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "position" && key !== "query" }))}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", sort.key === key && "text-foreground")}
      >
        {label}
        {sort.key === key && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <div className={cn("space-y-5 pb-8 transition-opacity", pending && "opacity-70")}>
      {header}

      <StatStrip
        items={[
          {
            label: "Avg position",
            value: t.impressions ? `#${t.position.toFixed(1)}` : "—",
            hint: posDelta != null ? (posDelta === 0 ? "No change vs previous period" : `${posDelta > 0 ? "↑" : "↓"} ${Math.abs(posDelta)} vs previous period`) : "Lower is better",
          },
          { label: "Clicks", value: num(t.clicks), delta: pctChange(t.clicks, p?.clicks) },
          { label: "Impressions", value: num(t.impressions), delta: pctChange(t.impressions, p?.impressions) },
          { label: "Click-through rate", value: pct(t.ctr), delta: pctChange(t.ctr, p?.ctr) },
        ]}
      />

      <Card className="overflow-hidden">
        <PanelHeader title="Average position" meta={`${fmtDay(report.from)} – ${fmtDay(report.to)} · 1 = top`} />
        <div className="h-[280px] px-2 pb-4 pt-4 sm:px-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={report.daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickFormatter={fmtDay} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={28} />
              <YAxis
                reversed
                domain={[1, maxPos]}
                ticks={[1, ...Array.from({ length: Math.floor(maxPos / (maxPos > 20 ? 10 : 5)) }, (_, i) => (i + 1) * (maxPos > 20 ? 10 : 5))]}
                interval={0}
                allowDecimals={false}
                tickFormatter={(v) => `#${v}`}
                tickLine={false}
                axisLine={false}
                width={40}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                cursor={{ stroke: "hsl(var(--border))" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as SearchConsoleReport["daily"][number];
                  return (
                    <div className="min-w-[180px] rounded-md border bg-popover px-3 py-2 text-xs shadow-elegant">
                      <p className="mb-1.5 font-semibold">{fmtLong(d.date)}</p>
                      {[
                        ["Avg position", d.impressions ? `#${d.position.toFixed(1)}` : "—"],
                        ["Clicks", num(d.clicks)],
                        ["Impressions", num(d.impressions)],
                        ["CTR", pct(d.ctr)],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4 py-0.5">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="tabular-nums">{v}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="position" stroke="var(--viz-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <PanelHeader
          title="Searches"
          meta={report.queries.length}
          action={
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search queries" aria-label="Search queries" className={cn(inputClass, "h-9 w-44 py-1.5 pl-9 sm:w-60")} />
            </div>
          }
        />
        {rows.length ? (
          <div>
            {/* Phones: one compact block per search */}
            <ul className="divide-y md:hidden">
              {shown.map((r) => (
                <QueryCard key={r.query} r={r} href={queryHref(r.query, params)} />
              ))}
            </ul>
            {/* Tablet and up: table; the query column gets 40%, the numbers share the rest */}
            <table className="hidden w-full table-fixed text-sm md:table">
              <colgroup>
                <col className="w-[40%]" />
                <col className="w-[21%]" />
                <col className="w-[12%]" />
                <col className="w-[15%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="border-b">
                  <th className="label-caps px-5 py-2.5 text-left font-medium lg:px-6">
                    <button type="button" onClick={() => setSort((s) => ({ key: "query", desc: s.key === "query" ? !s.desc : false }))} className="hover:text-foreground">
                      Search query
                    </button>
                  </th>
                  {th("position", "Position", "px-3 text-left")}
                  {th("clicks", "Clicks", "px-3 text-right")}
                  {th("impressions", "Impressions", "px-3 text-right")}
                  {th("ctr", "CTR", "pl-3 pr-5 text-right lg:pr-6")}
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((r) => (
                  <QueryRow key={r.query} r={r} href={queryHref(r.query, params)} />
                ))}
              </tbody>
            </table>
            {!showAll && !q && rows.length > shown.length && (
              <div className="border-t px-5 py-3 text-center lg:px-6">
                <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setShowAll(true)}>
                  Show all {rows.length} searches
                </button>
              </div>
            )}
          </div>
        ) : (
          <EmptyState title={q ? `No searches match "${query}"` : "No searches in this period"}>Search Console only lists searches where your website appeared.</EmptyState>
        )}
        <p className="border-t px-5 py-2.5 text-xs text-muted-foreground lg:px-6">
          Position is Google&apos;s average for all searches that showed your website. Search Console data is about 2 days behind.
        </p>
      </Card>

    </div>
  );
}

/** Copy a search query; shows a tick for a moment. Visible on row hover / keyboard focus (always on touch screens). */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied", { description: text });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text instead.");
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy "${text}"`}
      title="Copy"
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
        copied && "text-success opacity-100 [@media(hover:hover)]:opacity-100",
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Badge colour by how people read Google: top 3, first page, second page, further back. */
export const tier = (position: number) =>
  position <= 3 ? "bg-success/10 text-success" : position <= 10 ? "bg-accent text-accent-foreground" : position <= 20 ? "bg-muted text-foreground" : "bg-muted text-muted-foreground";

/** Position badge (colour = top 3 / first page / second page / further) plus the change vs the previous period. */
function PositionCell({ r }: { r: SearchConsoleQueryRow }) {
  const change = r.prev ? Math.round((r.prev.position - r.position) * 10) / 10 : null;
  const moved = change != null && Math.abs(change) >= 0.5;
  return (
    <span className="flex items-center gap-2">
      <span className={cn("inline-flex min-w-[3.25rem] items-center justify-center rounded-md px-2 py-1 text-xs font-semibold tabular-nums", tier(r.position))}>#{r.position.toFixed(1)}</span>
      {moved ? (
        <span
          className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", change! > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}
          title={`${change! > 0 ? "Up" : "Down"} ${Math.abs(change!)} vs previous period`}
        >
          {change! > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(change!)}
        </span>
      ) : (
        change != null && (
          <span className="inline-flex items-center text-muted-foreground" title="About the same as the previous period">
            <Minus className="h-3 w-3" />
          </span>
        )
      )}
    </span>
  );
}

function QueryText({ query, href }: { query: string; href: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Link href={href} className="truncate font-medium hover:text-primary hover:underline" title={query}>
        {query}
      </Link>
      <CopyButton text={query} />
    </span>
  );
}

/** Rows open the query's detail page; clicks on the copy button or the link itself are left alone. */
function useRowLink(href: string) {
  const router = useRouter();
  return (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button") || window.getSelection()?.toString()) return;
    router.push(href);
  };
}

function QueryRow({ r, href }: { r: SearchConsoleQueryRow; href: string }) {
  const open = useRowLink(href);
  return (
    <tr className="group cursor-pointer transition-colors hover:bg-muted/30" onClick={open}>
      <td className="px-5 py-3 lg:px-6">
        <QueryText query={r.query} href={href} />
      </td>
      <td className="px-3 py-3">
        <PositionCell r={r} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{num(r.clicks)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{num(r.impressions)}</td>
      <td className="py-3 pl-3 pr-5 text-right tabular-nums text-muted-foreground lg:pr-6">{pct(r.ctr)}</td>
    </tr>
  );
}

function QueryCard({ r, href }: { r: SearchConsoleQueryRow; href: string }) {
  const open = useRowLink(href);
  return (
    <li className="group cursor-pointer space-y-2 px-5 py-3 active:bg-muted/30" onClick={open}>
      <QueryText query={r.query} href={href} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <PositionCell r={r} />
        <span>
          <span className="font-semibold tabular-nums text-foreground">{num(r.clicks)}</span> clicks
        </span>
        <span>
          <span className="font-semibold tabular-nums text-foreground">{num(r.impressions)}</span> impressions
        </span>
        <span>
          <span className="font-semibold tabular-nums text-foreground">{pct(r.ctr)}</span> CTR
        </span>
      </div>
    </li>
  );
}
