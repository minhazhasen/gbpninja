// Quick resource check for the shared host (CloudLinux counts every thread toward the account's process limit, shared with PHP):
// GET /api/health → { ok, threads, memoryMB, uptimeMin }. Expect ~9 threads / ~200 MB with NODE_OPTIONS from DEPLOY.md.
import { readFileSync } from "node:fs";

export const dynamic = "force-dynamic";

export function GET() {
  let threads: number | null = null;
  try {
    threads = Number(readFileSync("/proc/self/status", "utf8").match(/^Threads:\s+(\d+)/m)?.[1] ?? NaN) || null;
  } catch {
    // Not Linux (local Mac): no /proc.
  }
  return Response.json({ ok: true, threads, memoryMB: Math.round(process.memoryUsage().rss / 1048576), uptimeMin: Math.round(process.uptime() / 60) });
}
