import { z } from "zod";

export const institutionTypeSchema = z.enum(["BANK", "BROKERAGE", "LENDER", "LEASING_CO", "OTHER"]);

export const upsertInstitutionSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  type: institutionTypeSchema,
  country: z
    .union([
      z.string().trim().length(2, "Use a 2-letter country code."),
      z.literal(""),
      z.null(),
      z.undefined(),
    ])
    .transform((v) => (v == null || v === "" ? null : v.toString().toUpperCase())),
  website: z
    .union([z.string().trim().url("Must be a valid URL."), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v == null || v === "" ? null : v)),
});

export const updateInstitutionSchema = upsertInstitutionSchema.partial();

export type UpsertInstitutionInput = z.infer<typeof upsertInstitutionSchema>;
export type UpdateInstitutionInput = z.infer<typeof updateInstitutionSchema>;
