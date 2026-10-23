// Quick resource check for the shared host (CloudLinux counts every thread toward the account's process limit, shared with PHP):
// GET /api/health → { ok, release, dataSource, threads, memoryMB, uptimeMin }. Expect ~9 threads / ~200 MB with NODE_OPTIONS from
// DEPLOY.md. `release` is the deployed git commit (written by deploy/server.js), `dataSource` is GBP_DATA_SOURCE (google = live).
import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const read = (file: string) => {
  try {
    return readFileSync(file, "utf8").trim() || null;
  } catch {
    return null;
  }
};

export function GET() {
  let threads: number | null = null;
  try {
    threads = Number(readFileSync("/proc/self/status", "utf8").match(/^Threads:\s+(\d+)/m)?.[1] ?? NaN) || null;
  } catch {
    // Not Linux (local Mac): no /proc.
  }
  return Response.json({
    ok: true,
    release: read(path.join(process.cwd(), ".release")) ?? read(path.join(process.cwd(), "..", "release.txt")),
    dataSource: process.env.GBP_DATA_SOURCE === "google" ? "google" : "mock",
    threads,
    memoryMB: Math.round(process.memoryUsage().rss / 1048576),
    uptimeMin: Math.round(process.uptime() / 60),
  });
}
