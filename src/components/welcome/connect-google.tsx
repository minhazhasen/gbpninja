"use client";

// Welcome screen: connect a Google account (OAuth consent), then pick the Business Profiles to manage (Settings → Accounts).
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BarChart3, Check, ClipboardCheck, Loader2, MapPin, MessageSquareText } from "lucide-react";
import { connectChannel } from "@/app/(app)/actions";
import { GoogleIcon } from "@/components/brand-icons";
import { Card, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

const steps = ["Connect the Google account that manages your Business Profiles", "Choose the profiles to manage", "See your real reviews, calls and searches"];
const perks = [
  { icon: BarChart3, text: "Views, calls, website clicks and directions" },
  { icon: MessageSquareText, text: "Every review in one place, with replies" },
  { icon: ClipboardCheck, text: "A profile audit with fixes you can apply" },
  { icon: MapPin, text: "Competitors and your search keywords" },
];

export function ConnectGoogle({ state, account, configured }: { state: "connect" | "pick"; account: string | null; configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    const res = await connectChannel("google");
    if (res.ok && res.redirect) return void window.location.assign(res.redirect);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
  };
  const step = state === "pick" ? 1 : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8 pt-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome to GBPNinja</h1>
        <p className="mt-1.5 text-muted-foreground">Connect your Google Business Profile to see your real data.</p>
      </div>

      <Card className="overflow-hidden">
        <ol className="divide-y">
          {steps.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-4 px-5 py-4 sm:px-6", i === step && "bg-accent/40")}>
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  i < step ? "bg-success text-primary-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn("text-sm", i === step ? "font-semibold" : "text-muted-foreground")}>
                {s}
                {i === 0 && i < step && account && <span className="ml-1 font-normal text-muted-foreground">({account})</span>}
              </span>
            </li>
          ))}
        </ol>
        <div className="border-t bg-muted/30 px-5 py-5 sm:px-6">
          {state === "pick" ? (
            <Link href="/settings?tab=accounts&connected=google" className={cn(buttonClass(), "h-11 w-full sm:w-auto")}>
              Choose your Business Profiles
            </Link>
          ) : (
            <button type="button" onClick={connect} disabled={busy || !configured} className={cn(buttonClass("outline"), "h-11 w-full gap-3 font-semibold sm:w-auto")}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleIcon className="h-5 w-5" />}
              Connect Google Business Profile
            </button>
          )}
          {!configured && <p className="mt-3 text-sm text-destructive">Google sign-in isn&apos;t set up on this server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).</p>}
          <p className="mt-3 text-xs text-muted-foreground">Google asks you to allow GBPNinja to manage your Business Profile. You can disconnect any time in Settings.</p>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {perks.map((p) => (
          <div key={p.text} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <p.icon className="h-[18px] w-[18px]" />
            </span>
            {p.text}
          </div>
        ))}
      </div>
    </div>
  );
}
