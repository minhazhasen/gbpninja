import { MediaReload } from "@/components/media-reload";
import { PhotosPanel } from "@/components/audit/photos-panel";
import { SyncIssues } from "@/components/sync-issues";
import { Card, PageHeader, PanelHeader, StatStrip } from "@/components/ui";
import { getProvider } from "@/lib/gbp";
import { resolveLocation } from "@/lib/location";

export const metadata = { title: "Media Library" };

const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** Media Library: every photo and video on the business's Google profile, by category; upload, recategorise, delete. */
export default async function MediaPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const { location } = await resolveLocation(searchParams);
  const provider = await getProvider();
  const issues = ((await provider.getSyncIssues?.([location.id])) ?? []).filter((i) => i.area === "photos" || i.area === "profile");
  const items = location.photos ?? [];
  const own = items.filter((i) => !i.fromCustomer);
  const photos = own.filter((i) => i.type !== "video" && i.category !== "logo" && i.category !== "cover").length;
  const videos = own.filter((i) => i.type === "video").length;
  const customers = items.filter((i) => i.fromCustomer).length;
  const hasViews = items.some((i) => i.views != null);
  const views = items.reduce((s, i) => s + (i.views ?? 0), 0);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Media Library" actions={<MediaReload locationId={location.id} />}>
        Photos and videos people see on {location.title}&apos;s Google profile
      </PageHeader>
      <SyncIssues issues={issues} />
      <StatStrip
        items={[
          { label: "Photos", value: photos, hint: photos >= 10 ? "10+ recommended: done" : "10+ recommended" },
          { label: "Videos", value: videos, hint: "Up to 30 seconds each" },
          { label: "From customers", value: customers, hint: "Added on Google Maps" },
          { label: "Views", value: hasViews ? compact(views) : "—", hint: hasViews ? "Reported by Google" : "Google didn't report views" },
        ]}
      />
      <Card className="overflow-hidden">
        <PanelHeader title="Photos and videos" meta="what people see on your Google profile" />
        <div className="px-5 py-5 lg:px-6">
          <PhotosPanel key={location.id} location={location} source="media" />
        </div>
      </Card>
    </div>
  );
}
