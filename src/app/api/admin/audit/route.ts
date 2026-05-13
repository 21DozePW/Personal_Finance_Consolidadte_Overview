import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/server/auth-guards";
import { listAuditLog } from "@/server/audit-log";
import { toJsonSafe } from "@/lib/json";

export async function GET(request: Request) {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;
  const url = new URL(request.url);
  const result = await listAuditLog({
    actorUserId: url.searchParams.get("actorUserId") ?? undefined,
    entityType: url.searchParams.get("entityType") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    fromIso: url.searchParams.get("from") ?? undefined,
    toIso: url.searchParams.get("to") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  });
  return NextResponse.json(toJsonSafe(result));
}
