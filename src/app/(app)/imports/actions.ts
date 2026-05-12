"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth-guards";
import {
  commitImportBatch,
  createImportBatch,
  ImportError,
  revertImportBatch,
} from "@/server/imports";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

export async function startImportAction(form: FormData): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Pick a file to upload." };
  if (file.size === 0) return { ok: false, error: "File is empty." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "File must be 5 MB or smaller." };

  const content = await file.text();
  const columnMapRaw = form.get("columnMap");
  let columnMap: unknown;
  if (columnMapRaw) {
    try {
      columnMap = JSON.parse(String(columnMapRaw));
    } catch {
      return { ok: false, error: "columnMap is not valid JSON." };
    }
  }

  try {
    const batch = await createImportBatch(
      session.user.id,
      {
        accountId: form.get("accountId"),
        fileName: file.name,
        format: form.get("format"),
        profileId: form.get("profileId") || undefined,
        columnMap,
        dateFormat: form.get("dateFormat") || undefined,
        decimalSeparator: form.get("decimalSeparator") || undefined,
      },
      content,
    );
    revalidatePath("/imports");
    return { ok: true, data: { id: batch.id } };
  } catch (err) {
    if (err instanceof ImportError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function commitImportAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await commitImportBatch(session.user.id, id);
    revalidatePath("/imports");
    revalidatePath("/transactions");
    revalidatePath(`/imports/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ImportError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function revertImportAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await revertImportBatch(session.user.id, id);
    revalidatePath("/imports");
    revalidatePath("/transactions");
    revalidatePath(`/imports/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ImportError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function cancelImportAction(id: string): Promise<ActionResult> {
  // For pending batches we just discard (delete) them so users can retry.
  const session = await requireSession();
  const { prisma } = await import("@/lib/db");
  const { recordAudit } = await import("@/lib/audit");
  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch) return { ok: false, error: "Import batch not found." };
  if (batch.status !== "PENDING")
    return { ok: false, error: "Only pending batches can be cancelled." };
  await prisma.importBatch.delete({ where: { id } });
  await recordAudit({
    actorUserId: session.user.id,
    action: "IMPORT_BATCH_CANCELLED",
    entityType: "ImportBatch",
    entityId: id,
    before: { fileName: batch.fileName, rowCount: batch.rowCount },
  });
  revalidatePath("/imports");
  redirect("/imports");
}
