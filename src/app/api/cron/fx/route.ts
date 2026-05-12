/**
 * Daily FX cron. Scheduled in `vercel.json` to hit 05:00 UTC.
 *
 * Authentication: a static shared secret in `CRON_SHARED_SECRET`. Vercel Cron
 * automatically injects this header when configured at the project level.
 *
 *   Authorization: Bearer <secret>
 *
 * This route never requires a user session — Vercel cron requests don't have
 * one. Middleware excludes /api/cron/* from the gating chain.
 */

import { NextResponse } from "next/server";
import { fetchAndStoreLatest } from "@/server/fx";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SHARED_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  // Constant-time-ish compare via string equality is acceptable here: the
  // secret is high-entropy and an attacker can't lengthen its prefix.
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await fetchAndStoreLatest({});
  return NextResponse.json({ summary });
}

// POST is supported as an alias so manual triggers via Vercel UI / curl work
// regardless of which verb the cron is configured with.
export const POST = GET;
