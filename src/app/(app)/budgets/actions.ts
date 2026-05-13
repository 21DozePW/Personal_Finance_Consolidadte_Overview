"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth-guards";
import {
  BudgetError,
  copyBudgetMonth,
  createBudget,
  deleteBudget,
  deleteBudgetLine,
  updateBudget,
  upsertBudgetLine,
} from "@/server/budgets";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function createBudgetAction(form: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await createBudget(session.user.id, {
      name: form.get("name"),
      currency: form.get("currency") ?? "CHF",
      periodKind: form.get("periodKind") ?? "MONTHLY",
      startMonth: form.get("startMonth"),
      endMonth: nullIfEmpty(form.get("endMonth")),
    });
    revalidatePath("/budgets");
    redirect("/budgets");
  } catch (err) {
    if (err instanceof BudgetError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function updateBudgetAction(id: string, form: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await updateBudget(session.user.id, id, {
      name: form.get("name"),
      startMonth: form.get("startMonth"),
      endMonth: nullIfEmpty(form.get("endMonth")),
      isActive: form.get("isActive"),
    });
    revalidatePath("/budgets");
    revalidatePath(`/budgets/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof BudgetError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deleteBudgetAction(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await deleteBudget(session.user.id, id);
    revalidatePath("/budgets");
    redirect("/budgets");
  } catch (err) {
    if (err instanceof BudgetError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function upsertBudgetLineAction(
  budgetId: string,
  form: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await upsertBudgetLine(session.user.id, budgetId, {
      categoryId: form.get("categoryId"),
      month: form.get("month"),
      plannedAmount: form.get("plannedAmount"),
      carryOverRule: form.get("carryOverRule") ?? "RESET",
    });
    revalidatePath(`/budgets/${budgetId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof BudgetError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deleteBudgetLineAction(
  budgetId: string,
  lineId: string,
): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await deleteBudgetLine(session.user.id, lineId);
    revalidatePath(`/budgets/${budgetId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof BudgetError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function copyMonthAction(
  budgetId: string,
  form: FormData,
): Promise<ActionResult<{ copied: number }>> {
  const session = await requireAdmin();
  try {
    const copied = await copyBudgetMonth(session.user.id, budgetId, {
      fromMonth: form.get("fromMonth"),
      toMonth: form.get("toMonth"),
    });
    revalidatePath(`/budgets/${budgetId}`);
    return { ok: true, data: { copied } };
  } catch (err) {
    if (err instanceof BudgetError) return { ok: false, error: err.message };
    throw err;
  }
}
