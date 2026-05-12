import { NextResponse } from "next/server";
import { getApiSession } from "@/server/auth-guards";
import { deleteRecurring, getRecurring, RecurringError, updateRecurring } from "@/server/recurring";
import { toJsonSafe } from "@/lib/json";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const row = await getRecurring(id);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ commitment: toJsonSafe(row) });
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
    const updated = await updateRecurring(session.user.id, id, body);
    return NextResponse.json({ commitment: toJsonSafe(updated) });
  } catch (err) {
    if (err instanceof RecurringError) {
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
    await deleteRecurring(session.user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof RecurringError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
