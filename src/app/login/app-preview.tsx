// The login page's product shot: real screenshots of the Dashboard (public/brand/app-preview-light|dark.webp; 1440×900 at 2×, cropped
// above the sidebar's user card), swapped by the `.dark` class. It fills its box and crops from the top-left, so it always runs off the
// bottom / right edge whatever the screen size. Retake after big UI changes (headless Chrome, signed in, ?location=locations/1001).
import { cn } from "@/lib/utils";

export function AppPreview({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none flex select-none flex-col overflow-hidden rounded-tl-2xl border-l border-t border-primary-foreground/20 bg-card shadow-2xl", className)}>
      <div className="flex shrink-0 items-center gap-1.5 border-b bg-card px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
        <span className="ml-3 rounded-md bg-muted px-3 py-0.5 text-[10px] text-muted-foreground">app.gbpninja.com/dashboard</span>
      </div>
      <div className="relative min-h-0 flex-1 bg-background">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/app-preview-light.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-left-top dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/app-preview-dark.webp" alt="" className="absolute inset-0 hidden h-full w-full object-cover object-left-top dark:block" />
      </div>
    </div>
  );
}
