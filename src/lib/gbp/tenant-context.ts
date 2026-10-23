// The workspace a piece of server work belongs to. Every provider call runs inside `runInTenant` (see gbp/index.ts), so the
// workspace state (mock.ts) and the Google tokens (google/oauth.ts) resolve to that workspace only — even when requests from
// different customers interleave on the same server. Kept dependency-free so mock.ts and oauth.ts can import it.
import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantCtx {
  /** Workspace id ("w_…"). */
  id: string;
  /** That workspace's state object (MockState). */
  state: object;
}

// One storage per process, also across dev hot reloads.
const g = globalThis as unknown as { __gbpnTenantAls?: AsyncLocalStorage<TenantCtx> };
const als = (g.__gbpnTenantAls ??= new AsyncLocalStorage<TenantCtx>());

export const currentTenant = (): TenantCtx | null => als.getStore() ?? null;
export const runInTenant = <T>(t: TenantCtx, fn: () => T): T => als.run(t, fn);
