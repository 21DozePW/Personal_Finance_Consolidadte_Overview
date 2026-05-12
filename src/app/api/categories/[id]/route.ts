import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/server/auth-guards";
import { CategoryError, deleteCategory, getCategory, updateCategory } from "@/server/categories";
import { toJsonSafe } from "@/lib/json";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const c = await getCategory(id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ category: toJsonSafe(c) });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { id } = await ctx.params;
  try {
    const updated = await updateCategory(session.user.id, id, body);
    return NextResponse.json({ category: toJsonSafe(updated) });
  } catch (err) {
    if (err instanceof CategoryError) {
      const status = err.code === "NOT_FOUND" ? 404 : err.code === "PARENT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  try {
    await deleteCategory(session.user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof CategoryError) {
      const status =
        err.code === "NOT_FOUND"
          ? 404
          : err.code === "IN_USE" || err.code === "HAS_CHILDREN"
            ? 409
            : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
