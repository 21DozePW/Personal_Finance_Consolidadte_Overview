/**
 * Edge middleware: gates routes based on the JWT cookie.
 *
 * We import the Edge-safe `authConfig` here (not `auth.ts`) because middleware
 * runs on the Edge runtime and cannot use Prisma. Route authorization is
 * decided in `authConfig.callbacks.authorized`.
 */

import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run middleware on everything except Next internals, static assets, the
  // sign-in pages, and the auth + cron API surfaces (the cron route has its
  // own shared-secret check).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|signin|api/auth|api/cron).*)",
  ],
};
