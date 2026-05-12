"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth-guards";
import {
  createSingleTransaction,
  createSplitTransaction,
  createTransfer,
  deleteTransaction,
  TransactionError,
  updateTransaction,
} from "@/server/transactions";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function createSingleTransactionAction(
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  try {
    const created = await createSingleTransaction(session.user.id, {
      accountId: form.get("accountId"),
      occurredOn: form.get("occurredOn"),
      postedOn: nullIfEmpty(form.get("postedOn")),
      kind: form.get("kind"),
      amount: form.get("amount"),
      categoryId: nullIfEmpty(form.get("categoryId")),
      description: nullIfEmpty(form.get("description")),
      merchant: nullIfEmpty(form.get("merchant")),
    });
    revalidatePath("/transactions");
    revalidatePath(`/accounts/${created.accountId}`);
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    if (err instanceof TransactionError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function createTransferAction(
  form: FormData,
): Promise<ActionResult<{ fromId: string }>> {
  const session = await requireSession();
  try {
    const { from } = await createTransfer(session.user.id, {
      fromAccountId: form.get("fromAccountId"),
      toAccountId: form.get("toAccountId"),
      occurredOn: form.get("occurredOn"),
      postedOn: nullIfEmpty(form.get("postedOn")),
      fromAmount: form.get("fromAmount"),
      toAmount: form.get("toAmount"),
      description: nullIfEmpty(form.get("description")),
    });
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return { ok: true, data: { fromId: from.id } };
  } catch (err) {
    if (err instanceof TransactionError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function createSplitAction(form: FormData): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const accountId = form.get("accountId");
  const occurredOn = form.get("occurredOn");
  const description = nullIfEmpty(form.get("description"));
  const merchant = nullIfEmpty(form.get("merchant"));

  // Collect "line-i-categoryId" / "line-i-amount" / "line-i-kind" entries.
  const lineMap = new Map<string, { categoryId?: string | null; amount?: string; kind?: string }>();
  for (const [key, value] of form.entries()) {
    const m = key.match(/^line-(\d+)-(categoryId|amount|kind)$/);
    if (!m) continue;
    const [, idx, field] = m as unknown as [string, string, "categoryId" | "amount" | "kind"];
    const slot = lineMap.get(idx) ?? {};
    if (field === "categoryId") {
      slot.categoryId = nullIfEmpty(value);
    } else {
      slot[field] = String(value);
    }
    lineMap.set(idx, slot);
  }
  const lines = [...lineMap.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, v]) => v);

  try {
    const created = await createSplitTransaction(session.user.id, {
      accountId,
      occurredOn,
      description,
      merchant,
      lines,
    });
    revalidatePath("/transactions");
    return { ok: true, data: { id: created[0]!.id } };
  } catch (err) {
    if (err instanceof TransactionError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function updateTransactionAction(id: string, form: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const amount = form.get("amount");
  const kind = form.get("kind");
  try {
    await updateTransaction(session.user.id, id, {
      occurredOn: form.get("occurredOn"),
      postedOn: nullIfEmpty(form.get("postedOn")),
      kind: kind ? kind : undefined,
      amount: amount ? amount : undefined,
      categoryId: nullIfEmpty(form.get("categoryId")),
      description: nullIfEmpty(form.get("description")),
      merchant: nullIfEmpty(form.get("merchant")),
    });
    revalidatePath("/transactions");
    revalidatePath(`/transactions/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof TransactionError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deleteTransactionAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await deleteTransaction(session.user.id, id);
    revalidatePath("/transactions");
    redirect("/transactions");
  } catch (err) {
    if (err instanceof TransactionError) return { ok: false, error: err.message };
    throw err;
  }
}
