import { NextResponse } from "next/server";
import { getApiSession } from "@/server/auth-guards";
import { createRecurring, listRecurring, RecurringError } from "@/server/recurring";
import { toJsonSafe } from "@/lib/json";

export async function GET() {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const items = await listRecurring();
  return NextResponse.json({ commitments: toJsonSafe(items) });
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
    const created = await createRecurring(session.user.id, body);
    return NextResponse.json({ commitment: toJsonSafe(created) }, { status: 201 });
  } catch (err) {
    if (err instanceof RecurringError) {
      const status = err.code === "ACCOUNT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
