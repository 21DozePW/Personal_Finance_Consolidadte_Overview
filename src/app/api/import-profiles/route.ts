import { NextResponse } from "next/server";
import { getApiSession, requireApiAdmin } from "@/server/auth-guards";
import {
  createImportProfile,
  ImportProfileError,
  listImportProfiles,
} from "@/server/import-profiles";
import { toJsonSafe } from "@/lib/json";

export async function GET(request: Request) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const institutionId = new URL(request.url).searchParams.get("institutionId") ?? undefined;
  const profiles = await listImportProfiles(institutionId);
  return NextResponse.json({ profiles: toJsonSafe(profiles) });
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
    const created = await createImportProfile(session.user.id, body);
    return NextResponse.json({ profile: toJsonSafe(created) }, { status: 201 });
  } catch (err) {
    if (err instanceof ImportProfileError) {
      const status = err.code === "ALREADY_EXISTS" ? 409 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
