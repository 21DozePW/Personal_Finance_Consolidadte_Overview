import { z } from "zod";

const monthFormat = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM.");

const nullableMonth = z
  .union([monthFormat, z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v == null || v === "" ? null : v));

const decimalString = z
  .union([
    z
      .string()
      .trim()
      .regex(/^-?\d+(\.\d+)?$/, "Enter a number."),
    z.literal(""),
    z.null(),
    z.undefined(),
  ])
  .transform((v) => (v == null || v === "" ? null : v));

/**
 * Scenario assumptions stored as `ForecastScenario.assumptions` JSON.
 *
 * All monetary amounts are in CHF major units (decimal strings) when entered
 * by the user; the projection layer converts them to minor units before
 * running the math.
 *
 * Annual percentages use plain numbers ("4.5" means 4.5% per year).
 */
export const assumptionsSchema = z.object({
  startMonth: monthFormat,
  horizonMonths: z
    .union([z.number().int(), z.string().regex(/^\d+$/)])
    .transform((v) => (typeof v === "number" ? v : parseInt(v, 10)))
    .pipe(z.number().int().min(1).max(120))
    .default(60),
  monthlyIncomeAdjustment: decimalString.default("0"),
  monthlyExpenseAdjustment: decimalString.default("0"),
  annualIncomeGrowthPct: decimalString.default("0"),
  annualExpenseGrowthPct: decimalString.default("0"),
  annualReturnPct: decimalString.default("0"),
  lumpSums: z
    .array(
      z.object({
        month: monthFormat,
        amount: z.string().trim().min(1, "Amount required."),
        description: z.string().trim().max(120).optional().default(""),
      }),
    )
    .max(50)
    .default([]),
  fxDrift: z
    .array(
      z.object({
        currency: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{3}$/),
        annualDriftPct: z
          .string()
          .trim()
          .regex(/^-?\d+(\.\d+)?$/),
      }),
    )
    .max(20)
    .default([]),
});

export type ScenarioAssumptions = z.infer<typeof assumptionsSchema>;

export const createScenarioSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  isBaseline: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === true || v === "true"),
  assumptions: assumptionsSchema,
});

export const updateScenarioSchema = createScenarioSchema.partial();

export type CreateScenarioInput = z.infer<typeof createScenarioSchema>;
export type UpdateScenarioInput = z.infer<typeof updateScenarioSchema>;

// Helper used by both schema validation and unit-test factories.
export function startOfMonthIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export { monthFormat as scenarioMonthFormat, nullableMonth };
