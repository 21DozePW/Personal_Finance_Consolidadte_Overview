/**
 * Categories CRUD. Admin-only mutations — guard at the call site.
 *
 * Categories may be nested one level deep (a category has at most one parent).
 * Sub-categories must share the parent's `kind`.
 */

import "server-only";
import type { Category, CategoryKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { updateCategorySchema, upsertCategorySchema } from "@/schemas/category";

export class CategoryError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "PARENT_NOT_FOUND"
      | "PARENT_MISMATCH"
      | "HAS_CHILDREN"
      | "IN_USE",
    message: string,
  ) {
    super(message);
    this.name = "CategoryError";
  }
}

export function listCategories(opts: { includeArchived?: boolean } = {}) {
  return prisma.category.findMany({
    where: opts.includeArchived ? {} : { isArchived: false },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { transactions: true, children: true } },
      parent: { select: { id: true, name: true } },
    },
  });
}

export async function getCategory(id: string) {
  return prisma.category.findUnique({ where: { id } });
}

async function validateParent(parentCategoryId: string | null, kind: CategoryKind): Promise<void> {
  if (!parentCategoryId) return;
  const parent = await prisma.category.findUnique({
    where: { id: parentCategoryId },
    select: { id: true, kind: true, parentCategoryId: true },
  });
  if (!parent) throw new CategoryError("PARENT_NOT_FOUND", "Parent category not found.");
  if (parent.parentCategoryId) {
    throw new CategoryError(
      "PARENT_MISMATCH",
      "Cannot nest more than one level — pick a top-level parent.",
    );
  }
  if (parent.kind !== kind) {
    throw new CategoryError("PARENT_MISMATCH", "Sub-category kind must match its parent.");
  }
}

export async function createCategory(actorUserId: string, raw: unknown): Promise<Category> {
  const parsed = upsertCategorySchema.safeParse(raw);
  if (!parsed.success) {
    throw new CategoryError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  await validateParent(parsed.data.parentCategoryId, parsed.data.kind);

  const created = await prisma.category.create({
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      parentCategoryId: parsed.data.parentCategoryId,
      color: parsed.data.color,
      icon: parsed.data.icon,
    },
  });
  await recordAudit({
    actorUserId,
    action: "CATEGORY_CREATED",
    entityType: "Category",
    entityId: created.id,
    after: {
      name: created.name,
      kind: created.kind,
      parentCategoryId: created.parentCategoryId,
    },
  });
  return created;
}

export async function updateCategory(
  actorUserId: string,
  id: string,
  raw: unknown,
): Promise<Category> {
  const parsed = updateCategorySchema.safeParse(raw);
  if (!parsed.success) {
    throw new CategoryError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const before = await prisma.category.findUnique({ where: { id } });
  if (!before) throw new CategoryError("NOT_FOUND", "Category not found.");

  const nextKind = parsed.data.kind ?? before.kind;
  const nextParent =
    parsed.data.parentCategoryId === undefined
      ? before.parentCategoryId
      : parsed.data.parentCategoryId;
  if (nextParent === id) {
    throw new CategoryError("PARENT_MISMATCH", "A category cannot be its own parent.");
  }
  await validateParent(nextParent, nextKind);

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.kind !== undefined) data.kind = parsed.data.kind;
  if (parsed.data.parentCategoryId !== undefined)
    data.parentCategoryId = parsed.data.parentCategoryId;
  if (parsed.data.color !== undefined) data.color = parsed.data.color;
  if (parsed.data.icon !== undefined) data.icon = parsed.data.icon;
  if (parsed.data.isArchived !== undefined) data.isArchived = parsed.data.isArchived;

  const updated = await prisma.category.update({ where: { id }, data });
  await recordAudit({
    actorUserId,
    action: "CATEGORY_UPDATED",
    entityType: "Category",
    entityId: id,
    before: {
      name: before.name,
      kind: before.kind,
      parentCategoryId: before.parentCategoryId,
      isArchived: before.isArchived,
    },
    after: {
      name: updated.name,
      kind: updated.kind,
      parentCategoryId: updated.parentCategoryId,
      isArchived: updated.isArchived,
    },
  });
  return updated;
}

export async function deleteCategory(actorUserId: string, id: string): Promise<void> {
  const before = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { transactions: true, children: true, budgetLines: true } } },
  });
  if (!before) throw new CategoryError("NOT_FOUND", "Category not found.");
  if (before._count.children > 0) {
    throw new CategoryError("HAS_CHILDREN", "Delete sub-categories first.");
  }
  if (before._count.transactions > 0 || before._count.budgetLines > 0) {
    throw new CategoryError(
      "IN_USE",
      "Category is referenced by transactions or budget lines — archive it instead.",
    );
  }
  await prisma.category.delete({ where: { id } });
  await recordAudit({
    actorUserId,
    action: "CATEGORY_DELETED",
    entityType: "Category",
    entityId: id,
    before: { name: before.name, kind: before.kind },
  });
}
