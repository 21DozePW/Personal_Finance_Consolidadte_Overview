import { z } from "zod";

export const accountKindSchema = z.enum([
  "CHECKING",
  "SAVINGS",
  "INVESTMENT",
  "CREDIT_CARD",
  "LOAN",
  "LEASE",
  "MORTGAGE",
  "CASH",
  "OTHER_ASSET",
  "OTHER_LIABILITY",
]);

const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Enter a 3-letter ISO currency code.");

const nullableNotes = z
  .union([z.string().trim().max(2000), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v == null || v === "" ? null : v.toString()));

const nullableLastFour = z
  .union([
    z
      .string()
      .trim()
      .regex(/^\d{4}$/, "Last four must be 4 digits."),
    z.literal(""),
    z.null(),
    z.undefined(),
  ])
  .transform((v) => (v == null || v === "" ? null : v.toString()));

const nullableDate = z
  .union([
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    z.literal(""),
    z.null(),
    z.undefined(),
  ])
  .transform((v) => (v == null || v === "" ? null : new Date(`${v}T00:00:00Z`)));

const displayOrderField = z
  .union([z.number().int(), z.string().regex(/^-?\d+$/), z.undefined()])
  .transform((v) => (v === undefined ? 0 : typeof v === "number" ? v : parseInt(v, 10)))
  .pipe(z.number().int().min(0).max(10_000));

export const createAccountSchema = z.object({
  institutionId: z.string().min(1, "Pick an institution."),
  alias: z.string().trim().min(1, "Alias is required.").max(120),
  accountKind: accountKindSchema,
  currency: currencyCode.default("CHF"),
  lastFour: nullableLastFour,
  notes: nullableNotes,
  openedAt: nullableDate,
  displayOrder: displayOrderField,
});

export const updateAccountSchema = createAccountSchema
  .extend({
    isActive: z
      .union([z.boolean(), z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === true || v === "true")),
    closedAt: nullableDate,
  })
  .partial();

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
