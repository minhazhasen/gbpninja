import Link from "next/link";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Search } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, PillTabs, inputClass } from "@/components/ui";
import { listWorkspaces } from "@/lib/platform/store";
import { WORKSPACE_STATUS, type WorkspaceStatus } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

const FILTERS: { key: "all" | WorkspaceStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
];

export default async function AdminWorkspacesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = FILTERS.some((f) => f.key === sp.status) ? (sp.status as (typeof FILTERS)[number]["key"]) : "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const all = await listWorkspaces();
  const rows = all
    .filter((w) => status === "all" || w.status === status)
    .filter((w) => !q || [w.name, w.ownerName, w.ownerEmail, ...w.profiles.map((p) => p.title)].some((s) => s.toLowerCase().includes(q)))
    .sort((a, b) => Number(!!b.current) - Number(!!a.current) || a.name.localeCompare(b.name));
  const href = (key: string) => {
    const p = new URLSearchParams();
    if (key !== "all") p.set("status", key);
    if (q) p.set("q", sp.q!.trim());
    const s = p.toString();
    return `/admin/workspaces${s ? `?${s}` : ""}`;
  };
  const ago = (iso: string | null) => (iso ? formatDistanceToNow(parseISO(iso), { addSuffix: true }) : "Never");

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Workspaces" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PillTabs
          label="Status"
          items={FILTERS.map((f) => ({ href: href(f.key), label: f.label, active: f.key === status, count: f.key === "all" ? all.length : all.filter((w) => w.status === f.key).length }))}
        />
        <form action="/admin/workspaces" className="relative sm:w-72">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search workspace, owner, profile…" aria-label="Search workspaces" className={cn(inputClass, "h-9 pl-9")} />
        </form>
      </div>

      <Card className="overflow-hidden">
        {!rows.length ? (
          <EmptyState title="No workspaces match">Try another filter or search.</EmptyState>
        ) : (
          <>
            {/* lg and up: table */}
            <table className="hidden w-full text-sm lg:table">
              <thead>
                <tr className="border-b bg-muted/30 text-left">
                  {["Workspace", "Status", "Profiles", "Users", "Last active"].map((h, i) => (
                    <th key={h} className={cn("label-caps px-4 py-2.5 font-medium first:pl-6", i >= 2 && i <= 3 && "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((w) => (
                  <tr key={w.id} className="group relative transition-colors hover:bg-muted/40">
                    <td className="py-3 pl-6 pr-4">
                      <Link href={`/admin/workspaces/${w.id}`} className="font-semibold after:absolute after:inset-0">
                        {w.name}
                      </Link>
                      {w.current && (
                        <Badge variant="default" pill className="ml-2">
                          This app
                        </Badge>
                      )}
                      <p className="truncate text-xs text-muted-foreground">{w.ownerEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={WORKSPACE_STATUS[w.status].variant} pill>
                        {WORKSPACE_STATUS[w.status].label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{w.profiles.length}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{w.members.filter((m) => m.status === "active").length}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ago(w.lastActiveAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Below lg: stacked cards */}
            <ul className="divide-y lg:hidden">
              {rows.map((w) => (
                <li key={w.id}>
                  <Link href={`/admin/workspaces/${w.id}`} className="block space-y-1.5 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-semibold">{w.name}</span>
                      <Badge variant={WORKSPACE_STATUS[w.status].variant} pill>
                        {WORKSPACE_STATUS[w.status].label}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{w.ownerEmail}</p>
                    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>{w.profiles.length} profiles</span>
                      <span>{w.members.filter((m) => m.status === "active").length} users</span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
