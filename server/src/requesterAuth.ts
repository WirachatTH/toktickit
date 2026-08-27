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
  const requesterId = Number(header);
  if (!header || !Number.isFinite(requesterId)) return null;

  const requester = await prisma.requesterUser.findUnique({ where: { id: requesterId } });
  if (!requester || !requester.isActive) return null;

  return { requesterId };
}
