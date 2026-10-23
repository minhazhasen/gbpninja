/* eslint-disable @next/next/no-img-element -- reviewer photos are remote Google URLs */
import { Star } from "lucide-react";
import { cn, initials } from "@/lib/utils";

// Google-style letter avatars (fixed palette: the one place raw colours are used for people).
const AVATAR_BG = ["bg-[#C2410C]", "bg-[#7E22CE]", "bg-[#1D4ED8]", "bg-[#0F766E]", "bg-[#BE185D]", "bg-[#4D7C0F]", "bg-[#B45309]", "bg-[#0369A1]"];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function ReviewAvatar({ name, photo, className }: { name: string; photo?: string | null; className?: string }) {
  if (photo) return <img src={photo} alt="" referrerPolicy="no-referrer" className={cn("h-9 w-9 shrink-0 rounded-full object-cover", className)} />;
  return (
    <span
      className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white", AVATAR_BG[hash(name) % AVATAR_BG.length], className)}
      aria-hidden
    >
      {initials(name).slice(0, 1) || "?"}
    </span>
  );
}

export function ReviewStars({ rating, size = "sm", className }: { rating: number; size?: "sm" | "md"; className?: string }) {
  const cls = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5", className)} role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn(cls, i < rating ? "fill-warning text-warning" : "text-muted-foreground/30")} />
      ))}
    </span>
  );
}

/** 5★ → 1★ horizontal bars. `dist[0]` = 5 stars. Clicking a row filters by that rating. */
export function StarBars({ dist, onPick, active, className }: { dist: number[]; onPick?: (stars: number) => void; active?: number | null; className?: string }) {
  const max = Math.max(1, ...dist);
  const total = dist.reduce((a, b) => a + b, 0);
  return (
    <ul className={cn("space-y-1.5", className)}>
      {dist.map((count, i) => {
        const stars = 5 - i;
        const pct = total ? Math.round((count / total) * 100) : 0;
        const row = (
          <>
            <span className="flex w-7 shrink-0 items-center gap-0.5 text-sm tabular-nums text-muted-foreground">
              {stars}
              <Star className="h-3 w-3 fill-current" />
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-2 rounded-full"
                style={{ width: `${(count / max) * 100}%`, background: stars >= 4 ? "var(--viz-2)" : stars === 3 ? "var(--viz-1)" : "var(--viz-3)" }}
              />
            </span>
            <span className="w-16 shrink-0 text-right text-sm tabular-nums">
              {count}
              <span className="ml-1 text-xs text-muted-foreground">{pct}%</span>
            </span>
          </>
        );
        return (
          <li key={stars}>
            {onPick ? (
              <button
                type="button"
                onClick={() => onPick(stars)}
                aria-pressed={active === stars}
                className={cn("flex w-full items-center gap-3 rounded-md px-1 py-0.5 hover:bg-muted/50", active === stars && "bg-muted")}
              >
                {row}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-1 py-0.5">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
