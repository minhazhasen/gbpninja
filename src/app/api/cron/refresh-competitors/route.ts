// Daily competitor check: call once a day (e.g. Vercel Cron / any scheduler) with "Authorization: Bearer $CRON_SECRET".
// Re-reads every added competitor's Google Maps profile (rating + review count) — see src/lib/competitor-refresh.ts.
import { NextResponse } from "next/server";
import { refreshCompetitors } from "@/lib/competitor-refresh";
import { forEachWorkspace } from "@/lib/gbp/tenancy";
import { recordJobRun } from "@/lib/job-runs";

export const dynamic = "force-dynamic";
// Checks run one at a time with pauses: give the run time to finish.
export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  // No secret configured: allowed only outside production (local testing).
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // No one is signed in here: check every workspace's competitors, each inside its own workspace.
  const results: Record<string, Awaited<ReturnType<typeof refreshCompetitors>>> = {};
  try {
    await forEachWorkspace(async (t) => {
      results[t.id] = await refreshCompetitors();
    });
  } catch (e) {
    recordJobRun("cron:refresh-competitors", false, e instanceof Error ? e.message : "Failed");
    throw e;
  }
  const checked = Object.values(results).reduce((s, r) => s + (r.checked ?? 0), 0);
  recordJobRun("cron:refresh-competitors", true, `${checked} competitor${checked === 1 ? "" : "s"} checked`);
  return NextResponse.json(results);
}

export const POST = GET;
