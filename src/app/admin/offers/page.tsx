import { OffersBoard } from "@/components/admin/offers-board";
import { PageHeader } from "@/components/ui";
import { listLeads, listOffers } from "@/lib/platform/store";

export default async function AdminOffersPage() {
  const [offers, leads] = await Promise.all([listOffers(), listLeads()]);
  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Offers">Promote your services on every customer&apos;s Dashboard</PageHeader>
      <OffersBoard offers={offers} leads={leads} />
    </div>
  );
}
