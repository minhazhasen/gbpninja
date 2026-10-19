import { MetricsChart } from "@/components/metrics-chart";
import { Card, PageHeader, Stat } from "@/components/ui";
import { getProvider } from "@/lib/gbp";
import { resolveLocation, type PageProps } from "@/lib/location";

const DAYS = 90;

export default async function PerformancePage({ searchParams }: PageProps) {
  const { location } = await resolveLocation(searchParams);
  const data = await (await getProvider()).getMetrics(location.id, DAYS);
  const sum = (k: "impressions" | "calls" | "websiteClicks" | "directions") => data.reduce((s, m) => s + m[k], 0);

  return (
    <>
      <PageHeader title="Performance" subtitle={`${location.title} · last ${DAYS} days`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Impressions" value={sum("impressions").toLocaleString()} />
        <Stat label="Calls" value={sum("calls").toLocaleString()} />
        <Stat label="Website clicks" value={sum("websiteClicks").toLocaleString()} />
        <Stat label="Direction requests" value={sum("directions").toLocaleString()} />
      </div>
      <div className="mt-6 grid gap-4">
        <Card title="Impressions (Search + Maps)">
          <MetricsChart data={data} metric="impressions" />
        </Card>
        <Card title="Customer actions">
          <MetricsChart data={data} metric="actions" />
        </Card>
      </div>
    </>
  );
}
