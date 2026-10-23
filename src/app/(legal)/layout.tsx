// Public legal pages: no sign-in needed (excluded in src/middleware.ts) so Google's reviewers and visitors can read them.
import Link from "next/link";
import { BrandLogo } from "@/components/brand";
import { LEGAL } from "./legal";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/login" aria-label={`${LEGAL.product} home`}>
            <BrandLogo className="h-9" />
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium">
            <Link href="/privacy" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              Terms
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <article className="space-y-9 rounded-2xl border bg-card p-6 sm:p-10">{children}</article>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          © 2026 {LEGAL.product} ·{" "}
          <a href={`mailto:${LEGAL.contactEmail}`} className="hover:underline">
            {LEGAL.contactEmail}
          </a>
        </p>
      </main>
    </div>
  );
}
