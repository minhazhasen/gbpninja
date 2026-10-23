// Column layout shared by Settings → Accounts rows, their header and Data sources: account · status · linked · change · ⋯
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const ACCOUNT_GRID = "lg:grid-cols-[minmax(0,1.5fr)_150px_minmax(0,1fr)_200px_40px]";
/** Grid for one row: two lines on phones (account + ⋯, then status / linked / change), columns from lg. */
export const ACCOUNT_ROW = cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5 lg:gap-x-4 lg:px-6", ACCOUNT_GRID);

export function AccountColumns({ third = "Connected" }: { third?: string }) {
  return (
    <div className={cn("hidden gap-x-4 border-b bg-muted/30 px-6 py-2 lg:grid", ACCOUNT_GRID)} aria-hidden>
      <span className="label-caps">Account</span>
      <span className="label-caps">Status</span>
      <span className="label-caps">{third}</span>
      <span className="label-caps text-right">Change</span>
      <span />
    </div>
  );
}

export function StatusPill({ tone, label }: { tone: "success" | "warning" | "destructive" | "muted"; label: string }) {
  const cls = { success: "bg-success/10 text-success", warning: "bg-warning/10 text-warning", destructive: "bg-destructive/10 text-destructive", muted: "bg-muted text-muted-foreground" }[tone];
  const dot = { success: "bg-success", warning: "bg-warning", destructive: "bg-destructive", muted: "bg-muted-foreground/50" }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

/** "Connect with Google / Facebook / X": white button with the network's logo, like each network's own sign-in button. */
export function BrandConnectButton({ icon, network, onClick, busy, disabled }: { icon: React.ReactNode; network: string; onClick: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-input bg-card px-3 text-sm font-semibold shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      Connect with {network}
    </button>
  );
}
