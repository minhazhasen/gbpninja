import { Badge, Card, PageHeader } from "@/components/ui";
import { auditLocation } from "@/lib/audit";
import { getProvider } from "@/lib/gbp";
import { resolveLocation, type PageProps } from "@/lib/location";
import { applyAuditFixes } from "../actions";

export default async function AuditPage({ searchParams }: PageProps) {
  const { location } = await resolveLocation(searchParams);
  const reviews = await (await getProvider()).listReviews(location.id);
  const { score, issues, passed } = auditLocation(location, reviews);
  const tone = score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600";
  const input = "w-full rounded-md border border-border bg-background p-2";

  return (
    <>
      <PageHeader title="Profile audit" subtitle={location.title} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <div className="flex items-baseline gap-2">
              <span className={`text-4xl font-semibold tabular-nums ${tone}`}>{score}</span>
              <span className="text-muted">/ 100 profile score</span>
            </div>
          </Card>
          <Card title={`Issues (${issues.length})`}>
            <ul className="divide-y divide-border">
              {issues.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{i.title}</div>
                    <div className="text-muted">{i.detail}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Badge tone={i.severity}>{i.severity}</Badge>
                    {i.fixable && <Badge tone="good">fixable</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={`Passed (${passed.length})`}>
            <ul className="space-y-1 text-sm text-muted">
              {passed.map((p) => <li key={p}>✓ {p}</li>)}
            </ul>
          </Card>
        </div>
        <Card title="Quick fix">
          <form action={applyAuditFixes} className="space-y-3 text-sm">
            <input type="hidden" name="locationId" value={location.id} />
            <label className="block">
              <span className="text-muted">Description (250–750 chars)</span>
              <textarea name="description" rows={6} maxLength={750} defaultValue={location.description} className={input} />
            </label>
            <label className="block">
              <span className="text-muted">Phone</span>
              <input name="phone" defaultValue={location.phone} className={input} />
            </label>
            <label className="block">
              <span className="text-muted">Website</span>
              <input name="websiteUri" type="url" defaultValue={location.websiteUri} className={input} />
            </label>
            <label className="block">
              <span className="text-muted">Additional categories (comma-separated)</span>
              <input name="additionalCategories" defaultValue={location.additionalCategories.join(", ")} className={input} />
            </label>
            <button className="w-full rounded-md bg-accent px-3 py-2 font-medium text-white">Save to profile</button>
          </form>
        </Card>
      </div>
    </>
  );
}
