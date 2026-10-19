import { CheckCircle2, CircleDashed } from "lucide-react";
import { signIn } from "@/auth";
import { Badge, Card, PageHeader, PanelHeader, buttonClass } from "@/components/ui";

export default function SettingsPage() {
  const demo = process.env.GBP_DATA_SOURCE !== "google";
  const googleConfigured = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

  const checks = [
    { label: "Google OAuth client configured", ok: googleConfigured, hint: "AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET in .env.local" },
    { label: "Live data source enabled", ok: !demo, hint: "GBP_DATA_SOURCE=google" },
    { label: "Business Profile API access approved", ok: false, hint: "Request access in Google Cloud Console (checked when live data loads)" },
  ];

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Settings">Connections and workspace preferences</PageHeader>

      <Card className="overflow-hidden">
        <PanelHeader title="Google Business Profile" action={demo ? <Badge variant="warning" pill>Demo data</Badge> : <Badge variant="success" pill>Live</Badge>} />
        <div className="space-y-4 p-5 lg:p-6">
          <p className="text-sm text-muted-foreground">
            Connect a Google account that manages your business locations. The app needs the <code className="rounded bg-muted px-1 py-0.5 text-xs">business.manage</code> scope to read
            performance, reply to reviews, publish posts and update profile fields.
          </p>
          <ul className="space-y-2.5">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2.5 text-sm">
                {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.hint}</span>
                </span>
              </li>
            ))}
          </ul>
          {googleConfigured && (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/dashboard" });
              }}
            >
              <button className={buttonClass()}>Connect Google account</button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
