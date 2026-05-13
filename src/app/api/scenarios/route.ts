import { NextResponse } from "next/server";
import { getApiSession } from "@/server/auth-guards";
import { createScenario, listScenarios, ScenarioError } from "@/server/scenarios";
import { toJsonSafe } from "@/lib/json";

export async function GET() {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const scenarios = await listScenarios();
  return NextResponse.json({ scenarios: toJsonSafe(scenarios) });
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
    const created = await createScenario(session.user.id, body);
    return NextResponse.json({ scenario: toJsonSafe(created) }, { status: 201 });
  } catch (err) {
    if (err instanceof ScenarioError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    }
    throw err;
  }
}
