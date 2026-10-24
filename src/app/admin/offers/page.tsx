import { OffersBoard } from "@/components/admin/offers-board";
import { PageHeader } from "@/components/ui";
import { listLeads, listOffers, listWorkspaces } from "@/lib/platform/store";

export const metadata = { title: "Offers" };

export default async function AdminOffersPage({ searchParams }: { searchParams: Promise<{ new?: string; for?: string }> }) {
  const sp = await searchParams;
  const [offers, leads, workspaces] = await Promise.all([listOffers(), listLeads(), listWorkspaces()]);
  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Offers">Promote your services on customers&apos; Dashboards: to every workspace or only the ones you pick</PageHeader>
      <OffersBoard
        offers={offers}
        leads={leads}
        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, ownerEmail: w.ownerEmail }))}
        newFor={sp.new && sp.for && workspaces.some((w) => w.id === sp.for) ? sp.for : null}
      />
    </div>
  );
}
