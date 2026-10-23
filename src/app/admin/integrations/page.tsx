import { CheckCircle2, CircleDashed } from "lucide-react";
import { Card, PageHeader, PanelHeader } from "@/components/ui";
import { platformAdminEmails } from "@/lib/admin";
import { isDemo } from "@/lib/connections";
import { setupChecklist, type SetupItem } from "@/lib/platform/setup";

export default function AdminIntegrationsPage() {
  const items = setupChecklist();
  const groups = [...new Set(items.map((i) => i.group))];
  const admins = platformAdminEmails();
  const done = items.filter((i) => i.ok).length;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Integrations">
        {done} of {items.length} set up
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((g) => (
          <Card key={g} className="overflow-hidden">
            <PanelHeader title={g} meta={`${items.filter((i) => i.group === g && i.ok).length}/${items.filter((i) => i.group === g).length}`} />
            <ul className="divide-y">
              {items
                .filter((i) => i.group === g)
                .map((c: SetupItem) => (
                  <li key={c.label} className="flex items-start gap-3 px-5 py-3 text-sm lg:px-6">
                    {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{c.label}</span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">{c.hint}</span>
                    </span>
                    <span className={c.ok ? "text-xs font-semibold text-success" : "text-xs text-muted-foreground"}>{c.ok ? "Set" : "Missing"}</span>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <PanelHeader title="Platform admins" meta="PLATFORM_ADMIN_EMAILS" />
        <div className="space-y-2 px-5 py-4 text-sm lg:px-6">
          {admins.length ? (
            <ul className="flex flex-wrap gap-2">
              {admins.map((e) => (
                <li key={e} className="rounded-full border px-3 py-1">
                  {e}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Nobody is listed yet.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Edit the env var and restart to change who can open this panel.
            {isDemo() && " Local demo runs let anyone in; production builds only allow these emails."}
          </p>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">Google also needs an approved Business Profile API access request for the Cloud project — quota is 0 until it&apos;s approved.</p>
    </div>
  );
}
