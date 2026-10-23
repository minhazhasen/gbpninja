import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProvider } from "@/lib/gbp";
import { googleOAuthConfigured } from "@/lib/google/oauth";
import { ConnectGoogle } from "@/components/welcome/connect-google";

export const metadata: Metadata = { title: "Welcome" };

// First run (live mode): no Business Profile connected yet. Pages that need a location send people here (resolveLocation).
export default async function WelcomePage() {
  const provider = await getProvider();
  const [locations, connections] = await Promise.all([provider.listLocations(), provider.listConnections()]);
  if (locations.length) redirect("/dashboard");
  const google = connections.find((c) => c.channel === "google");
  return <ConnectGoogle state={google?.status === "needs_selection" ? "pick" : "connect"} account={google?.account ?? null} configured={googleOAuthConfigured()} />;
}
