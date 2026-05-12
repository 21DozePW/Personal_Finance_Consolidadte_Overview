"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth-guards";
import { AllowedEmailError, inviteAllowedEmail, revokeAllowedEmail } from "@/server/allowed-emails";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function inviteAllowedEmailAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await inviteAllowedEmail(session.user.id, {
      email: formData.get("email"),
      intendedRole: formData.get("intendedRole") ?? "MEMBER",
    });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    if (err instanceof AllowedEmailError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function revokeAllowedEmailAction(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await revokeAllowedEmail(session.user.id, id);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    if (err instanceof AllowedEmailError) return { ok: false, error: err.message };
    throw err;
  }
}
