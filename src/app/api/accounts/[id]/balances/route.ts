import { NextResponse } from "next/server";
import { getApiSession } from "@/server/auth-guards";
import { BalanceError, listBalances, recordBalance } from "@/server/balances";
import { toJsonSafe } from "@/lib/json";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const balances = await listBalances(id);
  return NextResponse.json({ balances: toJsonSafe(balances) });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { id } = await ctx.params;
  try {
    const result = await recordBalance(session.user.id, id, body);
    return NextResponse.json({ balance: toJsonSafe(result) }, { status: 201 });
  } catch (err) {
    if (err instanceof BalanceError) {
      const status = err.code === "ACCOUNT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
