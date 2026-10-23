import { needsReply } from "@/lib/reviews";
import { Suspense } from "react";
import { AppShell, type ShellLocation } from "@/components/app-shell";
import { auditLocation } from "@/lib/audit";
import { getProvider } from "@/lib/gbp";
import { isPlatformAdmin } from "@/lib/admin";
import { getSessionUser } from "@/lib/current-user";
import { activeAnnouncement } from "@/lib/platform/store";

// Profile data changes outside this app (new reviews, edits on Google), so never prerender.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
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
  // The Google account signed in with Firebase shows on the user card; role still comes from the workspace member.
  // TODO: map the signed-in email to a workspace member (and its role) once members are stored.
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
