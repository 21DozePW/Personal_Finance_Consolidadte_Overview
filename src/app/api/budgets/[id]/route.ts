import { NextResponse } from "next/server";
import { getApiSession, requireApiAdmin } from "@/server/auth-guards";
import {
  BudgetError,
  deleteBudget,
  getBudget,
  getBudgetSummary,
  updateBudget,
} from "@/server/budgets";
import { toJsonSafe } from "@/lib/json";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const budget = await getBudget(id);
  if (!budget) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const includeSummary = new URL(request.url).searchParams.get("summary") === "true";
  if (includeSummary) {
    try {
      const summary = await getBudgetSummary(id);
      return NextResponse.json({ budget: toJsonSafe(budget), summary: toJsonSafe(summary) });
    } catch (err) {
      if (err instanceof BudgetError) {
        return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
      }
      throw err;
    }
  }
  return NextResponse.json({ budget: toJsonSafe(budget) });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { id } = await ctx.params;
  try {
    const updated = await updateBudget(session.user.id, id, body);
    return NextResponse.json({ budget: toJsonSafe(updated) });
  } catch (err) {
    if (err instanceof BudgetError) {
      const status =
        err.code === "NOT_FOUND" ? 404 : err.code === "UNSUPPORTED_CURRENCY" ? 422 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  try {
    await deleteBudget(session.user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof BudgetError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
