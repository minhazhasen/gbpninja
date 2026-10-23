// Read a business's public profile from its Google Maps link, without an API key (server-side only).
// How: the Maps page preloads its place data from /maps/preview/place?…pb=… (a ")]}'"-prefixed JSON array); links without a place
// reference fall back to the Maps search feed (/search?tbm=map&q=…). Both use the same place layout (see `fromPlace`).
// Unofficial: Google's terms don't allow scraping and the format can change without notice — callers must handle `null`
// (the form then stays manual). Keep it to occasional, user-triggered lookups.
import { distanceKm, parseMapsLink } from "./maps-link";

export interface ScrapedPlace {
  name: string;
  address: string;
  primaryCategory: string | null;
  additionalCategories: string[];
  rating: number | null;
  reviewCount: number;
  websiteUri: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  /** Google's numeric place id (from the "0x…:0x…" feature id). */
  cid: string | null;
  placeId: string | null;
  /** The resolved full Maps link. */
  mapsUrl: string;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT = 8000;

/** Fetch with browser-like headers, carrying cookies between requests like a browser session. */
function session() {
  const jar = new Map<string, string>();
  return async (url: string) => {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    return { url: res.url, ok: res.ok, text: await res.text() };
  };
}

/** Google's JSON feeds start with ")]}'" to stop them being run as scripts. */
function parseFeed(text: string): unknown {
  const body = text.startsWith(")]}'") ? text.slice(text.indexOf("\n") + 1) : text;
  try {
    return JSON.parse(body.slice(0, body.lastIndexOf("]") + 1));
  } catch {
    return null;
  }
}

const at = (o: unknown, ...path: number[]): unknown => path.reduce<unknown>((v, i) => (Array.isArray(v) ? v[i] : undefined), o);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** One place in Maps' array layout → our fields. */
function fromPlace(p: unknown, mapsUrl: string): ScrapedPlace | null {
  const name = str(at(p, 11));
  if (!name) return null;
  const cats = (Array.isArray(at(p, 13)) ? (at(p, 13) as unknown[]) : []).map(str).filter((c): c is string => !!c);
  const full = str(at(p, 18));
  const ftid = str(at(p, 10));
  const hex = ftid?.split(":")[1];
  let cid: string | null = null;
  try {
    cid = hex ? BigInt(hex).toString() : null;
  } catch {}
  const rating = num(at(p, 4, 7));
  return {
    name,
    address: str(at(p, 39)) ?? (full?.startsWith(`${name}, `) ? full.slice(name.length + 2) : (full ?? "")),
    primaryCategory: cats[0] ?? null,
    additionalCategories: cats.slice(1),
    rating: rating != null && rating >= 1 && rating <= 5 ? Math.round(rating * 10) / 10 : null,
    reviewCount: num(at(p, 4, 8)) ?? 0,
    websiteUri: str(at(p, 7, 0)),
    phone: str(at(p, 178, 0, 0)),
    lat: num(at(p, 9, 2)),
    lng: num(at(p, 9, 3)),
    cid,
    placeId: str(at(p, 78)),
    mapsUrl,
  };
}

/** Maps search feed: places matching a text query (first result first). */
async function searchFeed(get: ReturnType<typeof session>, query: string, mapsUrl: string, retry = true): Promise<ScrapedPlace[]> {
  const res = await get(`https://www.google.com/search?tbm=map&hl=en&gl=us&q=${encodeURIComponent(query)}`);
  const results = at(parseFeed(res.text), 0, 1);
  if (!Array.isArray(results)) return [];
  const places = results.map((r) => fromPlace(at(r, 14), mapsUrl)).filter((x): x is ScrapedPlace => !!x);
  // A misspelled name gets "Did you mean …" instead of places: search again with Google's spelling.
  const suggestion = str(at(results, 0, 13, 1))
    ?.replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  if (!places.length && retry && suggestion && suggestion.toLowerCase() !== query.toLowerCase()) return searchFeed(get, suggestion, mapsUrl, false);
  return places;
}

/** Read the place a Google Maps link points to. null when Google gives nothing usable (the form stays manual). */
export async function scrapeMapsLink(link: string): Promise<ScrapedPlace | null> {
  const get = session();
  try {
    // Short links (maps.app.goo.gl) redirect to the full link.
    const first = await get(link.trim());
    const info = parseMapsLink(first.url);
    let page = first;
    // Links that only carry an id (?cid=, ?vet=…&ftid=): the cid page preloads that exact place.
    if (info.cid && !/[?&]cid=/.test(first.url)) page = await get(`https://www.google.com/maps?cid=${info.cid}&hl=en`);
    const href = page.text.match(/href="(\/maps\/preview\/place\?[^"]+)"/)?.[1];
    if (href) {
      const url = `https://www.google.com${href
        .replace(/&amp;/g, "&")
        .replace(/([?&])hl=[^&]*/, "$1hl=en")
        .replace(/([?&])gl=[^&]*/, "$1gl=us")}`;
      const place = fromPlace(at(parseFeed((await get(url)).text), 6), info.url);
      if (place && (!info.cid || !place.cid || place.cid === info.cid)) return place;
    }
    // Name-only links (/maps/search/…, ?q=…): search, preferring the result with the link's place id.
    if (info.name) {
      const near = info.lat != null && info.lng != null ? ` near ${info.lat},${info.lng}` : "";
      const results = await searchFeed(get, `${info.name}${near}`, info.url);
      return results.find((r) => info.cid && r.cid === info.cid) ?? results[0] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Coordinates of a business by name + address (for distances), via the search feed. Cached per process. */
const coordCache = new Map<string, { lat: number; lng: number } | null>();
export async function lookupCoords(query: string): Promise<{ lat: number; lng: number } | null> {
  if (coordCache.has(query)) return coordCache.get(query)!;
  let out: { lat: number; lng: number } | null = null;
  try {
    const [first] = await searchFeed(session(), query, "");
    if (first?.lat != null && first.lng != null) out = { lat: first.lat, lng: first.lng };
  } catch {}
  coordCache.set(query, out);
  return out;
}

export { distanceKm };
