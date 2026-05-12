/**
 * Integration test exercising the allow-list business logic against a real
 * Postgres. Skipped automatically when no DATABASE_URL is provided so the
 * suite still works for contributors without a local DB.
 *
 * CI sets DATABASE_URL to the workflow's Postgres service.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import {
  AllowedEmailError,
  inviteAllowedEmail,
  listAllowedEmails,
  revokeAllowedEmail,
} from "@/server/allowed-emails";

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();

async function reset() {
  await prisma.auditLog.deleteMany({});
  await prisma.allowedEmail.deleteMany({});
  await prisma.user.deleteMany({});
}

async function makeAdmin(emailSeed: string) {
  return prisma.user.create({
    data: {
      googleSub: `sub-${emailSeed}`,
      email: `${emailSeed}@example.com`,
      displayName: `Admin ${emailSeed}`,
      role: UserRole.ADMIN,
      isActive: true,
      lastLoginAt: new Date(),
    },
  });
}

d("allow-list business logic", () => {
  beforeEach(async () => {
    await reset();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("invites a new member and writes an audit row", async () => {
    const admin = await makeAdmin("a1");
    const created = await inviteAllowedEmail(admin.id, {
      email: "newbie@example.com",
      intendedRole: "MEMBER",
    });
    expect(created.email).toBe("newbie@example.com");
    expect(created.intendedRole).toBe("MEMBER");

    const all = await listAllowedEmails();
    expect(all.map((e) => e.email)).toContain("newbie@example.com");

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "AllowedEmail", action: "ALLOWED_EMAIL_INVITED" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorUserId).toBe(admin.id);
  });

  it("rejects duplicate invitations", async () => {
    const admin = await makeAdmin("a2");
    await inviteAllowedEmail(admin.id, { email: "dup@example.com" });
    await expect(inviteAllowedEmail(admin.id, { email: "DUP@example.com" })).rejects.toBeInstanceOf(
      AllowedEmailError,
    );
  });

  it("rejects invalid emails via Zod", async () => {
    const admin = await makeAdmin("a3");
    await expect(inviteAllowedEmail(admin.id, { email: "nope" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("revokes a pending invitation", async () => {
    const admin = await makeAdmin("a4");
    const entry = await inviteAllowedEmail(admin.id, { email: "pending@example.com" });
    await revokeAllowedEmail(admin.id, entry.id);
    const remaining = await listAllowedEmails();
    expect(remaining.find((e) => e.id === entry.id)).toBeUndefined();
  });

  it("deactivates the linked user when revoking a consumed invitation", async () => {
    const admin = await makeAdmin("a5");
    const member = await prisma.user.create({
      data: {
        googleSub: "sub-member",
        email: "member@example.com",
        displayName: "Member",
        role: UserRole.MEMBER,
        isActive: true,
      },
    });
    const entry = await prisma.allowedEmail.create({
      data: {
        email: "member@example.com",
        intendedRole: UserRole.MEMBER,
        consumedByUserId: member.id,
      },
    });
    await revokeAllowedEmail(admin.id, entry.id);

    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(reloaded.isActive).toBe(false);
  });

  it("refuses to revoke the last active admin", async () => {
    const admin = await makeAdmin("a6");
    const entry = await prisma.allowedEmail.create({
      data: {
        email: admin.email,
        intendedRole: UserRole.ADMIN,
        consumedByUserId: admin.id,
      },
    });
    await expect(revokeAllowedEmail(admin.id, entry.id)).rejects.toMatchObject({
      code: "LAST_ADMIN",
    });
  });
});
