import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getProvider, type LocalPost } from "@/lib/gbp";
import { resolveLocation } from "@/lib/location";
import { createPost } from "../actions";

type Props = { searchParams: Promise<{ location?: string; month?: string }> };

const statusTone = { DRAFT: "low", SCHEDULED: "medium", PUBLISHED: "good", FAILED: "high" } as const;

export default async function CalendarPage({ searchParams }: Props) {
  const { location } = await resolveLocation(searchParams);
  const { month } = await searchParams;
  const posts = await (await getProvider()).listPosts(location.id);

  const now = new Date();
  const [y, m] = month?.match(/^\d{4}-\d{2}$/) ? month.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const byDay = new Map<number, LocalPost[]>();
  for (const p of posts) {
    const d = new Date(p.scheduledFor);
    if (d.getFullYear() === y && d.getMonth() === m - 1) byDay.set(d.getDate(), [...(byDay.get(d.getDate()) ?? []), p]);
  }
  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    return `?location=${encodeURIComponent(location.id)}&month=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <>
      <PageHeader title="Content calendar" subtitle={location.title} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <Link href={shift(-1)} className="text-sm text-accent">← Prev</Link>
            <span className="text-sm font-semibold">{first.toLocaleString("en", { month: "long", year: "numeric" })}</span>
            <Link href={shift(1)} className="text-sm text-accent">Next →</Link>
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="bg-surface p-1 text-center font-medium text-muted">{d}</div>
            ))}
            {cells.map((day, i) => (
              <div key={i} className="min-h-20 bg-surface p-1">
                {day && <div className="text-muted">{day}</div>}
                {day && byDay.get(day)?.map((p) => (
                  <div key={p.id} title={p.summary} className="mt-1 truncate rounded bg-accent/10 px-1 text-accent">
                    {p.type.toLowerCase()}: {p.summary}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Schedule a post">
            <form action={createPost} className="space-y-2 text-sm">
              <input type="hidden" name="locationId" value={location.id} />
              <select name="type" className="w-full rounded-md border border-border bg-background p-2">
                <option value="STANDARD">Update</option>
                <option value="OFFER">Offer</option>
                <option value="EVENT">Event</option>
              </select>
              <textarea name="summary" required rows={4} maxLength={1500} placeholder="What's new?" className="w-full rounded-md border border-border bg-background p-2" />
              <input name="ctaUrl" type="url" placeholder="Button link (optional)" className="w-full rounded-md border border-border bg-background p-2" />
              <input name="scheduledFor" type="datetime-local" required className="w-full rounded-md border border-border bg-background p-2" />
              <button className="w-full rounded-md bg-accent px-3 py-2 font-medium text-white">Schedule</button>
            </form>
          </Card>
          <Card title="All posts">
            <ul className="space-y-2 text-sm">
              {posts.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2">{p.summary}</span>
                  <Badge tone={statusTone[p.status]}>{p.status.toLowerCase()}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
