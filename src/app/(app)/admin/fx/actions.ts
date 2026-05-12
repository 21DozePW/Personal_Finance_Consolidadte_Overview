"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth-guards";
import { fetchAndStoreLatest, FxError, setManualRate } from "@/server/fx";
import { recordAudit } from "@/lib/audit";
import type { FxFetchStatus } from "@prisma/client";

export type FxActionResult =
  | { ok: true; summary?: { status: FxFetchStatus; fetched: string[]; missing: string[] } }
  | { ok: false; error: string };

export async function refreshFxAction(): Promise<FxActionResult> {
  const session = await requireAdmin();
  const summary = await fetchAndStoreLatest({});
  await recordAudit({
    actorUserId: session.user.id,
    action: "FX_REFRESH_TRIGGERED",
    entityType: "FxRateFetchLog",
    entityId: summary.logId,
    after: { status: summary.status, fetched: summary.fetched, missing: summary.missing },
  });
  revalidatePath("/admin/fx");
  revalidatePath("/accounts");
  return {
    ok: true,
    summary: { status: summary.status, fetched: summary.fetched, missing: summary.missing },
  };
}

export async function overrideFxAction(form: FormData): Promise<FxActionResult> {
  const session = await requireAdmin();
  const quoteCurrency = String(form.get("quoteCurrency") ?? "")
    .trim()
    .toUpperCase();
  const asOfDate = String(form.get("asOfDate") ?? "").trim();
  const rate = Number(String(form.get("rate") ?? "").replace(",", "."));
  try {
    await setManualRate(session.user.id, { quoteCurrency, asOfDate, rate });
    revalidatePath("/admin/fx");
    revalidatePath("/accounts");
    return { ok: true };
  } catch (err) {
    if (err instanceof FxError) return { ok: false, error: err.message };
    throw err;
  }
}
