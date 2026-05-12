"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth-guards";
import {
  createLoanTerms,
  deleteLoanTerms,
  LoanTermsError,
  updateLoanTerms,
} from "@/server/loan-terms";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fromForm(form: FormData) {
  const override = form.get("monthlyPaymentOverride");
  return {
    principal: form.get("principal"),
    interestRatePct: form.get("interestRatePct"),
    termMonths: form.get("termMonths"),
    startDate: form.get("startDate"),
    paymentDayOfMonth: form.get("paymentDayOfMonth"),
    monthlyPaymentOverride: override === "" ? null : override,
  };
}

export async function createLoanTermsAction(
  accountId: string,
  form: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await createLoanTerms(session.user.id, accountId, fromForm(form));
    revalidatePath(`/accounts/${accountId}`);
    revalidatePath(`/accounts/${accountId}/loan-terms`);
    redirect(`/accounts/${accountId}/loan-terms`);
  } catch (err) {
    if (err instanceof LoanTermsError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function updateLoanTermsAction(
  accountId: string,
  form: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin();
  const remaining = form.get("remainingBalance");
  try {
    await updateLoanTerms(session.user.id, accountId, {
      ...fromForm(form),
      remainingBalance: remaining === "" ? undefined : remaining,
    });
    revalidatePath(`/accounts/${accountId}`);
    revalidatePath(`/accounts/${accountId}/loan-terms`);
    redirect(`/accounts/${accountId}/loan-terms`);
  } catch (err) {
    if (err instanceof LoanTermsError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deleteLoanTermsAction(accountId: string): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await deleteLoanTerms(session.user.id, accountId);
    revalidatePath(`/accounts/${accountId}`);
    revalidatePath(`/accounts/${accountId}/loan-terms`);
    return { ok: true };
  } catch (err) {
    if (err instanceof LoanTermsError) return { ok: false, error: err.message };
    throw err;
  }
}
