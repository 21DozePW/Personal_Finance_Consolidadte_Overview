import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/server/auth-guards";
import { AllowedEmailError, revokeAllowedEmail } from "@/server/allowed-emails";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;

  const { id } = await ctx.params;
  try {
    await revokeAllowedEmail(session.user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof AllowedEmailError) {
      const status = err.code === "NOT_FOUND" ? 404 : err.code === "LAST_ADMIN" ? 409 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
