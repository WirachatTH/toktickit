import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions } from "express";
import type { PrismaClient, Role } from "@prisma/client";

// Server-side sessions — docs/lab-03/specification.md BR-15 to BR-19, D-01, D-02.
//
// The browser holds an opaque random token; the database holds only its
// SHA-256. Nothing is signed, so there is no server secret to configure, leak,
// or commit: a token is valid only while its hash is in the Session table, and
// deleting the row is what logging out means.

export const SESSION_COOKIE = "tt_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // BR-17, D-10
const TOKEN_BYTES = 32;

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

// SHA-256 rather than a slow hash: the token is 256 bits of randomness, not a
// guessable password (D-02).
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

// An expired session is treated exactly as no session (BR-17).
export function isSessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

// BR-16 — HttpOnly so client JavaScript can never read it; SameSite=Strict so
// the browser never sends it on a request started from another site; scoped to
// /api; Secure everywhere except plain-HTTP local development.
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "strict",
    path: "/api",
    maxAge: SESSION_TTL_MS,
    secure: process.env.NODE_ENV === "production",
  };
}

// The user shape every auth response carries (api-spec §0.6). Never the hash.
export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
}

export const SESSION_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
} as const;

export async function createSession(prisma: PrismaClient, userId: number): Promise<{ token: string; id: number }> {
  const token = generateSessionToken();
  const row = await prisma.session.create({
    data: { tokenHash: hashSessionToken(token), userId, expiresAt: sessionExpiry() },
    select: { id: true },
  });
  return { token, id: row.id };
}

// The session behind a cookie value, or null when there is none to honour: an
// unknown token, an expired one (deleted on sight), or one whose user is no
// longer active (deactivation also deletes sessions, BR-59; this is the backstop).
export async function findSession(
  prisma: PrismaClient,
  token: string,
): Promise<{ sessionId: number; user: SessionUser } | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { id: true, expiresAt: true, user: { select: SESSION_USER_SELECT } },
  });
  if (!session) return null;
  if (isSessionExpired(session.expiresAt)) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (!session.user.isActive) return null;
  return { sessionId: session.id, user: session.user };
}

export async function deleteSessionByToken(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

// BR-19 — after a password change only the session that made it survives.
export async function deleteOtherSessions(prisma: PrismaClient, userId: number, keepSessionId: number): Promise<void> {
  await prisma.session.deleteMany({ where: { userId, id: { not: keepSessionId } } });
}

// BR-17 — a successful login sweeps that user's expired rows.
export async function deleteExpiredSessions(prisma: PrismaClient, userId: number, now: Date = new Date()): Promise<void> {
  await prisma.session.deleteMany({ where: { userId, expiresAt: { lte: now } } });
}
