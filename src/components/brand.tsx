// GBPNinja brand: the wordmark (light / dark versions, swapped by the `.dark` class) and the ninja mark on its own.
// Files live in public/brand/; the favicon is src/app/icon.png and the home-screen icon src/app/apple-icon.png.
import { cn } from "@/lib/utils";

export const APP_NAME = "GBPNinja";

/** Full logo (mark + "GBPNinja"). Height comes from `className` (e.g. "h-7"); width follows. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-light.webp" alt={APP_NAME} className="h-full w-auto dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-dark.webp" alt={APP_NAME} className="hidden h-full w-auto dark:block" />
    </span>
  );
}

/** The ninja mark alone (collapsed sidebar, small spaces). */
export function BrandMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/mark.png" alt={APP_NAME} className={cn("h-8 w-8 shrink-0 object-contain", className)} />;
}
