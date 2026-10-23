import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Star } from "lucide-react";
import { cn, initials } from "@/lib/utils";

// Small UI kit mirroring TasksBook CRM's shadcn components (Card, Badge, Button,
// StatStrip, PanelHeader, HubTabs). Server-renderable; no client JS.

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border bg-card", className)} {...props} />;
}

export function PageHeader({ title, actions, children }: { title: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children && <p className="mt-0.5 truncate text-sm text-muted-foreground">{children}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PanelHeader({ title, meta, action }: { title: string; meta?: React.ReactNode; action?: React.ReactNode }) {
  return (
    // Wraps when narrow: the actions drop below the title instead of squeezing it (and its badges) underneath them.
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-5 py-3 lg:px-6">
      <h2 className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-1 text-base font-semibold tracking-tight">
        <span className="truncate">{title}</span>
        {meta != null && <span className="max-w-full text-sm font-normal tabular-nums text-muted-foreground">{meta}</span>}
      </h2>
      {action != null && <div className="ml-auto flex min-w-0 max-w-full items-center">{action}</div>}
    </div>
  );
}

export function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary hover:underline">
      {children}
      <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  );
}

export interface StatItem {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  /** Lower is better (e.g. unreplied reviews). */
  invertDelta?: boolean;
  hint?: string;
  alert?: boolean;
  href?: string;
  /** Client components only (e.g. switch a view). */
  onClick?: () => void;
  active?: boolean;
}

export function StatStrip({ items, cols = 4 }: { items: StatItem[]; cols?: 2 | 3 | 4 | 5 }) {
  return (
    <Card className={cn("grid grid-cols-2 overflow-hidden", cols === 5 ? "lg:grid-cols-5" : cols === 3 ? "lg:grid-cols-3" : cols === 2 ? "lg:grid-cols-2" : "lg:grid-cols-4")}>
      {items.map((s, i) => {
        const cls = cn(
          "flex min-w-0 flex-col gap-1 px-4 py-4 text-left sm:px-5 lg:px-6 lg:py-5",
          i % 2 === 1 && "border-l",
          i >= 2 && "border-t lg:border-t-0",
          i >= 1 && "lg:border-l",
          i === items.length - 1 && i % 2 === 0 && "col-span-2 lg:col-span-1",
          (s.href || s.onClick) && "transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
          s.active && "bg-muted/50",
        );
        const body = (
          <>
            <span className="label-caps truncate">{s.label}</span>
            <span className="truncate text-2xl font-semibold leading-tight tracking-tight tabular-nums lg:text-[28px]">{s.value}</span>
            {s.delta != null ? (
              <span
                className={cn(
                  "flex items-center gap-0.5 truncate text-xs font-semibold",
                  s.delta === 0 ? "text-muted-foreground" : s.delta > 0 !== !!s.invertDelta ? "text-success" : "text-destructive",
                )}
              >
                {s.delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5 shrink-0" /> : <ArrowDownRight className="h-3.5 w-3.5 shrink-0" />}
                {Math.abs(s.delta)}%<span className="ml-1 truncate font-normal text-muted-foreground">{s.hint ?? "vs previous"}</span>
              </span>
            ) : (
              s.hint && <span className={cn("truncate text-xs", s.alert ? "font-semibold text-destructive" : "text-muted-foreground")}>{s.hint}</span>
            )}
          </>
        );
        if (s.onClick)
          return (
            <button key={s.label} type="button" onClick={s.onClick} aria-pressed={s.active} className={cls}>
              {body}
            </button>
          );
        return s.href ? (
          <Link key={s.label} href={s.href} className={cls} aria-current={s.active ? "true" : undefined}>
            {body}
          </Link>
        ) : (
          <div key={s.label} className={cls}>
            {body}
          </div>
        );
      })}
    </Card>
  );
}

const badgeVariants = {
  default: "bg-accent text-accent-foreground",
  secondary: "bg-secondary text-muted-foreground",
  destructive: "bg-destructive/10 text-destructive",
  outline: "border-border bg-card text-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
} as const;
export type BadgeVariant = keyof typeof badgeVariants;

export function Badge({ variant = "default", pill, className, children }: { variant?: BadgeVariant; pill?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border border-transparent px-2 py-0.5 text-xs font-semibold leading-4 whitespace-nowrap",
        pill ? "rounded-full text-[11px]" : "rounded-md",
        badgeVariants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

const buttonVariants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "border border-input bg-card text-foreground hover:bg-muted",
  secondary: "bg-secondary text-foreground hover:bg-secondary/70",
  ghost: "text-foreground hover:bg-muted",
  destructive: "bg-destructive text-white hover:bg-destructive/90",
} as const;
const buttonSizes = { default: "h-9 px-4", sm: "h-8 px-3 text-sm", lg: "h-10 px-5", icon: "h-9 w-9" } as const;

export function buttonClass(variant: keyof typeof buttonVariants = "default", size: keyof typeof buttonSizes = "default", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export const inputClass =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="label-caps">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Pill tabs, like TasksBook's HubTabs. */
export function PillTabs({ items, label }: { items: { href: string; label: string; active: boolean; count?: number }[]; label: string }) {
  return (
    <nav aria-label={label} className="no-scrollbar -mt-1 flex gap-1 overflow-x-auto py-1">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors",
            t.active ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-card hover:text-foreground",
          )}
        >
          {t.label}
          {t.count != null && <span className="tabular-nums text-xs opacity-70">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Stars({ rating, size = "h-3.5 w-3.5" }: { rating: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(size, i <= rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted")} />
      ))}
    </span>
  );
}

/** Rating distribution bars (5 → 1). */
export function StarBars({ counts }: { counts: Record<number, number> }) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0) || 1;
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((r) => (
        <div key={r} className="flex items-center gap-2 text-xs">
          <span className="w-3 tabular-nums text-muted-foreground">{r}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${((counts[r] ?? 0) / total) * 100}%` }} />
          </div>
          <span className="w-6 text-right tabular-nums text-muted-foreground">{counts[r] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

/** Initials, or the person's photo when there is one (Google photos need no-referrer). */
export function Avatar({ name, photo, className }: { name: string; photo?: string | null; className?: string }) {
  if (photo)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Google profile photo URLs
      <img src={photo} alt="" referrerPolicy="no-referrer" className={cn("h-9 w-9 shrink-0 rounded-full bg-muted object-cover", className)} />
    );
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground", className)}>
      {initials(name)}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
