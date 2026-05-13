import { NextResponse } from "next/server";
import { getApiSession } from "@/server/auth-guards";
import { createGoal, GoalError, listGoalsWithProgress } from "@/server/goals";
import { toJsonSafe } from "@/lib/json";

export async function GET(request: Request) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  const goals = await listGoalsWithProgress({ includeArchived });
  return NextResponse.json({ goals: toJsonSafe(goals) });
}

export async function POST(request: Request) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const created = await createGoal(session.user.id, body);
    return NextResponse.json({ goal: toJsonSafe(created) }, { status: 201 });
  } catch (err) {
    if (err instanceof GoalError) {
      const status = err.code === "ACCOUNT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
