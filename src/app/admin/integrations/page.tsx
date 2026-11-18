import { headers } from "next/headers";
import { CheckCircle2, CircleDashed, Server, TriangleAlert } from "lucide-react";
import { Badge, Card, PageHeader, PanelHeader } from "@/components/ui";
import { platformAdminEmails } from "@/lib/admin";
import { isDemo } from "@/lib/connections";
import { setupChecklist, type SetupItem } from "@/lib/platform/setup";
import { cn } from "@/lib/utils";

export const metadata = { title: "Integrations" };

export const dynamic = "force-dynamic";

/** Server settings and scheduled jobs of the server this page runs on (the live site, or a local dev server). */
export default async function AdminIntegrationsPage() {
  const items = await setupChecklist();
  const groups = [...new Set(items.map((i) => i.group))];
  const admins = platformAdminEmails();
  const required = items.filter((i) => !i.optional);
  const done = required.filter((i) => i.ok).length;
  const live = process.env.NODE_ENV === "production";
  const host = (await headers()).get("x-forwarded-host") ?? (await headers()).get("host") ?? "";

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Integrations">
        {done} of {required.length} required set up
        {items.some((i) => i.optional) && ` · ${items.filter((i) => i.optional && i.ok).length} of ${items.filter((i) => i.optional).length} optional`}
      </PageHeader>

      <Card className={cn("flex items-start gap-3 px-5 py-3.5 text-sm lg:px-6", !live && "border-warning/40 bg-warning/5")}>
        <Server className={cn("mt-0.5 h-4 w-4 shrink-0", live ? "text-success" : "text-warning")} />
        <p className="min-w-0 flex-1">
          {live ? (
            <>
              <b>Live site</b> <span className="text-muted-foreground">({host})</span>: these are the live server&apos;s settings and jobs.
            </>
          ) : (
            <>
              <b>Local development server</b> <span className="text-muted-foreground">({host})</span>: this shows your computer&apos;s settings, not the live
              site&apos;s. Cron jobs, backups and live-only links aren&apos;t needed here — open this page on the live site to check those.
            </>
          )}
        </p>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {groups.map((g) => {
          const list = items.filter((i) => i.group === g);
          return (
            <Card key={g} className={cn("overflow-hidden", g === "Scheduled jobs" && "lg:col-span-2")}>
              <PanelHeader title={g} meta={`${list.filter((i) => i.ok).length}/${list.length}${list.every((i) => i.optional) ? " · optional" : ""}`} />
              <ul className={cn("divide-y", g === "Scheduled jobs" && "lg:grid lg:grid-cols-2 lg:divide-y-0 [&>li]:lg:border-b [&>li:nth-child(even)]:lg:border-l")}>
                {list.map((c: SetupItem) => (
                  <li key={c.label} className="flex items-start gap-3 px-5 py-3 text-sm lg:px-6">
                    {c.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    ) : c.optional ? (
                      <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 font-medium">
                        {c.label}
                        {c.optional && (
                          <Badge variant="secondary" pill>
                            Optional
                          </Badge>
                        )}
                      </span>
                      <span className="block break-words font-mono text-[11px] text-muted-foreground">{c.hint}</span>
                      {c.note && (
                        <span className="mt-0.5 block text-xs text-muted-foreground" suppressHydrationWarning>
                          {c.note}
                        </span>
                      )}
                    </span>
                    <span className={cn("shrink-0 text-right text-xs", c.ok ? "font-semibold text-success" : c.optional ? "text-muted-foreground" : "font-semibold text-warning")}>
                      {c.status ?? (c.ok ? "Set" : "Missing")}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
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

      <p className="text-xs text-muted-foreground">
        Server settings are env vars on the host (cPanel → Setup Node.js App → Environment variables); restart the app after changing them. Google also
        needs an approved Business Profile API access request for the Cloud project — quota is 0 until it&apos;s approved.
      </p>
    </div>
  );
}
