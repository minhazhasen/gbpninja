import { mockProvider } from "./mock";
import { resolveTenant, saveTenant } from "./tenancy";
import { currentTenant, runInTenant, type TenantCtx } from "./tenant-context";
import type { GbpProvider } from "./types";

export * from "./types";

let liveProvider: GbpProvider | null = null;

/**
 * The data provider for the person making this request, bound to their workspace: every method runs inside that workspace
 * (tenant-context.ts) and the workspace is saved afterwards. Nobody can read or change another workspace's data through it.
 * Demo (default, GBP_DATA_SOURCE=mock): sample data in memory — one shared copy without sign-in, one copy per signed-in user.
 * Live (GBP_DATA_SOURCE=google): real Google Business Profile data for the workspace's own Google connection — see live.ts.
 */
export async function getProvider(): Promise<GbpProvider> {
  const impl = process.env.GBP_DATA_SOURCE === "google" ? (liveProvider ??= (await import("./live")).createLiveProvider()) : mockProvider;
  // Already inside a workspace (a provider method calling getProvider, a scheduled job): keep it.
  const tenant = currentTenant() ?? (await resolveTenant());
  return tenant ? bind(impl, tenant) : impl;
}

function bind(impl: GbpProvider, t: TenantCtx): GbpProvider {
  return new Proxy(impl, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== "function") return v;
      return (...args: unknown[]) =>
        runInTenant(t, async () => {
          try {
            return await (v as (...a: unknown[]) => unknown).apply(target, args);
          } finally {
            saveTenant(t);
          }
        });
    },
  });
}
