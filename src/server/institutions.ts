/**
 * Institutions CRUD. Admin-only mutations — guard at the call site.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { updateInstitutionSchema, upsertInstitutionSchema } from "@/schemas/institution";

export class InstitutionError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "HAS_ACCOUNTS",
    message: string,
  ) {
    super(message);
    this.name = "InstitutionError";
  }
}

export function listInstitutions() {
  return prisma.institution.findMany({
    orderBy: [{ name: "asc" }],
    include: { _count: { select: { accounts: true } } },
  });
}

export async function getInstitution(id: string) {
  return prisma.institution.findUnique({ where: { id } });
}

export async function createInstitution(actorUserId: string, raw: unknown) {
  const parsed = upsertInstitutionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InstitutionError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }
  const created = await prisma.institution.create({ data: parsed.data });
  await recordAudit({
    actorUserId,
    action: "INSTITUTION_CREATED",
    entityType: "Institution",
    entityId: created.id,
    after: { name: created.name, type: created.type, country: created.country },
  });
  return created;
}

export async function updateInstitution(actorUserId: string, id: string, raw: unknown) {
  const parsed = updateInstitutionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InstitutionError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }
  const before = await prisma.institution.findUnique({ where: { id } });
  if (!before) throw new InstitutionError("NOT_FOUND", "Institution not found.");

  const updated = await prisma.institution.update({ where: { id }, data: parsed.data });
  await recordAudit({
    actorUserId,
    action: "INSTITUTION_UPDATED",
    entityType: "Institution",
    entityId: id,
    before: {
      name: before.name,
      type: before.type,
      country: before.country,
      website: before.website,
    },
    after: {
      name: updated.name,
      type: updated.type,
      country: updated.country,
      website: updated.website,
    },
  });
  return updated;
}

export async function deleteInstitution(actorUserId: string, id: string) {
  const before = await prisma.institution.findUnique({
    where: { id },
    include: { _count: { select: { accounts: true } } },
  });
  if (!before) throw new InstitutionError("NOT_FOUND", "Institution not found.");
  if (before._count.accounts > 0) {
    throw new InstitutionError(
      "HAS_ACCOUNTS",
      "Cannot delete an institution that still has accounts.",
    );
  }
  await prisma.institution.delete({ where: { id } });
  await recordAudit({
    actorUserId,
    action: "INSTITUTION_DELETED",
    entityType: "Institution",
    entityId: id,
    before: { name: before.name, type: before.type },
  });
}
