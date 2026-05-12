import { NextResponse } from "next/server";
import { getApiSession, requireApiAdmin } from "@/server/auth-guards";
import { AccountError, createAccount, listAccounts } from "@/server/accounts";
import { toJsonSafe } from "@/lib/json";

export async function GET(request: Request) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;

  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
  const accounts = await listAccounts({ includeInactive });
  // Strip decrypted secrets from the API surface; consumers who want them
  // should call GET /api/accounts/:id which serves the decrypted view to
  // authenticated users.
  const safe = accounts.map(({ notes: _notes, lastFour: _lastFour, ...rest }) => rest);
  return NextResponse.json({ accounts: toJsonSafe(safe) });
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
    const created = await createAccount(session.user.id, body);
    return NextResponse.json({ account: toJsonSafe(created) }, { status: 201 });
  } catch (err) {
    if (err instanceof AccountError) {
      const status = err.code === "INSTITUTION_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
