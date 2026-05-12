import { NextResponse } from "next/server";
import { getApiSession } from "@/server/auth-guards";
import {
  deleteTransaction,
  getTransaction,
  TransactionError,
  updateTransaction,
} from "@/server/transactions";
import { toJsonSafe } from "@/lib/json";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const t = await getTransaction(id);
  if (!t) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ transaction: toJsonSafe(t) });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
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
    const updated = await updateTransaction(session.user.id, id, body);
    return NextResponse.json({ transaction: toJsonSafe(updated) });
  } catch (err) {
    if (err instanceof TransactionError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  try {
    await deleteTransaction(session.user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof TransactionError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
