import { needsReply } from "@/lib/reviews";
import { Suspense } from "react";
import { after } from "next/server";
import { AppShell, type ShellLocation } from "@/components/app-shell";
import { auditLocation } from "@/lib/audit";
import { getProvider } from "@/lib/gbp";
import { isPlatformAdmin } from "@/lib/admin";
import { getSessionUser } from "@/lib/current-user";
import { NoAccess } from "@/components/no-access";
import { activeAnnouncement, currentWorkspaceId, getWorkspace } from "@/lib/platform/store";
import { publishDueSoon } from "@/lib/publish-due";

// Profile data changes outside this app (new reviews, edits on Google), so never prerender.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Live mode: only workspace members get in (the first person to sign in becomes the admin; others need an invite).
  if (process.env.GBP_DATA_SOURCE === "google") {
    const { liveMember } = await import("@/lib/gbp/live");
    if (!(await liveMember())) return <NoAccess email={(await getSessionUser())?.email ?? null} />;
  }
  // A workspace the platform admin suspended can't be used (Admin → Workspaces → Reactivate).
  if ((await getWorkspace(await currentWorkspaceId()))?.status === "suspended") return <NoAccess email={(await getSessionUser())?.email ?? null} suspended />;
  // Scheduled posts that are due go out now (the cron route is the main trigger; this covers gaps while people use the app).
  after(publishDueSoon);
  const provider = await getProvider();
  const posts = await provider.listPosts();
  const [locations, tasks] = await Promise.all([provider.listLocations(), provider.listTasks()]);
  const shell: ShellLocation[] = await Promise.all(
    locations.map(async (l) => {
      const reviews = await provider.listReviews(l.id);
      return {
        id: l.id,
        title: l.title,
        address: l.address,
        unreplied: reviews.filter(needsReply).length,
        issues: auditLocation(l, reviews, posts).issues.length,
        openTasks: tasks.filter((t) => !t.parentId && t.stage !== "done" && (t.locationId == null || t.locationId === l.id)).length,
      };
    }),
  );
  const demo = process.env.GBP_DATA_SOURCE !== "google";
  // The signed-in Google account shows on the user card; the role comes from the workspace member.
  const [me, signedIn] = await Promise.all([provider.getCurrentMember(), getSessionUser()]);
  const user = { name: signedIn?.name || signedIn?.email || me.name, role: me.role, avatarUrl: me.avatarUrl ?? signedIn?.picture ?? me.googleAvatarUrl ?? null };
  const [platformAdmin, announcement] = await Promise.all([isPlatformAdmin(), activeAnnouncement()]);

  return (
    <Suspense>
      <AppShell locations={shell} user={user} demo={demo} platformAdmin={platformAdmin} announcement={announcement}>
        {children}
      </AppShell>
    </Suspense>
  );
}
