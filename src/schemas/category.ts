import { z } from "zod";

export const categoryKindSchema = z.enum(["INCOME", "EXPENSE", "TRANSFER"]);

const nullableString = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v == null || v === "" ? null : v.toString()));

export const upsertCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  kind: categoryKindSchema,
  parentCategoryId: nullableString(64),
  color: nullableString(16),
  icon: nullableString(32),
});

export const updateCategorySchema = upsertCategorySchema
  .extend({
    isArchived: z
      .union([z.boolean(), z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === true || v === "true")),
  })
  .partial();

export type UpsertCategoryInput = z.infer<typeof upsertCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
