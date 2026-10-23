import { AnnouncementsBoard } from "@/components/admin/announcements-board";
import { PageHeader } from "@/components/ui";
import { listAnnouncements } from "@/lib/platform/store";

export default async function AdminAnnouncementsPage() {
  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Announcements">A banner shown at the top of the app</PageHeader>
      <AnnouncementsBoard announcements={await listAnnouncements()} />
    </div>
  );
}
