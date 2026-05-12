/**
 * Server-side authentication & authorization helpers.
 *
 * `requireSession` / `requireAdmin` are for server components and server
 * actions — they redirect on failure (which is what user-facing flows want).
 *
 * `getApiSession` / `requireApiAdmin` are for route handlers — they return a
 * Response on failure so the caller can short-circuit without throwing.
 *
 * Both variants re-check `User.isActive` against the database so a revoked
 * member is locked out even if their JWT cookie is still valid.
 */

import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { UserRole } from "@prisma/client";

export type AuthedSession = Session & {
  user: NonNullable<Session["user"]> & { id: string; role: UserRole };
};

async function loadActiveUser(session: Session | null) {
  if (!session?.user?.id) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, isActive: true },
  });
  if (!dbUser || !dbUser.isActive) return null;
  // Trust the DB role over whatever was in the JWT.
  session.user.role = dbUser.role;
  return session as AuthedSession;
}

export async function requireSession(): Promise<AuthedSession> {
  const session = await auth();
  const authed = await loadActiveUser(session);
  if (!authed) redirect("/signin");
  return authed;
}

export async function requireAdmin(): Promise<AuthedSession> {
  const session = await requireSession();
  if (session.user.role !== UserRole.ADMIN) redirect("/dashboard");
  return session;
}

export async function getApiSession(): Promise<AuthedSession | NextResponse> {
  const session = await auth();
  const authed = await loadActiveUser(session);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return authed;
}

export async function requireApiAdmin(): Promise<AuthedSession | NextResponse> {
  const result = await getApiSession();
  if (result instanceof NextResponse) return result;
  if (result.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return result;
}
