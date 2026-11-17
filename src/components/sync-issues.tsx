import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { buttonClass } from "@/components/ui";
import type { SyncIssue } from "@/lib/gbp/types";

const AREA: Record<SyncIssue["area"], string> = { profile: "Profile", insights: "Performance", keywords: "Search keywords", reviews: "Reviews", photos: "Photos", posts: "Posts", attributes: "Attributes" };

/** Google stopped accepting the saved access (revoked, password changed, token expired): reconnecting fixes every area at once. */
const accessLost = (m: string) => /access was removed|invalid_grant|connect again/i.test(m);

/** Google data that couldn't be loaded for some profiles (live mode). The rest of the page still shows. */
export function SyncIssues({ issues }: { issues: SyncIssue[] }) {
  if (!issues.length) return null;
  if (issues.some((i) => accessLost(i.message)))
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center">
        <TriangleAlert className="hidden h-4 w-4 shrink-0 text-warning sm:block" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Google access needs to be renewed</p>
          <p className="text-muted-foreground">Google stopped accepting this workspace&apos;s connection, so you&apos;re seeing the last saved data. Reconnect Google to update it.</p>
        </div>
        <Link href="/settings?tab=accounts" className={buttonClass("default", "sm", "shrink-0 self-start sm:self-auto")}>
          Reconnect Google
        </Link>
      </div>
    );
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
