import { mockProvider } from "./mock";
import type { GbpProvider } from "./types";

export * from "./types";

/**
 * Returns the active data provider. Defaults to mock data so the app works
 * without Google credentials. Set GBP_DATA_SOURCE=google once the Google
 * provider is implemented (it will need the signed-in user's access token).
 */
export async function getProvider(): Promise<GbpProvider> {
  if (process.env.GBP_DATA_SOURCE === "google") {
    const { auth } = await import("@/auth");
    const { createGoogleProvider } = await import("./google");
    const session = await auth();
    if (!session?.accessToken) throw new Error("Not signed in with Google");
    return createGoogleProvider(session.accessToken);
  }
  return mockProvider;
}
