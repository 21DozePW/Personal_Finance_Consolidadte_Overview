import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/server/auth-guards";
import { FxError, setManualRate } from "@/server/fx";
import { toJsonSafe } from "@/lib/json";

export async function POST(request: Request) {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { quoteCurrency, rate, asOfDate } = (body ?? {}) as {
    quoteCurrency?: unknown;
    rate?: unknown;
    asOfDate?: unknown;
  };

  if (typeof quoteCurrency !== "string" || typeof asOfDate !== "string") {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const rateNum = typeof rate === "string" ? Number(rate) : typeof rate === "number" ? rate : NaN;

  try {
    const result = await setManualRate(session.user.id, {
      quoteCurrency: quoteCurrency.toUpperCase(),
      rate: rateNum,
      asOfDate,
    });
    return NextResponse.json({ rate: toJsonSafe(result) }, { status: 201 });
  } catch (err) {
    if (err instanceof FxError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    }
    throw err;
  }
}
