// Shared pieces for the public legal pages (/privacy, /terms) — linked from the login page and the Google OAuth consent screen.
// Edit LEGAL when the company details change; Google's verification checks that the contact email and homepage match.
import Link from "next/link";

export const LEGAL = {
  product: "GBPNinja",
  homepage: "https://app.gbpninja.com",
  contactEmail: "support@gbpninja.com",
  /** The company that runs GBPNinja (shown on both pages; the Google OAuth app is registered under it). */
  operator: "Axilweb Ltd",
  operatorSite: "https://www.axilweb.com",
  effective: "November 20, 2026",
};

export function LegalHeader({ title, intro }: { title: string; intro: string }) {
  return (
    <header className="border-b pb-8">
      <p className="label-caps">Last updated {LEGAL.effective}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 text-muted-foreground">{intro}</p>
      <p className="mt-3 text-sm text-muted-foreground">
        {LEGAL.product} is a product of{" "}
        <a href={LEGAL.operatorSite} className="font-medium text-foreground hover:underline">
          {LEGAL.operator}
        </a>
        . On this page, &quot;we&quot;, &quot;us&quot; and &quot;our&quot; mean {LEGAL.operator}, which operates {LEGAL.product}.
      </p>
    </header>
  );
}

/** A numbered section with an anchor (e.g. /privacy#google-data). */
export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/85 [&_a]:font-medium [&_a]:text-primary [&_a:hover]:underline [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

export function Contact() {
  return (
    <p>
      {LEGAL.product} is operated by {LEGAL.operator} (<a href={LEGAL.operatorSite}>{LEGAL.operatorSite.replace(/^https:\/\/(www\.)?/, "")}</a>). Questions or requests:{" "}
      <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>. We reply within 5 business days.
    </p>
  );
}

export const LegalLinks = ({ className }: { className?: string }) => (
  <span className={className}>
    <Link href="/privacy" className="hover:text-foreground hover:underline">
      Privacy
    </Link>
    <span aria-hidden> · </span>
    <Link href="/terms" className="hover:text-foreground hover:underline">
      Terms
    </Link>
  </span>
);
