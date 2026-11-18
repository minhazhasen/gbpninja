// When each scheduled job last ran (cron calls, backups), for Admin → Integrations. Kept in the AppState table so it survives
// restarts; in memory too, so reading it costs nothing. Server-only.
import { loadDoc, saveDoc } from "@/lib/gbp/persist";

export type JobName = "cron:publish-posts" | "cron:refresh-competitors" | "backup";
export interface JobRun {
  at: string;
  ok: boolean;
  /** Short result ("3 posts published", "Saved app-2026-11-18.db") or the error. */
  note?: string | null;
}

const KEY = "jobRuns";
const g = globalThis as unknown as { __gbpnJobRuns?: Partial<Record<JobName, JobRun>> };
const runs = () => (g.__gbpnJobRuns ??= loadDoc<Partial<Record<JobName, JobRun>>>(KEY) ?? {});

export function recordJobRun(name: JobName, ok: boolean, note?: string | null) {
  runs()[name] = { at: new Date().toISOString(), ok, note: note ?? null };
  saveDoc(KEY, runs());
}

export const lastJobRun = (name: JobName): JobRun | null => runs()[name] ?? null;
