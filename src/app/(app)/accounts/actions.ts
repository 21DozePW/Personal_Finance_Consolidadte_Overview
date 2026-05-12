"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireSession } from "@/server/auth-guards";
import { AccountError, createAccount, deleteAccount, updateAccount } from "@/server/accounts";
import { BalanceError, recordBalance } from "@/server/balances";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function accountFieldsFromForm(form: FormData) {
  return {
    institutionId: form.get("institutionId"),
    alias: form.get("alias"),
    accountKind: form.get("accountKind"),
    currency: form.get("currency"),
    lastFour: form.get("lastFour"),
    notes: form.get("notes"),
    openedAt: form.get("openedAt"),
    displayOrder: form.get("displayOrder"),
  };
}

export async function createAccountAction(form: FormData): Promise<ActionResult<{ id: string }>> {
  const session = await requireAdmin();
  try {
    const created = await createAccount(session.user.id, accountFieldsFromForm(form));
    revalidatePath("/accounts");
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function updateAccountAction(id: string, form: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  const closedAt = form.get("closedAt");
  const isActive = form.get("isActive");
  try {
    await updateAccount(session.user.id, id, {
      ...accountFieldsFromForm(form),
      ...(closedAt !== null ? { closedAt } : {}),
      ...(isActive !== null ? { isActive } : {}),
    });
    revalidatePath("/accounts");
    revalidatePath(`/accounts/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deactivateAccountAction(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await updateAccount(session.user.id, id, {
      isActive: false,
      closedAt: new Date().toISOString().slice(0, 10),
    });
    revalidatePath("/accounts");
    revalidatePath(`/accounts/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deleteAccountAction(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await deleteAccount(session.user.id, id);
    revalidatePath("/accounts");
    redirect("/accounts");
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function recordBalanceAction(
  accountId: string,
  form: FormData,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await recordBalance(session.user.id, accountId, {
      asOfDate: form.get("asOfDate"),
      amount: form.get("amount"),
    });
    revalidatePath("/accounts");
    revalidatePath(`/accounts/${accountId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof BalanceError) return { ok: false, error: err.message };
    throw err;
  }
}
