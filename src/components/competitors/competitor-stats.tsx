// Summary cards above the Competitors chart: your number, a coloured pill with the gap to the nearby average, and one short line.
import { ArrowRight, Star } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

type Tone = "good" | "bad" | "even";

export interface StandingMetric {
  label: string;
  value: React.ReactNode;
  /** Gap to the nearby average, e.g. "−0.4". */
  delta: { tone: Tone; text: string } | null;
  /** One short line, e.g. "Avg 4.6 · #9 of 9". */
  sub: string;
}

const pill: Record<Tone, string> = { good: "bg-success/10 text-success", bad: "bg-destructive/10 text-destructive", even: "bg-muted text-muted-foreground" };

const cell = (i: number) => cn("flex min-w-0 flex-col gap-1.5 px-4 py-4 sm:px-5 lg:px-6 lg:py-5", i % 2 === 1 && "border-l", i >= 2 && "border-t lg:border-t-0", i >= 1 && "lg:border-l");

export function CompetitorStats({ metrics, missing, totalCategories, onAddCategories }: { metrics: StandingMetric[]; missing: number; totalCategories: number; onAddCategories: () => void }) {
  return (
    <Card className="grid grid-cols-2 overflow-hidden lg:grid-cols-4">
      {metrics.map((m, i) => (
        <div key={m.label} className={cell(i)}>
          <span className="label-caps truncate">{m.label}</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold leading-tight tracking-tight tabular-nums lg:text-[28px]">{m.value}</span>
            {m.delta && <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", pill[m.delta.tone])}>{m.delta.text}</span>}
          </div>
          <span className="truncate text-xs text-muted-foreground">{m.sub}</span>
        </div>
      ))}
      <div className={cell(metrics.length)}>
        <span className="label-caps truncate">Missing categories</span>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-semibold leading-tight tracking-tight tabular-nums lg:text-[28px]">{missing}</span>
          {missing > 0 && (
            <button
              type="button"
              onClick={onAddCategories}
              className="inline-flex items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground hover:bg-accent/70"
            >
              Add <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
        <span className="truncate text-xs text-muted-foreground">{missing ? `of ${totalCategories} used nearby` : "You use them all"}</span>
      </div>
    </Card>
  );
}

/** Rating with a star, for the rating card's value. */
export const RatingValue = ({ value }: { value: number | null }) =>
  value == null ? (
    "—"
  ) : (
    <span className="inline-flex items-center gap-1.5">
      {value.toFixed(1)}
      <Star className="h-5 w-5 fill-warning text-warning" />
    </span>
  );
