import { ShieldAlert } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";

/** Signed in, but not a member of this workspace (live mode): ask an admin for an invite. `suspended`: the platform paused it. */
export function NoAccess({ email, suspended }: { email: string | null; suspended?: boolean }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-8 text-center">
        <BrandLogo className="mx-auto h-9" />
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10 text-warning">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{suspended ? "This workspace is paused" : "You don't have access yet"}</h1>
          {suspended ? (
            <p className="mt-2 text-sm text-muted-foreground">Access to this workspace has been paused. Contact support to turn it back on.</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {email ? <span className="font-semibold text-foreground">{email}</span> : "This account"} isn&apos;t a member of this workspace. Ask the workspace admin to invite this email address,
              then sign in again.
            </p>
          )}
        </div>
        <SignOutButton />
      </div>
    </main>
  );
}
