import { z } from "zod";

export const txnKindSchema = z.enum(["EXPENSE", "INCOME"]);
export type TxnKind = z.infer<typeof txnKindSchema>;

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

/** Single (non-transfer, non-split) transaction. */
export const createSingleTransactionSchema = z.object({
  accountId: z.string().min(1, "Pick an account."),
  occurredOn: dateOnly,
  postedOn: nullableDateOnly,
  kind: txnKindSchema,
  amount: z.string().trim().min(1, "Amount is required."),
  categoryId: nullableId,
  description: nullableString(500),
  merchant: nullableString(120),
});

/** Two-leg transfer (cross-currency allowed). */
export const createTransferSchema = z
  .object({
    fromAccountId: z.string().min(1),
    toAccountId: z.string().min(1),
    occurredOn: dateOnly,
    postedOn: nullableDateOnly,
    fromAmount: z.string().trim().min(1, "From amount is required."),
    toAmount: z.string().trim().min(1, "To amount is required."),
    description: nullableString(500),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "From and To must be different accounts.",
    path: ["toAccountId"],
  });

/** Multi-line split: one account, N (category, amount) lines. */
export const createSplitSchema = z.object({
  accountId: z.string().min(1, "Pick an account."),
  occurredOn: dateOnly,
  postedOn: nullableDateOnly,
  description: nullableString(500),
  merchant: nullableString(120),
  lines: z
    .array(
      z.object({
        categoryId: nullableId,
        amount: z.string().trim().min(1, "Amount is required."),
        kind: txnKindSchema,
      }),
    )
    .min(2, "A split needs at least two lines."),
});

export const updateTransactionSchema = z
  .object({
    occurredOn: dateOnly.optional(),
    postedOn: nullableDateOnly.optional(),
    kind: txnKindSchema.optional(),
    amount: z.string().trim().min(1).optional(),
    categoryId: nullableId.optional(),
    description: nullableString(500).optional(),
    merchant: nullableString(120).optional(),
  })
  .partial();

export const listFiltersSchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  q: z.string().trim().optional(),
  isTransfer: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().optional(),
});

export type CreateSingleTransactionInput = z.infer<typeof createSingleTransactionSchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type CreateSplitInput = z.infer<typeof createSplitSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListFilters = z.infer<typeof listFiltersSchema>;
