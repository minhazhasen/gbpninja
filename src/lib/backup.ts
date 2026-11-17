// Daily copy of the app database (workspaces, tokens, settings) next to it: <data dir>/backups/app-YYYY-MM-DD.db, newest 14 kept.
// Production only (src/instrumentation-node.ts). Uploaded media (<data dir>/media) isn't copied: back that folder up with the host.
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";

const KEEP = 14;

export async function backupDatabase(now = new Date()) {
  const file = db.file();
  if (!file) return null;
  const dir = path.join(path.dirname(file), "backups");
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, `app-${now.toISOString().slice(0, 10)}.db`);
  // One per day.
  if (await stat(target).then(() => true, () => false)) return null;
  const tmp = `${target}.tmp`;
  await rm(tmp, { force: true });
  db.backupTo(tmp);
  await rename(tmp, target);
  const old = (await readdir(dir)).filter((f) => /^app-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -KEEP);
  for (const f of old) await rm(path.join(dir, f), { force: true });
  return target;
}
