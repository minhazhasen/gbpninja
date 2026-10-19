import { Suspense } from "react";
import { LocationPicker } from "@/components/location-picker";
import { Sidebar } from "@/components/sidebar";
import { getProvider } from "@/lib/gbp";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const locations = await (await getProvider()).listLocations();
  const demo = process.env.GBP_DATA_SOURCE !== "google";
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-border bg-surface p-4 md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="mb-4 text-base font-semibold">GBP Manager</div>
        <Suspense>
          <div className="mb-4">
            <LocationPicker locations={locations.map(({ id, title }) => ({ id, title }))} />
          </div>
          <Sidebar />
        </Suspense>
        {demo && <p className="mt-6 hidden text-xs text-muted md:block">Demo data. Set GBP_DATA_SOURCE=google to use live profiles.</p>}
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
