"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth-guards";
import { createGoal, deleteGoal, GoalError, refreshGoalProgress, updateGoal } from "@/server/goals";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function fromForm(form: FormData) {
  return {
    name: form.get("name"),
    kind: form.get("kind"),
    currency: form.get("currency") ?? "CHF",
    targetAmount: form.get("targetAmount"),
    targetDate: form.get("targetDate"),
    linkedAccountId: nullIfEmpty(form.get("linkedAccountId")),
    currentAmount: nullIfEmpty(form.get("currentAmount")),
    monthlyContribution: nullIfEmpty(form.get("monthlyContribution")),
    priority: form.get("priority") ?? 0,
  };
}

export async function createGoalAction(form: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const created = await createGoal(session.user.id, fromForm(form));
    revalidatePath("/goals");
    redirect(`/goals/${created.id}`);
  } catch (err) {
    if (err instanceof GoalError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function updateGoalAction(id: string, form: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const isArchived = form.get("isArchived");
  try {
    await updateGoal(session.user.id, id, {
      ...fromForm(form),
      ...(isArchived !== null ? { isArchived } : {}),
    });
    revalidatePath("/goals");
    revalidatePath(`/goals/${id}`);
    redirect(`/goals/${id}`);
  } catch (err) {
    if (err instanceof GoalError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deleteGoalAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await deleteGoal(session.user.id, id);
    revalidatePath("/goals");
    redirect("/goals");
  } catch (err) {
    if (err instanceof GoalError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function refreshGoalAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await refreshGoalProgress(session.user.id, id);
    revalidatePath(`/goals/${id}`);
    revalidatePath("/goals");
    return { ok: true };
  } catch (err) {
    if (err instanceof GoalError) return { ok: false, error: err.message };
    throw err;
  }
}
