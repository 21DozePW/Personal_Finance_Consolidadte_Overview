import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/server/auth-guards";
import { fetchAndStoreLatest } from "@/server/fx";
import { recordAudit } from "@/lib/audit";

export async function POST() {
  const session = await requireApiAdmin();
  if (session instanceof NextResponse) return session;
  const summary = await fetchAndStoreLatest({});
  await recordAudit({
    actorUserId: session.user.id,
    action: "FX_REFRESH_TRIGGERED",
    entityType: "FxRateFetchLog",
    entityId: summary.logId,
    after: {
      status: summary.status,
      fetched: summary.fetched,
      missing: summary.missing,
    },
  });
  return NextResponse.json({ summary });
}
