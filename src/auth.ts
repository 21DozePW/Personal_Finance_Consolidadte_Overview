/**
 * Full server-side Auth.js setup. Imported by route handlers, server
 * components, and server actions. Adds DB-touching callbacks on top of the
 * Edge-safe `authConfig`.
 */

import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/db";
import type { UserRole } from "@prisma/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,

    /**
     * Allow-list enforcement. The ONLY place where a Google OAuth identity is
     * permitted to become a `User`. Any email not present in `AllowedEmail`
     * is rejected with a generic redirect to /signin/error.
     */
    async signIn({ user, profile }) {
      const email = user.email?.toLowerCase().trim();
      const sub = profile?.sub;
      if (!email || !sub) return false;

      let allowed = await prisma.allowedEmail.findUnique({ where: { email } });

      // First-deploy self-bootstrap: the email in ADMIN_BOOTSTRAP_EMAIL is
      // auto-allow-listed as ADMIN the first time it signs in, so a fresh
      // deploy needs no manual seed step against the production database.
      // Only fires when the allow-list is completely empty (no users yet),
      // so it can't silently re-grant access after the owner revokes someone.
      if (!allowed) {
        const bootstrap = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase().trim();
        if (bootstrap && bootstrap === email) {
          const userCount = await prisma.user.count();
          if (userCount === 0) {
            allowed = await prisma.allowedEmail.create({
              data: { email, intendedRole: "ADMIN" },
            });
          }
        }
      }
      if (!allowed) return false;

      const existing = await prisma.user.findUnique({ where: { googleSub: sub } });
      if (existing) {
        if (!existing.isActive) return false;
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            lastLoginAt: new Date(),
            // Refresh profile bits in case Google changed them.
            displayName: user.name ?? existing.displayName,
            avatarUrl: user.image ?? existing.avatarUrl,
          },
        });
        return true;
      }

      // First sign-in. Create the User, link the allow-list row.
      const created = await prisma.user.create({
        data: {
          googleSub: sub,
          email,
          displayName: user.name ?? email,
          avatarUrl: user.image ?? null,
          role: allowed.intendedRole,
          lastLoginAt: new Date(),
        },
      });
      await prisma.allowedEmail.update({
        where: { email },
        data: { consumedByUserId: created.id },
      });
      return true;
    },

    /**
     * Stamps role + userId into the JWT on initial sign-in. Subsequent
     * requests re-use the token; the role only refreshes when the JWT is
     * re-issued (every `updateAge`).
     */
    async jwt({ token, trigger }) {
      const shouldRefresh = trigger === "signIn" || trigger === "update" || !token.role;
      if (!shouldRefresh) return token;

      const email = token.email?.toLowerCase();
      if (!email) return token;

      const dbUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true, isActive: true },
      });
      if (!dbUser || !dbUser.isActive) {
        // Invalidate by clearing identifying fields; authorized() will reject.
        delete token.userId;
        delete token.role;
        return token;
      }

      token.userId = dbUser.id;
      token.role = dbUser.role as UserRole;
      return token;
    },
  },
});
