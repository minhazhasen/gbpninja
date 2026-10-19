import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Badge, Card, EmptyState, Field, PageHeader, PillTabs, StatStrip, buttonClass, inputClass } from "@/components/ui";
import { getProvider, type LocalPost } from "@/lib/gbp";
import { resolveLocation } from "@/lib/location";
import { POST_STATUS, POST_TYPE } from "@/lib/posts";
import { cn, withLocation } from "@/lib/utils";
import { createPost } from "../actions";

type Props = { searchParams: Promise<{ location?: string; month?: string; view?: string; compose?: string; date?: string }> };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage({ searchParams }: Props) {
  const { location } = await resolveLocation(searchParams);
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "month";
  const posts = [...(await (await getProvider()).listPosts(location.id))].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  const today = new Date();
  const [y, m] = sp.month?.match(/^\d{4}-\d{2}$/) ? sp.month.split("-").map(Number) : [today.getFullYear(), today.getMonth() + 1];
  const monthKey = `${y}-${pad(m)}`;
  const first = new Date(y, m - 1, 1);
  // Monday-first 6-week grid
  const start = new Date(y, m - 1, 1 - ((first.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const byDay = new Map<string, LocalPost[]>();
  for (const p of posts) {
    const k = ymd(new Date(p.scheduledFor));
    byDay.set(k, [...(byDay.get(k) ?? []), p]);
  }

  const base = { month: monthKey, view };
  const href = (extra: Record<string, string> = {}) => withLocation("/calendar", location.id, { ...base, ...extra });
  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    return href({ month: `${d.getFullYear()}-${pad(d.getMonth() + 1)}` });
  };
  const count = (s: LocalPost["status"]) => posts.filter((p) => p.status === s).length;

  const composeDate = sp.date?.match(/^\d{4}-\d{2}-\d{2}$/) ? sp.date : ymd(new Date(Date.now() + 86_400_000));

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Content"
        actions={
          <>
            <PillTabs
              label="View"
              items={[
                { href: href({ view: "month" }), label: "Month", active: view === "month" },
                { href: href({ view: "list" }), label: "List", active: view === "list" },
              ]}
            />
            <Link href={href({ compose: "1" })} className={buttonClass("default", "sm")}>
              <Plus />
              New post
            </Link>
          </>
        }
      >
        {location.title}
      </PageHeader>

      <StatStrip
        items={[
          { label: "Scheduled", value: count("SCHEDULED"), hint: "Queued to publish" },
          { label: "Published", value: count("PUBLISHED"), hint: "Live on Google" },
          { label: "Drafts", value: count("DRAFT"), hint: "Not scheduled yet" },
          { label: "Failed", value: count("FAILED"), hint: count("FAILED") ? "Needs attention" : "None", alert: count("FAILED") > 0 },
        ]}
      />

      {view === "month" ? (
        <Card className="min-w-0 overflow-hidden">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b px-5 py-3 lg:px-6">
            <h2 className="text-base font-semibold tracking-tight">{first.toLocaleString("en-US", { month: "long", year: "numeric" })}</h2>
            <div className="flex items-center gap-1">
              <Link href={href({ month: `${today.getFullYear()}-${pad(today.getMonth() + 1)}` })} className={buttonClass("outline", "sm")}>
                Today
              </Link>
              <Link href={shift(-1)} className={buttonClass("ghost", "icon", "h-8 w-8")} aria-label="Previous month">
                <ChevronLeft />
              </Link>
              <Link href={shift(1)} className={buttonClass("ghost", "icon", "h-8 w-8")} aria-label="Next month">
                <ChevronRight />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-7 border-b">
            {WEEKDAYS.map((d) => (
              <span key={d} className="label-caps py-2 text-center">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const k = ymd(d);
              const inMonth = d.getMonth() === m - 1;
              const isToday = k === ymd(today);
              const dayPosts = byDay.get(k) ?? [];
              return (
                <div key={k} className={cn("group relative min-h-16 border-b p-1.5 sm:min-h-28", i % 7 !== 0 && "border-l", !inMonth && "bg-muted/40", i >= 35 && "border-b-0")}>
                  <div className="flex items-center justify-between">
                    <span className={cn("text-xs tabular-nums", !inMonth ? "text-muted-foreground/60" : "text-muted-foreground", isToday && "rounded-full bg-primary px-1.5 font-semibold text-primary-foreground")}>
                      {d.getDate()}
                    </span>
                    <Link
                      href={href({ compose: "1", date: k })}
                      className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground sm:group-hover:flex"
                      aria-label={`New post on ${k}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  {/* Phones: dots. Larger screens: chips. */}
                  <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                    {dayPosts.map((p) => (
                      <span key={p.id} className={cn("h-1.5 w-1.5 rounded-full", POST_STATUS[p.status].dot)} />
                    ))}
                  </div>
                  <div className="mt-1 hidden space-y-1 sm:block">
                    {dayPosts.slice(0, 3).map((p) => (
                      <div key={p.id} title={p.summary} className={cn("flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium", POST_STATUS[p.status].chip)}>
                        <span className="shrink-0 tabular-nums opacity-80">{time(p.scheduledFor)}</span>
                        <span className="truncate">{p.summary}</span>
                      </div>
                    ))}
                    {dayPosts.length > 3 && <div className="px-1.5 text-[11px] text-muted-foreground">+{dayPosts.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="min-w-0 overflow-hidden">
          {posts.length === 0 ? (
            <EmptyState title="No posts yet">Create your first Google post.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    {["Date", "Post", "Type", "Status"].map((h) => (
                      <th key={h} className="label-caps px-5 py-3 font-semibold lg:px-6">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {posts.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/40">
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground lg:px-6">
                        {new Date(p.scheduledFor).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {time(p.scheduledFor)}
                      </td>
                      <td className="max-w-md px-5 py-3 lg:px-6">
                        <span className="line-clamp-2">{p.summary}</span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground lg:px-6">{POST_TYPE[p.type]}</td>
                      <td className="px-5 py-3 lg:px-6">
                        <Badge variant={POST_STATUS[p.status].badge} pill>
                          {POST_STATUS[p.status].label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {sp.compose === "1" && (
        <div className="fixed inset-0 z-50">
          <Link href={href()} className="absolute inset-0 bg-black/40" aria-label="Close" />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l bg-card shadow-elegant">
            <div className="flex h-14 items-center justify-between border-b px-5">
              <h2 className="text-base font-semibold">New Google post</h2>
              <Link href={href()} className={buttonClass("ghost", "icon", "h-8 w-8")} aria-label="Close">
                <X />
              </Link>
            </div>
            <form action={createPost} className="flex flex-1 flex-col overflow-y-auto">
              <div className="flex-1 space-y-4 p-5">
                <input type="hidden" name="locationId" value={location.id} />
                <input type="hidden" name="returnTo" value={href()} />
                <Field label="Post type">
                  <select name="type" className={inputClass}>
                    {Object.entries(POST_TYPE).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Text" hint="Up to 1,500 characters. The first ~100 show in the preview.">
                  <textarea name="summary" required rows={6} maxLength={1500} placeholder="What's new at your business?" className={inputClass} />
                </Field>
                <Field label="Button link (optional)">
                  <input name="ctaUrl" type="url" placeholder="https://" className={inputClass} />
                </Field>
                <Field label="Publish at">
                  <input name="scheduledFor" type="datetime-local" required defaultValue={`${composeDate}T10:00`} className={inputClass} />
                </Field>
              </div>
              <div className="flex justify-end gap-2 border-t p-4">
                <button name="status" value="DRAFT" className={buttonClass("outline")}>
                  Save draft
                </button>
                <button name="status" value="SCHEDULED" className={buttonClass("default")}>
                  Schedule
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
