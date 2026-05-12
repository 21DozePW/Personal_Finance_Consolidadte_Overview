/**
 * ImportProfile CRUD. Admin-only mutations — guard at the call site.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { upsertImportProfileSchema } from "@/schemas/import";

export class ImportProfileError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "ALREADY_EXISTS",
    message: string,
  ) {
    super(message);
    this.name = "ImportProfileError";
  }
}

export async function listImportProfiles(institutionId?: string) {
  return prisma.importProfile.findMany({
    where: institutionId ? { institutionId } : {},
    orderBy: [{ institutionId: "asc" }, { name: "asc" }],
    include: { institution: { select: { id: true, name: true } } },
  });
}

export async function getImportProfile(id: string) {
  return prisma.importProfile.findUnique({ where: { id } });
}

export async function createImportProfile(actorUserId: string, raw: unknown) {
  const parsed = upsertImportProfileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ImportProfileError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }
  const existing = await prisma.importProfile.findUnique({
    where: {
      institutionId_name: {
        institutionId: parsed.data.institutionId,
        name: parsed.data.name,
      },
    },
  });
  if (existing) {
    throw new ImportProfileError("ALREADY_EXISTS", "A profile with this name already exists.");
  }
  const created = await prisma.importProfile.create({
    data: {
      institutionId: parsed.data.institutionId,
      name: parsed.data.name,
      columnMap: parsed.data.columnMap,
      dateFormat: parsed.data.dateFormat,
      decimalSeparator: parsed.data.decimalSeparator,
      createdByUserId: actorUserId,
    },
  });
  await recordAudit({
    actorUserId,
    action: "IMPORT_PROFILE_CREATED",
    entityType: "ImportProfile",
    entityId: created.id,
    after: { name: created.name, institutionId: created.institutionId },
  });
  return created;
}

export async function deleteImportProfile(actorUserId: string, id: string) {
  const before = await prisma.importProfile.findUnique({ where: { id } });
  if (!before) throw new ImportProfileError("NOT_FOUND", "Import profile not found.");
  await prisma.importProfile.delete({ where: { id } });
  await recordAudit({
    actorUserId,
    action: "IMPORT_PROFILE_DELETED",
    entityType: "ImportProfile",
    entityId: id,
    before: { name: before.name, institutionId: before.institutionId },
  });
}
