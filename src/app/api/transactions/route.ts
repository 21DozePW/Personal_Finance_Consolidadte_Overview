import { NextResponse } from "next/server";
import { getApiSession } from "@/server/auth-guards";
import {
  createSingleTransaction,
  createSplitTransaction,
  createTransfer,
  listTransactions,
  TransactionError,
} from "@/server/transactions";
import { toJsonSafe } from "@/lib/json";

export async function GET(request: Request) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const url = new URL(request.url);
  const filters = Object.fromEntries(url.searchParams.entries());
  try {
    const result = await listTransactions(filters);
    return NextResponse.json(toJsonSafe(result));
  } catch (err) {
    if (err instanceof TransactionError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    }
    throw err;
  }
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
  const op = (body as { op?: string } | null)?.op ?? "single";
  try {
    if (op === "transfer") {
      const out = await createTransfer(session.user.id, body);
      return NextResponse.json({ transfer: toJsonSafe(out) }, { status: 201 });
    }
    if (op === "split") {
      const out = await createSplitTransaction(session.user.id, body);
      return NextResponse.json({ split: toJsonSafe(out) }, { status: 201 });
    }
    const out = await createSingleTransaction(session.user.id, body);
    return NextResponse.json({ transaction: toJsonSafe(out) }, { status: 201 });
  } catch (err) {
    if (err instanceof TransactionError) {
      const status =
        err.code === "ACCOUNT_NOT_FOUND" || err.code === "CATEGORY_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
