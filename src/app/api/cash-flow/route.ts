import { NextResponse } from "next/server";
import { getApiSession } from "@/server/auth-guards";
import { listProjectable } from "@/server/recurring";
import { getLatestRateLookup } from "@/server/fx";
import { projectCashFlow } from "@/lib/cash-flow";
import { toJsonSafe } from "@/lib/json";

export async function GET(request: Request) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const months = Math.min(
    36,
    Math.max(1, Number(new URL(request.url).searchParams.get("months") ?? "12")),
  );

  const commitments = await listProjectable();
  const currencies = Array.from(new Set(commitments.map((c) => c.currency)));
  const lookup = await getLatestRateLookup(currencies);
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const result = projectCashFlow(commitments, { from, months, rateLookup: lookup });
  return NextResponse.json(toJsonSafe(result));
}
