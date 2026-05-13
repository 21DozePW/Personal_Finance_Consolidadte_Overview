import { NextResponse } from "next/server";
import { getApiSession } from "@/server/auth-guards";
import { GoalError, refreshGoalProgress } from "@/server/goals";
import { toJsonSafe } from "@/lib/json";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  try {
    const goal = await refreshGoalProgress(session.user.id, id);
    return NextResponse.json({ goal: toJsonSafe(goal) });
  } catch (err) {
    if (err instanceof GoalError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
