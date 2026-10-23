import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand";
import { authEnabled, safeNext } from "@/lib/session";
import { AppPreview } from "./app-preview";
import { AuthCard } from "./auth-card";
import { LegalLinks } from "../(legal)/legal";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string }> }) {
  const { next, mode } = await searchParams;
  if (!authEnabled()) redirect(safeNext(next));

  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="relative hidden overflow-hidden bg-primary lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:pl-12 lg:pt-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary-foreground/10" />
        <div className="relative max-w-lg pr-12 text-primary-foreground">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">Get more calls from Google, without the busywork.</h2>
          <p className="mt-3 text-primary-foreground/75">Performance, reviews, posts, competitors and a profile audit for every location, in one place.</p>
        </div>
        {/* The app itself, filling the rest of the panel and running off the bottom-right edge like a peek into the product. */}
        <AppPreview className="relative mt-10 min-h-[320px] w-[135%] max-w-none flex-1" />
      </section>

      <section className="flex flex-col px-4 py-8 sm:px-8">
        <BrandLogo className="h-10" />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <AuthCard next={safeNext(next)} initialMode={mode === "signup" ? "signup" : "signin"} />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Free for every business. Your Google data stays in your account. <LegalLinks className="whitespace-nowrap" />
        </p>
      </section>
    </main>
  );
}
