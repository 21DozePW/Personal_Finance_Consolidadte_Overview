"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth-guards";
import {
  createRecurring,
  deleteRecurring,
  RecurringError,
  updateRecurring,
} from "@/server/recurring";

export type ActionResult = { ok: true } | { ok: false; error: string };

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function fromForm(form: FormData) {
  return {
    name: form.get("name"),
    accountId: form.get("accountId"),
    categoryId: nullIfEmpty(form.get("categoryId")),
    amount: form.get("amount"),
    cadence: form.get("cadence"),
    kind: form.get("kind"),
    dayRule: nullIfEmpty(form.get("dayRule")),
    nextDueDate: form.get("nextDueDate"),
    endDate: nullIfEmpty(form.get("endDate")),
    notes: nullIfEmpty(form.get("notes")),
  };
}

export async function createRecurringAction(form: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await createRecurring(session.user.id, fromForm(form));
    revalidatePath("/recurring");
    revalidatePath("/cash-flow");
    redirect("/recurring");
  } catch (err) {
    if (err instanceof RecurringError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function updateRecurringAction(id: string, form: FormData): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateRecurring(session.user.id, id, fromForm(form));
    revalidatePath("/recurring");
    revalidatePath("/cash-flow");
    redirect("/recurring");
  } catch (err) {
    if (err instanceof RecurringError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deleteRecurringAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await deleteRecurring(session.user.id, id);
    revalidatePath("/recurring");
    revalidatePath("/cash-flow");
    return { ok: true };
  } catch (err) {
    if (err instanceof RecurringError) return { ok: false, error: err.message };
    throw err;
  }
}
