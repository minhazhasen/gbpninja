import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { platformAdmin } from "@/lib/admin";
import { listLeads } from "@/lib/platform/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await platformAdmin();
  // Not an admin: the panel doesn't exist for them.
  if (!admin) notFound();
  const leads = await listLeads();
  return (
    <AdminShell admin={admin} newLeads={leads.filter((l) => l.status === "booked").length}>
      {children}
    </AdminShell>
  );
}
