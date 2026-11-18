import { headers } from "next/headers";
import { ArrowUpRight, Flame, Server } from "lucide-react";
import { Badge, Card, PageHeader, PanelHeader, PillTabs, StatStrip } from "@/components/ui";
import { ChannelIcon, GoogleIcon } from "@/components/marketing/channel-icon";
import { platformAdminEmails } from "@/lib/admin";
import { isDemo } from "@/lib/connections";
import { APP_GROUPS, setupChecklist, type AppGroup, type SetupItem } from "@/lib/platform/setup";
import { cn } from "@/lib/utils";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

const TABS = [
  { id: "apps", label: "Apps" },
  { id: "server", label: "Server" },
  { id: "jobs", label: "Scheduled jobs" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** The developer apps this platform runs on — not any workspace's own accounts (those are in each workspace's Settings). */
const APPS: Record<AppGroup, { name: string; icon: React.ReactNode; powers: string; console: { label: string; href: string } }> = {
  Google: {
    name: "Google",
    icon: <GoogleIcon className="h-5 w-5" />,
    powers: "Business Profiles, Gmail and Search Console",
    console: { label: "Google Cloud Console", href: "https://console.cloud.google.com/apis/credentials" },
  },
  Firebase: {
    name: "Firebase",
    icon: <Flame className="h-5 w-5 text-warning" />,
    powers: "Sign-in to the app with Google or email",
    console: { label: "Firebase console", href: "https://console.firebase.google.com/" },
  },
  Meta: {
    name: "Facebook + Instagram",
    icon: (
      <span className="flex -space-x-1">
        <ChannelIcon channel="facebook" className="h-5 w-5" />
        <ChannelIcon channel="instagram" className="h-5 w-5" />
      </span>
    ),
    powers: "Posting to Facebook Pages and Instagram",
    console: { label: "Meta for Developers", href: "https://developers.facebook.com/apps/" },
  },
  LinkedIn: {
    name: "LinkedIn",
    icon: <ChannelIcon channel="linkedin" className="h-5 w-5" />,
    powers: "Posting to LinkedIn",
    console: { label: "LinkedIn Developers", href: "https://www.linkedin.com/developers/apps" },
  },
};

/** The platform's own apps (Google, Firebase, Meta, LinkedIn), this server's settings and its scheduled jobs. */
export default async function AdminIntegrationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "apps";
  const [items, h] = await Promise.all([setupChecklist(), headers()]);
  const of = (g: string) => items.filter((i) => i.group === g);
  const apps = APP_GROUPS.map((g) => ({ group: g, list: of(g), optional: of(g).every((i) => i.optional) }));
  const appReady = (list: SetupItem[]) => list.every((i) => i.ok);
  const appsReady = apps.filter((a) => appReady(a.list)).length;
  const appsBroken = apps.filter((a) => !a.optional && !appReady(a.list)).length;
  const server = of("Server");
  const jobs = of("Scheduled jobs");
  const serverOk = server.filter((i) => i.ok).length;
  const jobsOk = jobs.filter((i) => i.ok).length;
  const live = process.env.NODE_ENV === "production";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const href = (t: Tab) => (t === "apps" ? "/admin/integrations" : `/admin/integrations?tab=${t}`);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Integrations"
        actions={
          <span
            title={live ? "Showing the live server" : "Showing your computer's settings, not the live site's. Cron jobs, backups and live-only links aren't needed here."}
            className={cn("inline-flex h-8 items-center gap-2 rounded-full border bg-card px-3 text-xs font-medium", live ? "text-success" : "text-warning")}
          >
            <Server className="h-3.5 w-3.5" />
            {live ? "Live site" : "Local server"}
            <span className="font-normal text-muted-foreground">{host}</span>
          </span>
        }
      >
        The apps and settings this platform runs on
      </PageHeader>

      <StatStrip
        cols={3}
        items={[
          {
            label: "Apps",
            value: `${appsReady}/${apps.length}`,
            hint: appsBroken ? `${appsBroken} not ready` : appsReady === apps.length ? "All connected" : "Required ones ready",
            alert: appsBroken > 0,
            href: href("apps"),
          },
          { label: "Server", value: `${serverOk}/${server.length}`, hint: serverOk === server.length ? "All set" : `${server.length - serverOk} missing`, alert: serverOk < server.length, href: href("server") },
          { label: "Scheduled jobs", value: `${jobsOk}/${jobs.length}`, hint: jobsOk === jobs.length ? "All running" : `${jobs.length - jobsOk} need a look`, alert: jobsOk < jobs.length, href: href("jobs") },
        ]}
      />

      <PillTabs
        label="Integrations sections"
        items={TABS.map((t) => ({
          href: href(t.id),
          label: t.label,
          active: tab === t.id,
          count: (t.id === "apps" ? appsBroken : t.id === "server" ? server.length - serverOk : jobs.length - jobsOk) || undefined,
        }))}
      />

      {tab === "apps" && (
        <>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {apps.map((a) => (
              <AppCard key={a.group} group={a.group} list={a.list} optional={a.optional} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Keep the Google OAuth consent screen <b>In production</b>: in Testing, Google ends every workspace&apos;s access after 7 days.
          </p>
        </>
      )}

      {tab === "server" && (
        <>
          <ChecklistCard title="Server settings" list={server} />
          <AdminsCard />
          <p className="text-xs text-muted-foreground">
            Set these in cPanel → Setup Node.js App → Environment variables, then restart the app.
          </p>
        </>
      )}

      {tab === "jobs" && <ChecklistCard title="Scheduled jobs" list={jobs} />}
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function AppCard({ group, list, optional }: { group: AppGroup; list: SetupItem[]; optional: boolean }) {
  const app = APPS[group];
  const ready = list.every((i) => i.ok);
  // An optional app whose keys (its first row) aren't set is simply not in use, whatever its redirect link says.
  const idle = optional && !list[0]?.ok;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 border-b px-5 py-4 lg:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-card">{app.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{app.name}</h2>
            {optional && (
              <Badge variant="secondary" pill>
                Optional
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{app.powers}</p>
        </div>
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
            ready ? "bg-success/10 text-success" : idle ? "bg-muted text-muted-foreground" : "bg-warning/10 text-warning",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", ready ? "bg-success" : idle ? "bg-muted-foreground/60" : "bg-warning")} />
          {ready ? "Connected" : idle ? "Not set up" : "Needs setup"}
        </span>
      </div>
      <ul className="divide-y">
        {list.map((c) => (
          <Row key={c.label} c={c} />
        ))}
      </ul>
      <a
        href={app.console.href}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-1 border-t px-5 py-2.5 text-xs font-semibold text-primary hover:bg-muted/40"
      >
        Open {app.console.label} <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </Card>
  );
}

function Row({ c }: { c: SetupItem }) {
  const status = c.status ?? (c.ok ? "Set" : "Missing");
  // Clean when it works; what to do when it doesn't. Jobs always say when they last ran.
  const detail = c.group === "Scheduled jobs" ? c.note : !c.ok ? `Add ${c.hint}` : null;
  return (
    <li className="flex items-center gap-3 px-5 py-3 lg:px-6" title={c.hint}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{c.label}</span>
        {detail && (
          <span className="block break-words text-xs text-muted-foreground" suppressHydrationWarning>
            {detail}
          </span>
        )}
      </span>
      <Badge variant={c.ok ? "success" : c.optional ? "secondary" : "warning"} pill className="shrink-0">
        {status}
      </Badge>
    </li>
  );
}

function ChecklistCard({ title, list }: { title: string; list: SetupItem[] }) {
  return (
    <Card className="overflow-hidden">
      <PanelHeader title={title} meta={`${list.filter((i) => i.ok).length}/${list.length}`} />
      <ul className="divide-y">
        {list.map((c) => (
          <Row key={c.label} c={c} />
        ))}
      </ul>
    </Card>
  );
}

function AdminsCard() {
  const admins = platformAdminEmails();
  return (
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
  );
}
