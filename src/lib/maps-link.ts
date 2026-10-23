// Read what a Google Maps link carries: the business name, coordinates and Google's place reference.
// No API key: Maps pages are built by JavaScript, so a business's rating and reviews can't be read from them —
// those are typed in when adding a competitor. Short links (maps.app.goo.gl) are followed server-side to the full link.

export interface MapsLinkInfo {
  /** The full link (after following a short link). */
  url: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  /** Google's numeric place id (cid), when the link has one (`cid=`, or the 2nd half of `ftid=0x…:0x…`). */
  cid: string | null;
}

const SHORT_HOSTS = ["maps.app.goo.gl", "goo.gl", "g.co"];

export const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());
export const isMapsUrl = (s: string) => /^https?:\/\/([a-z0-9-]+\.)*(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(s.trim());

const decode = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " ")).trim();
  } catch {
    return s.replace(/\+/g, " ").trim();
  }
};
const coord = (s: string | null | undefined) => (s != null && s !== "" && Number.isFinite(Number(s)) ? Number(s) : null);

/** Parse a full Google Maps link (no network). */
export function parseMapsLink(raw: string): MapsLinkInfo {
  const url = raw.trim();
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { url, name: null, lat: null, lng: null, cid: null };
  }
  const path = u.pathname;
  const q = u.searchParams;

  // Name: /maps/place/Name/…, /maps/search/Name/…, or ?q= / ?query= (unless it's just coordinates or a place id).
  let name = path.match(/\/maps\/(?:place|search)\/([^/@]+)/)?.[1] ?? null;
  const qp = q.get("q") ?? q.get("query");
  if (!name && qp && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(qp) && !/^place_id:/i.test(qp)) name = qp;
  name = name ? decode(name) : null;
  // "Name, 120 Main St, Austin" → keep the business name part.
  if (name && /^[^,]+,\s*\d/.test(name)) name = name.split(",")[0].trim();

  // Coordinates: the place pin (!3d…!4d…) is more exact than the map view (@lat,lng,zoom).
  const pin = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const view = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const ll = q.get("ll")?.split(",");
  const lat = coord(pin?.[1] ?? view?.[1] ?? ll?.[0]);
  const lng = coord(pin?.[2] ?? view?.[2] ?? ll?.[1]);

  // cid: ?cid=123…, or ftid / data "0x…:0xHEX" where HEX is the cid.
  let cid = q.get("cid");
  const ftid = q.get("ftid") ?? url.match(/0x[0-9a-f]+:(0x[0-9a-f]+)/i)?.[0] ?? null;
  const hex = ftid?.split(":")[1];
  if (!cid && hex) {
    try {
      cid = BigInt(hex).toString();
    } catch {
      cid = null;
    }
  }
  return { url, name: name || null, lat, lng, cid: cid || null };
}

/** Follow a short Maps link (maps.app.goo.gl/…) to the full link, then parse it. Server-side only. */
export async function resolveMapsLink(raw: string): Promise<MapsLinkInfo> {
  let url = raw.trim();
  for (let hop = 0; hop < 4; hop++) {
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      break;
    }
    if (!SHORT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) break;
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) }).catch(() => null);
    const next = res?.headers.get("location");
    if (!next) break;
    url = new URL(next, url).toString();
  }
  return parseMapsLink(url);
}

/** Straight-line distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
