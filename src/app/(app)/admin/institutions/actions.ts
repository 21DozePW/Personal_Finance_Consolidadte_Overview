"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth-guards";
import {
  InstitutionError,
  createInstitution,
  deleteInstitution,
  updateInstitution,
} from "@/server/institutions";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fromForm(form: FormData) {
  return {
    name: form.get("name"),
    type: form.get("type"),
    country: form.get("country"),
    website: form.get("website"),
  };
}

export async function createInstitutionAction(form: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await createInstitution(session.user.id, fromForm(form));
    revalidatePath("/admin/institutions");
    revalidatePath("/accounts/new");
    return { ok: true };
  } catch (err) {
    if (err instanceof InstitutionError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function updateInstitutionAction(id: string, form: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await updateInstitution(session.user.id, id, fromForm(form));
    revalidatePath("/admin/institutions");
    revalidatePath("/accounts");
    return { ok: true };
  } catch (err) {
    if (err instanceof InstitutionError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deleteInstitutionAction(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await deleteInstitution(session.user.id, id);
    revalidatePath("/admin/institutions");
    return { ok: true };
  } catch (err) {
    if (err instanceof InstitutionError) return { ok: false, error: err.message };
    throw err;
  }
}
