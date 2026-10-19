import { CheckCircle2, CircleAlert, Wrench } from "lucide-react";
import { Badge, Card, Field, PageHeader, PanelHeader, buttonClass, inputClass } from "@/components/ui";
import { auditLocation, type Severity } from "@/lib/audit";
import { getProvider } from "@/lib/gbp";
import { resolveLocation, type PageProps } from "@/lib/location";
import { cn } from "@/lib/utils";
import { applyAuditFixes } from "../actions";

const SEVERITY: Record<Severity, { label: string; variant: "destructive" | "warning" | "secondary"; icon: string }> = {
  high: { label: "High", variant: "destructive", icon: "text-destructive" },
  medium: { label: "Medium", variant: "warning", icon: "text-warning" },
  low: { label: "Low", variant: "secondary", icon: "text-muted-foreground" },
};

export default async function AuditPage({ searchParams }: PageProps) {
  const { location } = await resolveLocation(searchParams);
  const reviews = await (await getProvider()).listReviews(location.id);
  const { score, issues, passed } = auditLocation(location, reviews);
  const grade = score >= 80 ? { label: "Strong", color: "var(--viz-2)", text: "text-success" } : score >= 50 ? { label: "Needs work", color: "hsl(var(--warning))", text: "text-warning" } : { label: "Weak", color: "hsl(var(--destructive))", text: "text-destructive" };
  const bySeverity = (s: Severity) => issues.filter((i) => i.severity === s).length;
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Profile audit">{location.title}</PageHeader>

      <Card className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center lg:p-6">
        <div className="relative h-32 w-32 shrink-0 self-center">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
            <circle cx="60" cy="60" r={R} fill="none" stroke={grade.color} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-semibold tabular-nums tracking-tight">{score}</span>
            <span className="text-xs text-muted-foreground">of 100</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold", grade.text)}>{grade.label}</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            {issues.length ? `${issues.length} things to improve on this profile` : "This profile is fully optimized"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Complete profiles get more views and actions on Google Search and Maps.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="destructive" pill>{bySeverity("high")} high</Badge>
            <Badge variant="warning" pill>{bySeverity("medium")} medium</Badge>
            <Badge variant="secondary" pill>{bySeverity("low")} low</Badge>
            <Badge variant="success" pill>{passed.length} passed</Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <PanelHeader title="Issues" meta={issues.length} />
            <ul className="divide-y">
              {issues.map((i) => (
                <li key={i.id} className="flex items-start gap-3 px-5 py-3.5 lg:px-6">
                  <CircleAlert className={cn("mt-0.5 h-[18px] w-[18px] shrink-0", SEVERITY[i.severity].icon)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{i.title}</p>
                    <p className="text-sm text-muted-foreground">{i.detail}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                    {i.fixable && (
                      <Badge variant="default" pill>
                        <Wrench className="h-3 w-3" />
                        Fix here
                      </Badge>
                    )}
                    <Badge variant={SEVERITY[i.severity].variant} pill>
                      {SEVERITY[i.severity].label}
                    </Badge>
                  </div>
                </li>
              ))}
              {issues.length === 0 && <li className="px-6 py-8 text-center text-sm text-muted-foreground">No issues found.</li>}
            </ul>
          </Card>
          <Card className="overflow-hidden">
            <PanelHeader title="Passed checks" meta={passed.length} />
            <ul className="grid gap-x-6 gap-y-2 p-5 sm:grid-cols-2 lg:px-6">
              {passed.map((p) => (
                <li key={p} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  {p}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="h-fit overflow-hidden lg:sticky lg:top-20">
          <PanelHeader title="Quick fix" />
          <form action={applyAuditFixes} className="space-y-4 p-5">
            <input type="hidden" name="locationId" value={location.id} />
            <Field label="Business description" hint={`${location.description?.length ?? 0} / 750 · aim for 250+`}>
              <textarea name="description" rows={6} maxLength={750} defaultValue={location.description} className={inputClass} />
            </Field>
            <Field label="Phone">
              <input name="phone" defaultValue={location.phone} className={inputClass} />
            </Field>
            <Field label="Website">
              <input name="websiteUri" type="url" defaultValue={location.websiteUri} className={inputClass} />
            </Field>
            <Field label="Additional categories" hint="Comma-separated">
              <input name="additionalCategories" defaultValue={location.additionalCategories.join(", ")} className={inputClass} />
            </Field>
            <button className={buttonClass("default", "default", "w-full")}>Save to Google profile</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
