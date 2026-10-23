import Link from "next/link";
import { CheckCircle2, Crown, MapPin, UserRound } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { AcceptInvite } from "./accept";
import { getProvider } from "@/lib/gbp";
import { tenantForInvite } from "@/lib/gbp/tenancy";
import { runInTenant } from "@/lib/gbp/tenant-context";

export const dynamic = "force-dynamic";

/** Public page behind an invite link. Live mode will require signing in with the invited email first. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // The invite belongs to the workspace that sent it, not to whoever opens the link.
  const tenant = /^[a-f0-9]{16,64}$/.test(token) ? tenantForInvite(token) : null;
  const { invite, locations } = tenant
    ? await runInTenant(tenant, async () => {
        const provider = await getProvider();
        const invite = await provider.findInvite(token);
        return { invite, locations: invite ? await provider.listLocations() : [] };
      })
    : { invite: null, locations: [] };
  const access = !invite
    ? ""
    : invite.role === "admin" || !invite.locationIds.length
      ? "All locations"
      : invite.locationIds.map((id) => locations.find((l) => l.id === id)?.title ?? id).join(", ");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-elegant">
        <div className="mb-5 flex items-center gap-2.5">
          <BrandLogo className="h-8" />
        </div>
        {invite ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">You&apos;re invited</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {invite.invitedBy ?? "An admin"} invited <span className="font-medium text-foreground">{invite.email}</span> to manage Google Business Profiles.
            </p>
            <ul className="mt-5 space-y-2 rounded-xl border p-3 text-sm">
              <li className="flex items-center gap-2">
                {invite.role === "admin" ? <Crown className="h-4 w-4 text-primary" /> : <UserRound className="h-4 w-4 text-primary" />}
                {invite.role === "admin" ? "Admin access — everything, including users and settings" : "User access — reviews, posts, performance and audit"}
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> {access}
              </li>
            </ul>
            <AcceptInvite token={token} />
          </>
        ) : (
          <>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" /> Invite not available
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">This link was already used, cancelled or replaced by a newer invite. Ask an admin to send a new one.</p>
            <Link href="/dashboard" className="mt-5 inline-flex h-9 items-center rounded-lg border px-4 text-sm font-semibold hover:bg-muted">
              Go to the app
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
