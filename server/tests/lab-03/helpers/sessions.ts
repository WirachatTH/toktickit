import type { PrismaClient } from "@prisma/client";
import { createSession, SESSION_COOKIE } from "../../../src/session.js";

// Signs a user in for a test without going through POST /api/auth/login: the
// session row is created directly, exactly as a successful login would, so a
// suite needs no password and never touches the login throttle (BR-14).
//
// Every session made here is remembered and removed by endTestSessions(), so a
// suite deletes only its own sessions — never those of a developer signed in
// as the same account in a browser.

const created: number[] = [];

/** The `Cookie` header value for a fresh session belonging to `userId`. */
export async function sessionCookieFor(prisma: PrismaClient, userId: number): Promise<string> {
  const { token, id } = await createSession(prisma, userId);
  created.push(id);
  return `${SESSION_COOKIE}=${token}`;
}

/** One session per user id, for suites that switch between several Requesters. */
export async function sessionCookiesFor(prisma: PrismaClient, userIds: number[]): Promise<Map<number, string>> {
  const cookies = new Map<number, string>();
  for (const id of userIds) cookies.set(id, await sessionCookieFor(prisma, id));
  return cookies;
}

export async function endTestSessions(prisma: PrismaClient): Promise<void> {
  await prisma.session.deleteMany({ where: { id: { in: created.splice(0) } } });
}
