import { z } from "zod";

export const periodKindSchema = z.enum(["MONTHLY", "ANNUAL"]);
export const carryOverRuleSchema = z.enum(["RESET", "ROLLOVER_SURPLUS", "ACCUMULATE"]);

const monthFormat = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM.");
const nullableMonth = z
  .union([monthFormat, z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v == null || v === "" ? null : v));

export const createBudgetSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Enter a 3-letter ISO currency code.")
    .default("CHF"),
  periodKind: periodKindSchema.default("MONTHLY"),
  startMonth: monthFormat,
  endMonth: nullableMonth,
});

export const updateBudgetSchema = createBudgetSchema
  .extend({
    isActive: z
      .union([z.boolean(), z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === true || v === "true")),
  })
  .partial();

export const upsertBudgetLineSchema = z.object({
  categoryId: z.string().min(1, "Pick a category."),
  month: monthFormat,
  plannedAmount: z.string().trim().min(1, "Amount is required."),
  carryOverRule: carryOverRuleSchema.default("RESET"),
});

export const copyMonthSchema = z.object({
  fromMonth: monthFormat,
  toMonth: monthFormat,
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type UpsertBudgetLineInput = z.infer<typeof upsertBudgetLineSchema>;
export type CopyMonthInput = z.infer<typeof copyMonthSchema>;
