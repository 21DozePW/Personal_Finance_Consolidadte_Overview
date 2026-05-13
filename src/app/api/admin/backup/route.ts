import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/server/auth-guards";
import { buildBackup } from "@/server/backup";
import { callerIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;

  const rl = rateLimit(`backup:${session.user.id}`, RATE_LIMITS.backup);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Try again in a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  let body: { passphrase?: string };
  try {
    body = (await request.json()) as { passphrase?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.passphrase || body.passphrase.length < 12) {
    return NextResponse.json(
      { error: "weak_passphrase", message: "Passphrase must be at least 12 characters." },
      { status: 400 },
    );
  }

  // Tie rate-limit context to the IP too, just in case.
  rateLimit(`backup-ip:${callerIp(request)}`, RATE_LIMITS.backup);

  const envelope = await buildBackup(session.user.id, body.passphrase);
  const fileName = `household-finance-${new Date().toISOString().replace(/[:.]/g, "-")}.json.enc`;
  return new NextResponse(JSON.stringify(envelope, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
