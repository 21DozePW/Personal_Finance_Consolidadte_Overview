import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/server/auth-guards";
import { BudgetError, deleteBudgetLine } from "@/server/budgets";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; lineId: string }> },
) {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;
  const { lineId } = await ctx.params;
  try {
    await deleteBudgetLine(session.user.id, lineId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof BudgetError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
