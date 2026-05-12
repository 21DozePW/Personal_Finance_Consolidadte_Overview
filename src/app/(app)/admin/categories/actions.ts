"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth-guards";
import { CategoryError, createCategory, deleteCategory, updateCategory } from "@/server/categories";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fromForm(form: FormData) {
  return {
    name: form.get("name"),
    kind: form.get("kind"),
    parentCategoryId: form.get("parentCategoryId"),
    color: form.get("color"),
    icon: form.get("icon"),
  };
}

export async function createCategoryAction(form: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await createCategory(session.user.id, fromForm(form));
    revalidatePath("/admin/categories");
    revalidatePath("/transactions/new");
    return { ok: true };
  } catch (err) {
    if (err instanceof CategoryError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function archiveCategoryAction(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await updateCategory(session.user.id, id, { isArchived: true });
    revalidatePath("/admin/categories");
    return { ok: true };
  } catch (err) {
    if (err instanceof CategoryError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function unarchiveCategoryAction(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await updateCategory(session.user.id, id, { isArchived: false });
    revalidatePath("/admin/categories");
    return { ok: true };
  } catch (err) {
    if (err instanceof CategoryError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await deleteCategory(session.user.id, id);
    revalidatePath("/admin/categories");
    return { ok: true };
  } catch (err) {
    if (err instanceof CategoryError) return { ok: false, error: err.message };
    throw err;
  }
}
