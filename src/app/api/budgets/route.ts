import { NextResponse } from "next/server";
import { getApiSession, requireApiAdmin } from "@/server/auth-guards";
import { BudgetError, createBudget, listBudgets } from "@/server/budgets";
import { toJsonSafe } from "@/lib/json";

export async function GET() {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const budgets = await listBudgets();
  return NextResponse.json({ budgets: toJsonSafe(budgets) });
}

export async function POST(request: Request) {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const created = await createBudget(session.user.id, body);
    return NextResponse.json({ budget: toJsonSafe(created) }, { status: 201 });
  } catch (err) {
    if (err instanceof BudgetError) {
      const status = err.code === "UNSUPPORTED_CURRENCY" ? 422 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
