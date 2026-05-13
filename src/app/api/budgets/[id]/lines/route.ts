import { NextResponse } from "next/server";
import { getApiSession, requireApiAdmin } from "@/server/auth-guards";
import { BudgetError, copyBudgetMonth, listBudgetLines, upsertBudgetLine } from "@/server/budgets";
import { toJsonSafe } from "@/lib/json";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const month = new URL(request.url).searchParams.get("month") ?? undefined;
  const lines = await listBudgetLines(id, month ?? undefined);
  return NextResponse.json({ lines: toJsonSafe(lines) });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { id } = await ctx.params;
  const op = (body as { op?: string } | null)?.op;
  try {
    if (op === "copyMonth") {
      const copied = await copyBudgetMonth(session.user.id, id, body);
      return NextResponse.json({ copied });
    }
    const line = await upsertBudgetLine(session.user.id, id, body);
    return NextResponse.json({ line: toJsonSafe(line) }, { status: 201 });
  } catch (err) {
    if (err instanceof BudgetError) {
      const status = err.code === "NOT_FOUND" || err.code === "CATEGORY_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
