import { z } from "zod";

const sourceRef = z.object({ source: z.string().trim().min(1).max(120) });

export const columnMapSchema = z
  .object({
    date: sourceRef,
    description: sourceRef.optional(),
    amount: sourceRef.optional(),
    debit: sourceRef.optional(),
    credit: sourceRef.optional(),
    externalId: sourceRef.optional(),
    balance: sourceRef.optional(),
    merchant: sourceRef.optional(),
  })
  .refine((v) => !!(v.amount || (v.debit && v.credit)), {
    message: "Either `amount`, or both `debit` and `credit`, must be mapped.",
  });

export const upsertImportProfileSchema = z.object({
  institutionId: z.string().min(1, "Pick an institution."),
  name: z.string().trim().min(1, "Name is required.").max(80),
  columnMap: columnMapSchema,
  dateFormat: z.string().trim().min(4).max(20),
  decimalSeparator: z.enum([".", ","]),
});

export const startImportSchema = z.object({
  accountId: z.string().min(1, "Pick an account."),
  fileName: z.string().trim().min(1).max(200),
  format: z.enum(["CSV", "OFX"]),
  // Either the saved profileId or an ad-hoc parse spec; OFX needs neither.
  profileId: z.string().optional(),
  columnMap: columnMapSchema.optional(),
  dateFormat: z.string().trim().min(4).max(20).optional(),
  decimalSeparator: z.enum([".", ","]).optional(),
});

export type ColumnMapInput = z.infer<typeof columnMapSchema>;
export type UpsertImportProfileInput = z.infer<typeof upsertImportProfileSchema>;
export type StartImportInput = z.infer<typeof startImportSchema>;
