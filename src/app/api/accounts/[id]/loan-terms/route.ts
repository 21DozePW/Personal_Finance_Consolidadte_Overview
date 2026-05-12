import { NextResponse } from "next/server";
import { getApiSession, requireApiAdmin } from "@/server/auth-guards";
import {
  createLoanTerms,
  deleteLoanTerms,
  getLoanTermsByAccount,
  LoanTermsError,
  updateLoanTerms,
} from "@/server/loan-terms";
import { toJsonSafe } from "@/lib/json";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const terms = await getLoanTermsByAccount(id);
  if (!terms) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ loanTerms: toJsonSafe(terms) });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
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
    const created = await createLoanTerms(session.user.id, id, body);
    return NextResponse.json({ loanTerms: toJsonSafe(created) }, { status: 201 });
  } catch (err) {
    if (err instanceof LoanTermsError) {
      const status =
        err.code === "ACCOUNT_NOT_FOUND" ? 404 : err.code === "ALREADY_EXISTS" ? 409 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
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
    const updated = await updateLoanTerms(session.user.id, id, body);
    return NextResponse.json({ loanTerms: toJsonSafe(updated) });
  } catch (err) {
    if (err instanceof LoanTermsError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400;
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
    await deleteLoanTerms(session.user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof LoanTermsError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
