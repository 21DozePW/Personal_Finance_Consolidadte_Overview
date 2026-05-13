"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth-guards";
import {
  cloneScenario,
  createScenario,
  deleteScenario,
  ScenarioError,
  updateScenario,
} from "@/server/scenarios";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function collectLumpSums(form: FormData): Array<{
  month: string;
  amount: string;
  description: string;
}> {
  const map = new Map<string, { month?: string; amount?: string; description?: string }>();
  for (const [key, value] of form.entries()) {
    const m = key.match(/^lump-(\d+)-(month|amount|description)$/);
    if (!m) continue;
    const [, idx, field] = m as unknown as [string, string, "month" | "amount" | "description"];
    const slot = map.get(idx) ?? {};
    slot[field] = String(value);
    map.set(idx, slot);
  }
  return [...map.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, v]) => ({
      month: v.month ?? "",
      amount: v.amount ?? "",
      description: v.description ?? "",
    }))
    .filter((l) => l.month && l.amount);
}

function assumptionsFromForm(form: FormData) {
  return {
    startMonth: form.get("startMonth"),
    horizonMonths: form.get("horizonMonths") ?? 60,
    monthlyIncomeAdjustment: nullIfEmpty(form.get("monthlyIncomeAdjustment")) ?? "0",
    monthlyExpenseAdjustment: nullIfEmpty(form.get("monthlyExpenseAdjustment")) ?? "0",
    annualIncomeGrowthPct: nullIfEmpty(form.get("annualIncomeGrowthPct")) ?? "0",
    annualExpenseGrowthPct: nullIfEmpty(form.get("annualExpenseGrowthPct")) ?? "0",
    annualReturnPct: nullIfEmpty(form.get("annualReturnPct")) ?? "0",
    lumpSums: collectLumpSums(form),
    fxDrift: [], // reserved for future
  };
}

export async function createScenarioAction(form: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const created = await createScenario(session.user.id, {
      name: form.get("name"),
      isBaseline: form.get("isBaseline") === "true",
      assumptions: assumptionsFromForm(form),
    });
    revalidatePath("/forecasts");
    redirect(`/forecasts/${created.id}`);
  } catch (err) {
    if (err instanceof ScenarioError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function updateScenarioAction(id: string, form: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateScenario(session.user.id, id, {
      name: form.get("name"),
      isBaseline: form.get("isBaseline") === "true",
      assumptions: assumptionsFromForm(form),
    });
    revalidatePath("/forecasts");
    revalidatePath(`/forecasts/${id}`);
    redirect(`/forecasts/${id}`);
  } catch (err) {
    if (err instanceof ScenarioError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deleteScenarioAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await deleteScenario(session.user.id, id);
    revalidatePath("/forecasts");
    redirect("/forecasts");
  } catch (err) {
    if (err instanceof ScenarioError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function cloneScenarioAction(
  id: string,
  newName: string,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  try {
    const created = await cloneScenario(session.user.id, id, newName);
    revalidatePath("/forecasts");
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    if (err instanceof ScenarioError) return { ok: false, error: err.message };
    throw err;
  }
}
