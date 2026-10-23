// JSON documents in SQLite (AppState table): the workspace's own data survives restarts. Maps and Sets round-trip.
// Used in live mode (GBP_DATA_SOURCE=google) for the provider's workspace state and the platform admin store.
import { db } from "@/lib/db";

const replacer = (_: string, v: unknown) => (v instanceof Map ? { __map: [...v] } : v instanceof Set ? { __set: [...v] } : v);
const reviver = (_: string, v: unknown) => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as { __map?: [unknown, unknown][]; __set?: unknown[] };
    if (o.__map) return new Map(o.__map);
    if (o.__set) return new Set(o.__set);
  }
  return v;
};

/** The stored document, or null when there is none (or the database isn't set up yet). */
export function loadDoc<T>(key: string): T | null {
  try {
    const raw = db.getState(key);
    return raw == null ? null : (JSON.parse(raw, reviver) as T);
  } catch (e) {
    console.error(`[persist] Could not load ${key}:`, e);
    return null;
  }
}

const last = new Map<string, string>();
/** Save when the document changed since the last save (cheap to call after every provider call). */
export function saveDoc(key: string, value: unknown) {
  const json = JSON.stringify(value, replacer);
  if (last.get(key) === json) return;
  try {
    db.setState(key, json);
    last.set(key, json);
  } catch (e) {
    console.error(`[persist] Could not save ${key}:`, e);
  }
}
