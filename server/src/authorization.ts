import type { NextFunction, Request, Response } from "express";
import type { Prisma, PrismaClient, Role } from "@prisma/client";
import type { SessionUser } from "./session.js";

// Lab 3, Issue 4 — the single authorization point (docs/lab-03/specification.md
// BR-20 to BR-27, api-spec.md §0.2, §0.3, §7).
//
// Every route the API answers is listed in ROUTE_POLICIES, and one middleware
// applies the list before any handler runs, in the BR-22 order:
//
//   1. cross-origin guard        → 403 FORBIDDEN_ORIGIN   (rejectForeignOrigin)
//   2. session                   → 401 UNAUTHENTICATED    (authorize)
//   3. mandatory password change → 403 PASSWORD_CHANGE_REQUIRED
//   4. role                      → 403 FORBIDDEN
//   5. ownership                 → 404 NOT_FOUND          (findAccessibleTicket, in the handler)
//
// A request that matches no policy never reaches a handler: it is a 404. So a
// handler added to app.ts without a policy is unreachable rather than
// unguarded, and SEC-13 fails until it is classified. Hiding a control in the
// client is feedback for a person, never this boundary (BR-27).

export type Access =
  | { kind: "public" } // no session needed; the route never acts through one (D-18)
  | { kind: "optional" } // works with or without a session (logout, BR-18)
  | { kind: "any"; duringPasswordChange?: true } // any signed-in role
  | { kind: "roles"; roles: readonly Role[] };

export interface RoutePolicy {
  method: "GET" | "POST" | "PATCH";
  path: string;
  access: Access;
}

const PUBLIC: Access = { kind: "public" };
const roles = (...list: Role[]): Access => ({ kind: "roles", roles: list });
const R: Role = "REQUESTER";
const S: Role = "IT_STAFF";
const A: Role = "ADMINISTRATOR";

// api-spec §7, row for row. Routes whose handlers arrive in later issues
// (comments, notes, the staff and admin screens) are guarded already: the
// right role passes and gets 404 until the handler exists.
export const ROUTE_POLICIES: readonly RoutePolicy[] = [
  { method: "GET", path: "/api/health", access: PUBLIC },
  { method: "POST", path: "/api/auth/login", access: PUBLIC },
  { method: "POST", path: "/api/auth/logout", access: { kind: "optional" } },
  { method: "GET", path: "/api/auth/me", access: { kind: "any", duringPasswordChange: true } },
  { method: "POST", path: "/api/auth/change-password", access: { kind: "any", duringPasswordChange: true } },
  { method: "GET", path: "/api/categories", access: PUBLIC },
  { method: "GET", path: "/api/systems", access: PUBLIC },

  { method: "POST", path: "/api/tickets", access: roles(R) },
  { method: "GET", path: "/api/tickets", access: roles(R) },
  { method: "GET", path: "/api/tickets/:id", access: roles(R) },
  { method: "POST", path: "/api/tickets/:id/attachments", access: roles(R) },
  { method: "GET", path: "/api/tickets/:ticketId/attachments/:attachmentId", access: roles(R, S, A) },
  { method: "GET", path: "/api/tickets/:ticketId/attachments/:attachmentId/download", access: roles(R, S, A) },
  { method: "PATCH", path: "/api/tickets/:ticketId/attachments/:attachmentId/remove", access: roles(R) },
  { method: "POST", path: "/api/tickets/:id/appears-resolved", access: roles(R) },
  { method: "GET", path: "/api/tickets/:id/comments", access: roles(R, S, A) },
  { method: "POST", path: "/api/tickets/:id/comments", access: roles(R, S) },
  { method: "GET", path: "/api/tickets/:id/internal-notes", access: roles(S, A) },
  { method: "POST", path: "/api/tickets/:id/internal-notes", access: roles(S) },

  { method: "GET", path: "/api/staff/tickets", access: roles(S, A) },
  { method: "GET", path: "/api/staff/tickets/:id", access: roles(S, A) },
  { method: "GET", path: "/api/staff/assignable-users", access: roles(S, A) },
  { method: "PATCH", path: "/api/staff/tickets/:id/owner", access: roles(S) },
  { method: "PATCH", path: "/api/staff/tickets/:id/it-priority", access: roles(S) },
  { method: "PATCH", path: "/api/staff/tickets/:id/status", access: roles(S) },

  { method: "GET", path: "/api/admin/users", access: roles(A) },
  { method: "POST", path: "/api/admin/users", access: roles(A) },
  { method: "PATCH", path: "/api/admin/users/:id", access: roles(A) },
  { method: "POST", path: "/api/admin/users/:id/initial-password", access: roles(A) },
];

