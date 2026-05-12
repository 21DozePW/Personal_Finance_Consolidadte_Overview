import { z } from "zod";

export const userRoleSchema = z.enum(["ADMIN", "MEMBER"]);

export const inviteAllowedEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: "Enter a valid email address." })
    .max(254),
  intendedRole: userRoleSchema.default("MEMBER"),
});

export type InviteAllowedEmailInput = z.infer<typeof inviteAllowedEmailSchema>;
