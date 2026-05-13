import { z } from "zod";

export const goalKindSchema = z.enum(["SAVINGS", "DEBT_PAYOFF", "EMERGENCY_FUND", "OTHER"]);

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

const nullableId = z
  .union([z.string().trim().min(1), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v == null || v === "" ? null : v.toString()));

const integerCoerced = z
  .union([z.number().int(), z.string().regex(/^-?\d+$/)])
  .transform((v) => (typeof v === "number" ? v : parseInt(v, 10)))
  .pipe(z.number().int().min(0).max(1000));

export const createGoalSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  kind: goalKindSchema,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Enter a 3-letter ISO currency code.")
    .default("CHF"),
  targetAmount: z.string().trim().min(1, "Target amount is required."),
  targetDate: dateOnly,
  linkedAccountId: nullableId,
  currentAmount: z.string().trim().optional(),
  monthlyContribution: z.string().trim().optional(),
  priority: integerCoerced.default(0),
});

export const updateGoalSchema = createGoalSchema
  .extend({
    isArchived: z
      .union([z.boolean(), z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === true || v === "true")),
  })
  .partial();

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
