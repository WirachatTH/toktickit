import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";

// BR-07/BR-10 — every Requester-scoped route needs this identical check
// (header present, numeric, resolves to an active Requester). Shared so it's
// enforced identically everywhere rather than five slightly different copies.
export async function authenticateRequester(
  prisma: PrismaClient,
  req: Request
): Promise<{ requesterId: number } | null> {
  const header = req.header("X-Dev-Requester-Id");
  if (!header) return null;
  const requesterId = Number(header);
  if (!Number.isSafeInteger(requesterId) || requesterId <= 0 || requesterId > 2147483647) return null;

  const requester = await prisma.user.findUnique({ where: { id: requesterId } });
  // Lab 3: an IT Staff or Administrator id is not a Requester, so it is refused
  // exactly like a missing one — the dev header must never let a staff account
  // act as a Requester before Issue 5 removes it.
  if (!requester || !requester.isActive || requester.role !== "REQUESTER") return null;

  return { requesterId };
}
