import { NextResponse } from "next/server";
import { getApiSession, requireApiAdmin } from "@/server/auth-guards";
import { CategoryError, createCategory, listCategories } from "@/server/categories";
import { toJsonSafe } from "@/lib/json";

export async function GET(request: Request) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  const categories = await listCategories({ includeArchived });
  return NextResponse.json({ categories: toJsonSafe(categories) });
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
    const created = await createCategory(session.user.id, body);
    return NextResponse.json({ category: toJsonSafe(created) }, { status: 201 });
  } catch (err) {
    if (err instanceof CategoryError) {
      const status = err.code === "PARENT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
