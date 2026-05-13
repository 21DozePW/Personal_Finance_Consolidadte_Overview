/**
 * Read-side helpers for the audit log. Writes live in `src/lib/audit.ts`.
 *
 * The audit log is append-only by convention (no UI delete path; revert
 * happens via new audit entries). Admin only.
 */

import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AuditFilters = {
  actorUserId?: string;
  entityType?: string;
  action?: string;
  fromIso?: string;
  toIso?: string;
  cursor?: string;
  limit?: number;
};

export async function listAuditLog(filters: AuditFilters = {}) {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.actorUserId) where.actorUserId = filters.actorUserId;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.action) where.action = { contains: filters.action, mode: "insensitive" };
  if (filters.fromIso || filters.toIso) {
    where.createdAt = {};
    if (filters.fromIso) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(filters.fromIso);
    if (filters.toIso) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(filters.toIso);
  }

  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    cursor: filters.cursor ? { id: filters.cursor } : undefined,
    skip: filters.cursor ? 1 : 0,
    include: {
      actor: { select: { id: true, email: true, displayName: true } },
    },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export async function listDistinctEntityTypes(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ["entityType"],
    select: { entityType: true },
    orderBy: { entityType: "asc" },
  });
  return rows.map((r) => r.entityType);
}
