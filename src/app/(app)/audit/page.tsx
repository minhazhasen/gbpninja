import { AuditBoard } from "@/components/audit/audit-board";
import { SyncIssues } from "@/components/sync-issues";
import { AUDIT_TABS, auditLocation, type AuditTab } from "@/lib/audit";
import { getProvider } from "@/lib/gbp";
import { resolveLocation } from "@/lib/location";
import { categoryUsage } from "@/lib/competitors";
import type { CheckTask } from "@/components/audit/check-task-dialog";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ location?: string; tab?: string }> }) {
  const { location } = await resolveLocation(searchParams);
  const { tab } = await searchParams;
  const provider = await getProvider();
  const [reviews, posts, suggestions, tasks, members, competitors] = await Promise.all([
    provider.listReviews(location.id),
    provider.listPosts(),
    provider.getProfileSuggestions(location.id),
    provider.listTasks(),
    provider.listMembers(),
    provider.listCompetitors(location.id),
  ]);
  const shown = competitors.filter((c) => !c.hidden);
  // Newest open task per checklist item.
  const checkTasks: Record<string, CheckTask> = {};
  for (const t of [...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    if (t.source?.type === "audit" && t.locationId === location.id && t.stage !== "done")
      checkTasks[t.source.checkId] = { id: t.id, stage: t.stage, assigneeId: t.assigneeId ?? null, dueDate: t.dueDate ?? null };
  const audit = auditLocation(location, reviews, posts);
  const visible = reviews.filter((r) => !r.hidden);
  const rating = { avg: visible.length ? visible.reduce((s, r) => s + r.rating, 0) / visible.length : null, count: visible.length };
  const initialTab = (AUDIT_TABS as readonly string[]).includes(tab ?? "") ? (tab as AuditTab) : "overview";
  // Live mode: photos / attributes that couldn't be loaded from Google (the rest of the audit still works).
  const photoIssues = ((await provider.getSyncIssues?.([location.id])) ?? []).filter((i) => i.area === "photos" || i.area === "attributes");
  return (
    <>
    {photoIssues.length > 0 && (
      <div className="mb-5">
        <SyncIssues issues={photoIssues} />
      </div>
    )}
    <AuditBoard
      key={location.id}
      location={location}
      audit={audit}
      suggestions={suggestions}
      rating={rating}
      initialTab={initialTab}
      checkTasks={checkTasks}
      competitorCategories={{ total: shown.length, list: categoryUsage(shown) }}
      members={members.filter((m) => m.status === "active").map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl ?? m.googleAvatarUrl ?? null }))}
    />
    </>
  );
}
