import { NextResponse } from "next/server";
import { getApiSession } from "@/server/auth-guards";
import { commitImportBatch, ImportError } from "@/server/imports";
import { toJsonSafe } from "@/lib/json";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  try {
    const batch = await commitImportBatch(session.user.id, id);
    return NextResponse.json({ batch: toJsonSafe(batch) });
  } catch (err) {
    if (err instanceof ImportError) {
      const status = err.code === "NOT_FOUND" ? 404 : err.code === "BAD_STATE" ? 409 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
