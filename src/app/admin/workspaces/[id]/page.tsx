import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ChevronLeft } from "lucide-react";
import { QuickAction } from "@/components/admin/quick-action";
import { WorkspaceDetail } from "@/components/admin/workspace-detail";
import { Badge, Card, PanelHeader } from "@/components/ui";
import { getWorkspace, listLog, listOffers, offerHiddenReason } from "@/lib/platform/store";

export default async function AdminWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [workspace, log, offers] = await Promise.all([getWorkspace(decodeURIComponent(id)), listLog(), listOffers()]);
  if (!workspace) notFound();
  // Live offers and whether they're on this workspace's dashboard today.
  const offerRows = offers.filter((o) => o.active).map((o) => ({ offer: o, hidden: offerHiddenReason(o, workspace) }));

  return (
    <div className="space-y-5 pb-8">
      <Link href="/admin/workspaces" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Workspaces
      </Link>
      <WorkspaceDetail workspace={workspace} history={log.filter((e) => e.target?.includes(workspace.name)).slice(0, 8)} />
      <Card className="overflow-hidden">
        <PanelHeader title="Offers" meta={offerRows.length || undefined} />
        {offerRows.length ? (
          <ul className="divide-y">
            {offerRows.map(({ offer, hidden }) => (
              <li key={offer.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-sm lg:px-6">
                <span className="min-w-0 flex-1 basis-full font-medium sm:basis-auto sm:truncate">{offer.title}</span>
                {hidden ? (
                  <>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {hidden.reason === "new_account" ? "New account" : "Closed"} · shows {format(parseISO(hidden.until), "d MMM")}
                    </span>
                    {hidden.reason === "closed" && <QuickAction kind="reopenOffer" workspaceId={`${workspace.id}|${offer.id}`} label="Show again now" />}
                  </>
                ) : (
                  <Badge variant="success" pill>
                    Showing
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">No live offers.</p>
        )}
      </Card>
    </div>
  );
}
