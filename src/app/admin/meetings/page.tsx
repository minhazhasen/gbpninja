import { MeetingsBoard } from "@/components/admin/meetings-board";
import { PageHeader } from "@/components/ui";
import { listLeads } from "@/lib/platform/store";
import { MEETING_FILTERS, type MeetingFilter } from "@/lib/platform/types";

export const metadata = { title: "Meetings" };

export default async function AdminMeetingsPage({ searchParams }: { searchParams: Promise<{ filter?: string; meeting?: string }> }) {
  const sp = await searchParams;
  const leads = await listLeads();
  const filter = MEETING_FILTERS.includes(sp.filter as MeetingFilter) ? (sp.filter as MeetingFilter) : "upcoming";
  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Meetings">Bookings from offers: send Meet links, answer requests, record the outcome</PageHeader>
      <MeetingsBoard leads={leads} filter={filter} openId={sp.meeting ?? null} />
    </div>
  );
}
