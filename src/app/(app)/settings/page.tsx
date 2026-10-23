import { ConnectionsBoard } from "@/components/settings/connections-board";
import { EmailSettings } from "@/components/settings/email-settings";
import { TemplatesBoard } from "@/components/settings/templates-board";
import { PageHeader, PillTabs } from "@/components/ui";
import { channelAvailable, isDemo } from "@/lib/connections";
import { getProvider } from "@/lib/gbp";
import { resolveLocation } from "@/lib/location";
import { CHANNELS } from "@/lib/posts";
import { isTemplateKind } from "@/lib/templates";
import { withLocation } from "@/lib/utils";

const TABS = [
  { key: "accounts", label: "Accounts", intro: "Connect your accounts and configure the workspace" },
  { key: "email", label: "Email", intro: "Send review requests from your own Gmail address" },
  { key: "templates", label: "Templates", intro: "Review request emails, texts and reply templates" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ location?: string; tab?: string; kind?: string }> }) {
  const { location } = await resolveLocation(searchParams);
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "accounts";
  const provider = await getProvider();
  const demo = isDemo();

  let body: React.ReactNode;
  if (tab === "email") {
    const sender = await provider.getEmailSender();
    body = <EmailSettings sender={sender} businessName={location.title} available={channelAvailable("google")} demo={demo} templatesHref={withLocation("/settings", location.id, { tab: "templates" })} />;
  } else if (tab === "templates") {
    const templates = await provider.listTemplates();
    body = <TemplatesBoard templates={templates} businessName={location.title} initialKind={isTemplateKind(sp.kind) ? sp.kind : "request_email"} />;
  } else {
    const [connections, locations, searchConsole] = await Promise.all([provider.listConnections(), provider.listLocations(), provider.getSearchConsole()]);
    body = (
      <ConnectionsBoard
        connections={connections}
        available={Object.fromEntries(CHANNELS.map((c) => [c, channelAvailable(c)]))}
        locationCount={locations.length}
        demo={demo}
        searchConsole={{
          connection: searchConsole,
          locations: locations.map((l) => ({ id: l.id, title: l.title, websiteUri: l.websiteUri })),
          available: channelAvailable("google"),
        }}
      />
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Settings">{TABS.find((t) => t.key === tab)!.intro}</PageHeader>
      <PillTabs label="Settings sections" items={TABS.map((t) => ({ href: withLocation("/settings", location.id, t.key === "accounts" ? {} : { tab: t.key }), label: t.label, active: t.key === tab }))} />
      {body}
    </div>
  );
}
