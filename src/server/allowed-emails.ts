/**
 * Allowed-email administration. All exported functions assume the caller has
 * already verified that the actor is an Admin — guard at the call site, not
 * here. Every state-changing call writes an audit log entry.
 */

import "server-only";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { inviteAllowedEmailSchema, type InviteAllowedEmailInput } from "@/schemas/allowed-email";

export class AllowedEmailError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "ALREADY_EXISTS" | "NOT_FOUND" | "LAST_ADMIN",
    message: string,
  ) {
    super(message);
    this.name = "AllowedEmailError";
  }
}

export async function listAllowedEmails() {
  return prisma.allowedEmail.findMany({
    orderBy: [{ createdAt: "asc" }],
    include: {
      invitedBy: { select: { id: true, email: true, displayName: true } },
      consumedBy: { select: { id: true, email: true, displayName: true, isActive: true } },
    },
  });
}

export async function inviteAllowedEmail(actorUserId: string, raw: unknown) {
  const parsed = inviteAllowedEmailSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AllowedEmailError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }
  return createInvite(actorUserId, parsed.data);
}

async function createInvite(actorUserId: string, input: InviteAllowedEmailInput) {
  const existing = await prisma.allowedEmail.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AllowedEmailError("ALREADY_EXISTS", "This email is already on the allow-list.");
  }
  const created = await prisma.allowedEmail.create({
    data: {
      email: input.email,
      intendedRole: input.intendedRole,
      invitedByUserId: actorUserId,
    },
  });
  await recordAudit({
    actorUserId,
    action: "ALLOWED_EMAIL_INVITED",
    entityType: "AllowedEmail",
    entityId: created.id,
    after: { email: created.email, intendedRole: created.intendedRole },
  });
  return created;
}

export async function revokeAllowedEmail(actorUserId: string, id: string) {
  const target = await prisma.allowedEmail.findUnique({
    where: { id },
    include: { consumedBy: { select: { id: true, role: true } } },
  });
  if (!target) throw new AllowedEmailError("NOT_FOUND", "Allow-list entry not found.");

  // Guard: never let the last active Admin be revoked. Count Admins by joining
  // through AllowedEmail -> User, since the User row is what actually has the
  // role.
  if (target.intendedRole === UserRole.ADMIN || target.consumedBy?.role === UserRole.ADMIN) {
    const remainingAdmins = await prisma.user.count({
      where: {
        isActive: true,
        role: UserRole.ADMIN,
        NOT: target.consumedByUserId ? { id: target.consumedByUserId } : undefined,
      },
    });
    if (remainingAdmins === 0) {
      throw new AllowedEmailError(
        "LAST_ADMIN",
        "Cannot revoke the last active Admin. Promote another user first.",
      );
    }
  }

  const before = {
    email: target.email,
    intendedRole: target.intendedRole,
    consumedByUserId: target.consumedByUserId,
  };

  await prisma.$transaction(async (tx) => {
    if (target.consumedByUserId) {
      await tx.user.update({
        where: { id: target.consumedByUserId },
        data: { isActive: false },
      });
    }
    await tx.allowedEmail.delete({ where: { id } });
  });

  await recordAudit({
    actorUserId,
    action: "ALLOWED_EMAIL_REVOKED",
    entityType: "AllowedEmail",
    entityId: id,
    before,
  });
}
