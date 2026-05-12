import { z } from "zod";

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

const nullableMinor = z
  .union([z.string().trim().min(1), z.number(), z.null(), z.undefined()])
  .transform((v) => (v == null ? null : typeof v === "number" ? v.toString() : v));

export const createLoanTermsSchema = z.object({
  principal: z.string().trim().min(1, "Principal is required."),
  interestRatePct: z.string().trim().min(1, "Interest rate is required."),
  termMonths: z
    .union([z.string().regex(/^\d+$/), z.number().int()])
    .transform((v) => (typeof v === "number" ? v : parseInt(v, 10)))
    .pipe(z.number().int().min(1, "Term must be at least 1 month.").max(1200)),
  startDate: dateOnly,
  paymentDayOfMonth: z
    .union([z.string().regex(/^\d+$/), z.number().int()])
    .transform((v) => (typeof v === "number" ? v : parseInt(v, 10)))
    .pipe(z.number().int().min(1).max(31)),
  // Optional override; default is PMT-derived.
  monthlyPaymentOverride: nullableMinor.optional(),
});

export const updateLoanTermsSchema = createLoanTermsSchema.partial().extend({
  remainingBalance: z.string().trim().optional(),
});

export type CreateLoanTermsInput = z.infer<typeof createLoanTermsSchema>;
export type UpdateLoanTermsInput = z.infer<typeof updateLoanTermsSchema>;

export const payoffSchema = z.object({
  extraAmount: z.string().trim().min(1, "Enter an extra amount."),
});

export type PayoffInput = z.infer<typeof payoffSchema>;

/**
 * Parse a user-typed percent string ("4.25" or "4,25") to the storage
 * representation `interestRatePctBps` (basis points × 100). 4.25% → 42500.
 */
export function pctStringToBps(raw: string): number {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid percentage "${raw}".`);
  }
  const value = Number(normalized);
  return Math.round(value * 10_000);
}

export function bpsToPctString(bps: number): string {
  return (bps / 10_000).toFixed(4).replace(/\.?0+$/, "");
}
