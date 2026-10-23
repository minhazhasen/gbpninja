// Google Business Profile accounts + locations for the connected Google account (business.manage scope).
// APIs: My Business Account Management v1 (accounts) and Business Information v1 (locations). Both need the Cloud project's
// GBP API access approved — until then Google answers with quota 0 (429 / RESOURCE_EXHAUSTED), explained in `gbpErrorMessage`.
import type { ConnectionOption } from "@/lib/gbp/types";
import { GoogleApiError, googleFetch } from "./oauth";

interface GbpAccount {
  name: string;
  accountName?: string;
  type?: string;
}
interface GbpLocation {
  name: string;
  title?: string;
  storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string };
}

/** Every location the connected account can manage, as picker options (id = "accounts/…/locations/…"). */
export async function listGbpLocations(): Promise<ConnectionOption[]> {
  try {
    const accounts: GbpAccount[] = [];
    let page = "";
    do {
      const r = await googleFetch<{ accounts?: GbpAccount[]; nextPageToken?: string }>(
        "gbp",
        `https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20${page && `&pageToken=${page}`}`,
      );
      accounts.push(...(r.accounts ?? []));
      page = r.nextPageToken ?? "";
    } while (page);

    const out: ConnectionOption[] = [];
    for (const a of accounts) {
      let lp = "";
      do {
        const r = await googleFetch<{ locations?: GbpLocation[]; nextPageToken?: string }>(
          "gbp",
          `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title,storefrontAddress&pageSize=100${lp && `&pageToken=${lp}`}`,
        );
        for (const l of r.locations ?? []) {
          const addr = l.storefrontAddress;
          const where = [addr?.addressLines?.[0], addr?.locality, addr?.administrativeArea].filter(Boolean).join(", ");
          out.push({ id: `${a.name}/${l.name}`, name: l.title ?? l.name, sub: [where || "Service area business", a.accountName].filter(Boolean).join(" · ") });
        }
        lp = r.nextPageToken ?? "";
      } while (lp);
    }
    return out;
  } catch (e) {
    throw new Error(gbpErrorMessage(e));
  }
}

/** Plain words for the errors people actually hit while setting up the GBP API. */
export function gbpErrorMessage(e: unknown) {
  if (!(e instanceof GoogleApiError)) return e instanceof Error ? e.message : "Couldn't reach Google Business Profile";
  if (e.code === 429 || e.status === "RESOURCE_EXHAUSTED")
    return "Google hasn't approved Business Profile API access for this Cloud project yet (quota is 0). Request access in Google's GBP API form, then try again.";
  if (e.code === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(e.message))
    return "Turn on the “My Business Account Management API” and “My Business Business Information API” in your Google Cloud project, then try again.";
  if (e.code === 403) return "This Google account can't manage Business Profiles, or access was not granted.";
  if (e.code === 401) return "Google access expired. Disconnect and connect again.";
  return e.message;
}
