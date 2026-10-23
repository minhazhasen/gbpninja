import { TriangleAlert } from "lucide-react";
import type { SyncIssue } from "@/lib/gbp/types";

const AREA: Record<SyncIssue["area"], string> = { insights: "Performance", keywords: "Search keywords", reviews: "Reviews", photos: "Photos", posts: "Posts", attributes: "Attributes" };

/** Google data that couldn't be loaded for some profiles (live mode). The rest of the page still shows. */
export function SyncIssues({ issues }: { issues: SyncIssue[] }) {
  if (!issues.length) return null;
  return (
    <div role="status" className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">Some Google data couldn&apos;t be loaded</p>
        <ul className="space-y-0.5 text-muted-foreground">
          {issues.map((i) => (
            <li key={`${i.locationId}|${i.area}`}>
              <span className="font-medium text-foreground">{i.title}</span> · {AREA[i.area]}: {i.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
