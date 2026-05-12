import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/server/auth-guards";
import { AllowedEmailError, inviteAllowedEmail, listAllowedEmails } from "@/server/allowed-emails";

export async function GET() {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;
  const entries = await listAllowedEmails();
  return NextResponse.json({ entries });
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
    const created = await inviteAllowedEmail(session.user.id, body);
    return NextResponse.json({ entry: created }, { status: 201 });
  } catch (err) {
    if (err instanceof AllowedEmailError) {
      const status = err.code === "ALREADY_EXISTS" ? 409 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
