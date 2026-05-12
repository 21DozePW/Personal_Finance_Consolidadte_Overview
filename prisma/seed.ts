/**
 * Seed script — idempotent.
 *
 * Reads `ADMIN_BOOTSTRAP_EMAIL` from the environment and ensures it exists in
 * `AllowedEmail` with role ADMIN, so the first sign-in promotes the owner.
 * Subsequent runs are no-ops.
 *
 * In dev, optionally seeds a few default categories. Production seeds only
 * touch the bootstrap row to keep the database clean.
 */

import { PrismaClient, UserRole, CategoryKind } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES: Array<{ name: string; kind: CategoryKind }> = [
  { name: "Salary", kind: CategoryKind.INCOME },
  { name: "Other income", kind: CategoryKind.INCOME },
  { name: "Housing", kind: CategoryKind.EXPENSE },
  { name: "Groceries", kind: CategoryKind.EXPENSE },
  { name: "Utilities", kind: CategoryKind.EXPENSE },
  { name: "Transport", kind: CategoryKind.EXPENSE },
  { name: "Insurance", kind: CategoryKind.EXPENSE },
  { name: "Health", kind: CategoryKind.EXPENSE },
  { name: "Dining", kind: CategoryKind.EXPENSE },
  { name: "Travel", kind: CategoryKind.EXPENSE },
  { name: "Subscriptions", kind: CategoryKind.EXPENSE },
  { name: "Loan payment", kind: CategoryKind.EXPENSE },
  { name: "Transfer", kind: CategoryKind.TRANSFER },
];

async function main() {
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (!bootstrapEmail) {
    console.warn(
      "[seed] ADMIN_BOOTSTRAP_EMAIL not set; skipping admin allow-list bootstrap. " +
        "Set it in .env before first sign-in.",
    );
  } else {
    await prisma.allowedEmail.upsert({
      where: { email: bootstrapEmail },
      update: { intendedRole: UserRole.ADMIN },
      create: { email: bootstrapEmail, intendedRole: UserRole.ADMIN },
    });
    console.log(`[seed] Bootstrap admin allow-listed: ${bootstrapEmail}`);
  }

  if (process.env.NODE_ENV !== "production") {
    for (const cat of DEFAULT_CATEGORIES) {
      const existing = await prisma.category.findFirst({
        where: { name: cat.name, parentCategoryId: null },
      });
      if (!existing) {
        await prisma.category.create({ data: { name: cat.name, kind: cat.kind } });
      }
    }
    console.log(`[seed] Default categories ensured (${DEFAULT_CATEGORIES.length}).`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
