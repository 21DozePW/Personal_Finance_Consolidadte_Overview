import { z } from "zod";

export const balanceSourceSchema = z.enum(["MANUAL", "CSV_IMPORT", "COMPUTED", "API"]);

export const recordBalanceSchema = z.object({
  asOfDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  amount: z.string().trim().min(1, "Amount is required."),
  source: balanceSourceSchema.default("MANUAL"),
});

export type RecordBalanceInput = z.infer<typeof recordBalanceSchema>;
