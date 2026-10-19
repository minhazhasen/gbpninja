import { Suspense } from "react";
import { AppShell, type ShellLocation } from "@/components/app-shell";
import { auditLocation } from "@/lib/audit";
import { getProvider } from "@/lib/gbp";

// Profile data changes outside this app (new reviews, edits on Google), so never prerender.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const provider = await getProvider();
  const locations = await provider.listLocations();
  const shell: ShellLocation[] = await Promise.all(
    locations.map(async (l) => {
      const reviews = await provider.listReviews(l.id);
      return {
        id: l.id,
        title: l.title,
        address: l.address,
        unreplied: reviews.filter((r) => !r.reply).length,
        issues: auditLocation(l, reviews).issues.length,
      };
    }),
  );
  const demo = process.env.GBP_DATA_SOURCE !== "google";
  // TODO: use the Auth.js session user once Google sign-in is wired up.
  const user = { name: "Demo User", email: demo ? "Demo workspace" : undefined };

  return (
    <Suspense>
      <AppShell locations={shell} user={user} demo={demo}>
        {children}
      </AppShell>
    </Suspense>
  );
}
