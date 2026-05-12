import { NextResponse } from "next/server";
import { getApiSession } from "@/server/auth-guards";
import { getLoanTermsByAccount, scheduleForLoan } from "@/server/loan-terms";
import { toJsonSafe } from "@/lib/json";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const terms = await getLoanTermsByAccount(id);
  if (!terms) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const rows = scheduleForLoan(terms);
  return NextResponse.json({ schedule: toJsonSafe(rows) });
}
