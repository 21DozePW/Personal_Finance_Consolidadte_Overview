import { z } from "zod";

export const cadenceSchema = z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL", "CUSTOM"]);

export const recurringKindSchema = z.enum([
  "INCOME",
  "EXPENSE",
  "LOAN_PAYMENT",
  "LEASE_PAYMENT",
  "SUBSCRIPTION",
]);

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

const nullableDateOnly = z
  .union([dateOnly, z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v == null || v === "" ? null : v));

const nullableString = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v == null || v === "" ? null : v.toString()));

const nullableId = z
  .union([z.string().trim().min(1), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v == null || v === "" ? null : v.toString()));

export const upsertRecurringSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  accountId: z.string().min(1, "Pick an account."),
  categoryId: nullableId,
  amount: z.string().trim().min(1, "Amount is required."),
  cadence: cadenceSchema,
  kind: recurringKindSchema,
  dayRule: nullableString(60),
  nextDueDate: dateOnly,
  endDate: nullableDateOnly,
  notes: nullableString(2000),
});

export const updateRecurringSchema = upsertRecurringSchema.partial();

export type UpsertRecurringInput = z.infer<typeof upsertRecurringSchema>;
export type UpdateRecurringInput = z.infer<typeof updateRecurringSchema>;
