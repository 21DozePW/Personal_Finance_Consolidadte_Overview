/**
 * Edge-safe Auth.js configuration.
 *
 * This config is imported by `middleware.ts` (which runs on the Edge runtime
 * and therefore cannot use Prisma). The full server config in `auth.ts`
 * extends it with database-touching callbacks (`signIn`, `jwt`).
 */

import type { NextAuthConfig, Session } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  pages: {
    signIn: "/signin",
    error: "/signin/error",
  },
  session: {
    strategy: "jwt",
    // 30-day rolling sessions with 1-day refresh, per spec §4.8.
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  callbacks: {
    /**
     * Runs in middleware on every request that matches the matcher. The
     * `auth` object is derived from the JWT cookie — no DB access here.
     */
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isLoggedIn = !!auth?.user;

      const isAdminArea = path.startsWith("/admin") || path.startsWith("/api/admin");
      if (isAdminArea) {
        if (!isLoggedIn) return false;
        return auth?.user?.role === "ADMIN";
      }

      // All other matched routes simply require a session.
      return isLoggedIn;
    },
    /**
     * Copies role + userId from the JWT into the session.user shape so
     * `auth()` consumers (pages, route handlers, middleware) can read
     * `session.user.role` directly.
     */
    session({ session, token }) {
      if (session.user) {
        if (typeof token.role === "string") {
          session.user.role = token.role as Session["user"]["role"];
        }
        if (typeof token.userId === "string") {
          session.user.id = token.userId;
        }
      }
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
