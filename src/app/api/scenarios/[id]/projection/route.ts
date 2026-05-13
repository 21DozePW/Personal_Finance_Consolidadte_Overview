import { NextResponse } from "next/server";
import { getApiSession } from "@/server/auth-guards";
import { getScenarioProjection, ScenarioError } from "@/server/scenarios";
import { toJsonSafe } from "@/lib/json";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  try {
    const projection = await getScenarioProjection(id);
    return NextResponse.json({ projection: toJsonSafe(projection) });
  } catch (err) {
    if (err instanceof ScenarioError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
