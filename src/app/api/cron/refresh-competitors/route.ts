// Daily competitor check: call once a day (e.g. Vercel Cron / any scheduler) with "Authorization: Bearer $CRON_SECRET".
// Re-reads every added competitor's Google Maps profile (rating + review count) — see src/lib/competitor-refresh.ts.
import { NextResponse } from "next/server";
import { refreshCompetitors } from "@/lib/competitor-refresh";

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
  return NextResponse.json(await refreshCompetitors());
}

export const POST = GET;