// Matched the way Express matches a route: case-insensitively, one path
// segment per parameter, an optional trailing slash.
const COMPILED = ROUTE_POLICIES.map((policy) => {
  const pattern = policy.path
    .split("/")
    .map((segment) => (segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return { policy, regex: new RegExp(`^${pattern}/?$`, "i") };
});

export function findPolicy(method: string, path: string): RoutePolicy | undefined {
  const wanted = method === "HEAD" ? "GET" : method; // Express answers HEAD with the GET route
  return COMPILED.find(({ policy, regex }) => policy.method === wanted && regex.test(path))?.policy;
}

function sendError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

export const NOT_FOUND_MESSAGE = "The requested resource was not found.";

// Steps 2–4. Runs after attachSession has resolved the cookie into req.auth.
export function authorize(req: Request, res: Response, next: NextFunction) {
  const policy = findPolicy(req.method, req.path);
  if (!policy) return sendError(res, 404, "NOT_FOUND", NOT_FOUND_MESSAGE);

  const { access } = policy;
  if (access.kind === "public" || access.kind === "optional") return next();

  const user = req.auth?.user;
  if (!user) return sendError(res, 401, "UNAUTHENTICATED", "Sign in to continue.");

  // BR-02 — a session that still has an initial password may only read who it
  // is, change the password, or log out.
  if (user.mustChangePassword && !(access.kind === "any" && access.duringPasswordChange)) {
    return sendError(res, 403, "PASSWORD_CHANGE_REQUIRED", "Set a new password before using the rest of TokTickIT.");
  }

  // BR-25 — the role is checked before anything is looked up, so a refusal
  // says nothing about whether the resource exists.
  if (access.kind === "roles" && !access.roles.includes(user.role)) {
    return sendError(res, 403, "FORBIDDEN", "You don't have permission to do that.");
  }
  return next();
}

// Step 1 — BR-26. Runs before the session is read or the body parsed.
const STATE_CHANGING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function rejectForeignOrigin(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    if (!STATE_CHANGING.has(req.method)) return next();
    const origin = req.headers.origin;
    // No Origin header: not a browser acting for another site (api-spec §0.2).
    // "null" (sandboxed frames, some redirects) is a present, foreign origin.
    if (origin === undefined || allowed.has(origin)) return next();
    return sendError(res, 403, "FORBIDDEN_ORIGIN", "This request did not come from TokTickIT.");
  };
}

/** The signed-in user of a request that authorize() has admitted. */
export function sessionUser(req: Request): SessionUser {
  const user = req.auth?.user;
  // authorize() admits no protected request without a session, so this can only
  // mean a route was classified as public by mistake; fail closed (500).
  if (!user) throw new Error("A protected handler ran without a session.");
  return user;
}

// Postgres ids are Int32; anything else can never name a row.
export function isValidId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
}

// Step 5 — BR-24. Which tickets a user may reach: a Requester only their own,
// IT Staff and Administrators any (their role check already ran). A ticket
// outside that set is answered exactly like one that does not exist.
export function accessibleTicketWhere(user: SessionUser, ticketId: number): Prisma.TicketWhereInput {
  return user.role === "REQUESTER" ? { id: ticketId, requesterId: user.id } : { id: ticketId };
}

export async function findAccessibleTicket(prisma: PrismaClient, user: SessionUser, ticketId: number) {
  if (!isValidId(ticketId)) return null;
  return prisma.ticket.findFirst({ where: accessibleTicketWhere(user, ticketId) });
}

// The end of the chain (§6.2). A route with a policy but no handler yet, and
// an error no handler caught, both answer in the usual envelope.
export function notFound(_req: Request, res: Response) {
  return sendError(res, 404, "NOT_FOUND", NOT_FOUND_MESSAGE);
}

const BODY_ERRORS: Record<number, [string, string]> = {
  400: ["VALIDATION_ERROR", "The request body could not be read."],
  413: ["PAYLOAD_TOO_LARGE", "The request body is too large."],
  415: ["UNSUPPORTED_MEDIA_TYPE", "The request body's encoding is not supported."],
};

export function safeErrors(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(error);
  // body-parser marks its own failures — malformed JSON, a body over the limit,
  // an unknown charset — with a 4xx status. Those are the client's mistake.
  const status = (error as { status?: unknown; type?: unknown } | null)?.status;
  const fromBodyParser = typeof (error as { type?: unknown } | null)?.type === "string";
  if (fromBodyParser && typeof status === "number" && status >= 400 && status < 500) {
    const [code, message] = BODY_ERRORS[status] ?? BODY_ERRORS[400];
    return sendError(res, status in BODY_ERRORS ? status : 400, code, message);
  }
  return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
}
