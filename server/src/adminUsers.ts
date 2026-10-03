import type { Express, NextFunction, Request, Response } from "express";
import type { Prisma, Role } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { isValidId, sessionUser } from "./authorization.js";
import { hashPassword, passwordRuleError } from "./password.js";
import { SESSION_USER_SELECT } from "./session.js";

// Lab 3, Issue 9 — Administrator user management (docs/lab-03/api-spec.md §6,
// specification.md BR-53 to BR-60, BR-81). Only Administrators reach these
// handlers (route policies in authorization.ts). There is no delete route:
// deactivation is how an account is retired (BR-59).

const ROLES: readonly Role[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIST_SELECT = { ...SESSION_USER_SELECT, lastLoginAt: true, createdAt: true } as const;

class Refusal extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields?: Record<string, string>) {
    super(message);
  }
}
class LockPlanChanged extends Error {}

const invalid = (fields: Record<string, string>) => new Refusal(400, "VALIDATION_ERROR", "Some fields need attention.", fields);
const emailTaken = () => new Refusal(409, "EMAIL_TAKEN", "Another user already has this email.", { email: "Another user already has this email." });
const notFound = () => new Refusal(404, "NOT_FOUND", "User not found.");

type Fields = { name?: string; email?: string; role?: Role; isActive?: boolean; initialPassword?: string };

// BR-53 to BR-55 — each field present is checked; `required` lists the ones
// that must be present. Names and emails are trimmed; emails are lowercased (BR-09).
function readFields(body: Record<string, unknown>, required: (keyof Fields)[]): Fields {
  const out: Fields = {};
  const errors: Record<string, string> = {};
  const has = (k: keyof Fields) => k in body || required.includes(k);
  if (has("name")) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 100) errors.name = "Enter a name of 2 to 100 characters.";
    else out.name = name;
  }
  if (has("email")) {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL.test(email) || email.length > 254) errors.email = "Enter a valid email address.";
    else out.email = email;
  }
  if (has("role")) {
    if (!ROLES.includes(body.role as Role)) errors.role = "Choose Requester, IT Staff, or Administrator.";
    else out.role = body.role as Role;
  }
  if (has("isActive")) {
    if (typeof body.isActive !== "boolean") errors.isActive = "Choose active or inactive.";
    else out.isActive = body.isActive;
  }
  if (has("initialPassword")) {
    const password = typeof body.initialPassword === "string" ? body.initialPassword : "";
    const rule = password === "" ? "Enter an initial password." : passwordRuleError(password, out.email ?? (typeof body.email === "string" ? body.email.trim() : ""));
    if (rule) errors.initialPassword = rule;
    else out.initialPassword = password;
  }
  if (Object.keys(errors).length > 0) throw invalid(errors);
  return out;
}

async function emailInUse(tx: Prisma.TransactionClient, email: string, exceptId?: number) {
  const other = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  return other !== null;
}

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

type Handler = (req: Request, res: Response) => Promise<unknown>;
const handle = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof Refusal) {
      const body: Record<string, unknown> = { code: error.code, message: error.message };
      if (error.fields) body.fields = error.fields;
      return res.status(error.status).json({ error: body });
    }
    if (isUniqueViolation(error)) return res.status(409).json({ error: { code: "EMAIL_TAKEN", message: "Another user already has this email.", fields: { email: "Another user already has this email." } } });
    return next(error);
  }
};

function targetId(req: Request): number {
  const id = Number(req.params.id);
  if (!isValidId(id)) throw notFound();
  return id;
}

// §6.1 — search name or email, optional role; by name, then id. No paging (§8.5).
const listUsers = handle(async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const role = ROLES.includes(req.query.role as Role) ? (req.query.role as Role) : undefined;
  const data = await getPrisma().user.findMany({
    where: {
      ...(role ? { role } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {}),
    },
    select: LIST_SELECT,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ data });
});

// §6.2 — the new user must change the initial password at first sign-in (BR-55).
const createUser = handle(async (req, res) => {
  const f = readFields((req.body ?? {}) as Record<string, unknown>, ["name", "email", "role", "isActive", "initialPassword"]);
  const prisma = getPrisma();
  if (await emailInUse(prisma, f.email!)) throw emailTaken();
  const user = await prisma.user.create({
    data: { name: f.name!, email: f.email!, role: f.role!, isActive: f.isActive!, passwordHash: await hashPassword(f.initialPassword!), mustChangePassword: true },
    select: SESSION_USER_SELECT,
  });
  return res.status(201).json(user);
});

// §6.3 — name, email, role, activation. Password fields are never read here.
const updateUser = handle(async (req, res) => {
  const id = targetId(req);
  const caller = sessionUser(req);
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound();
  const body = (req.body ?? {}) as Record<string, unknown>;
  const allowed = Object.fromEntries(Object.entries(body).filter(([k]) => ["name", "email", "role", "isActive"].includes(k)));
  const f = readFields(allowed, []);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const user = await prisma.$transaction(async (tx) => {
        const before = await tx.user.findUniqueOrThrow({ where: { id }, select: { role: true, isActive: true } });
        const roleChanges = f.role !== undefined && f.role !== before.role;
        const deactivates = f.isActive === false && before.isActive;
        // BR-57 — never one's own role or activation.
        if (id === caller.id && (roleChanges || deactivates)) {
          throw new Refusal(409, "SELF_CHANGE_FORBIDDEN", "You can't change your own role or deactivate your own account.");
        }
        // BR-81 — one lock order for the whole system. A change that could take
        // away an active Administrator locks the target and every active
        // Administrator in ONE statement, in ascending id order; any other
        // change locks only the target. The plan is made from an unlocked read
        // and re-checked under the locks; if it no longer fits, start over
        // rather than take more locks out of order.
        const affectsAdmins = roleChanges || deactivates;
        const lockAdmins = affectsAdmins && before.role === "ADMINISTRATOR" && before.isActive;
        const rows = lockAdmins
          ? await tx.$queryRaw<{ id: number; role: Role; isActive: boolean }[]>`
              SELECT id, role, "isActive" FROM "User"
              WHERE id = ${id} OR (role = 'ADMINISTRATOR' AND "isActive")
              ORDER BY id FOR UPDATE`
          : await tx.$queryRaw<{ id: number; role: Role; isActive: boolean }[]>`
              SELECT id, role, "isActive" FROM "User" WHERE id = ${id} FOR UPDATE`;
        const locked = rows.find((r) => r.id === id)!;
        if (locked.role !== before.role || locked.isActive !== before.isActive) throw new LockPlanChanged();

        if (f.email !== undefined && (await emailInUse(tx, f.email, id))) throw emailTaken();
        // BR-58 — never zero active Administrators, counted under the locks.
        if (lockAdmins && !rows.some((r) => r.id !== id && r.role === "ADMINISTRATOR" && r.isActive)) {
          throw new Refusal(409, "LAST_ADMINISTRATOR", "TokTickIT must keep at least one active Administrator.");
        }
        // BR-60 — not a Requester while owning open tickets (deactivation is fine, BR-29).
        if (roleChanges && f.role === "REQUESTER") {
          const open = await tx.ticket.count({ where: { ownerId: id, currentStatus: { notIn: ["CLOSED", "CANCELLED"] } } });
          if (open > 0) throw new Refusal(409, "OWNS_OPEN_TICKETS", "Reassign this user's open tickets before making them a Requester.");
        }
        const updated = await tx.user.update({ where: { id }, data: f, select: SESSION_USER_SELECT });
        // BR-59 — deactivation and a role change end every session at once.
        if (roleChanges || deactivates) await tx.session.deleteMany({ where: { userId: id } });
        return updated;
      });
      return res.status(200).json(user);
    } catch (error) {
      if (error instanceof LockPlanChanged) continue;
      throw error;
    }
  }
  throw new Error("User changed repeatedly while being updated.");
});

// §6.4 — a new initial password: forces a change at next sign-in and ends
// every session (BR-56). One's own password goes through Change Password.
const setInitialPassword = handle(async (req, res) => {
  const id = targetId(req);
  const prisma = getPrisma();
  const target = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!target) throw notFound();
  const f = readFields({ initialPassword: (req.body ?? {}).initialPassword, email: target.email }, ["initialPassword"]);
  if (id === sessionUser(req).id) {
    throw new Refusal(409, "SELF_CHANGE_FORBIDDEN", "Change your own password with Change password.");
  }
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(f.initialPassword!), mustChangePassword: true },
      select: SESSION_USER_SELECT,
    });
    await tx.session.deleteMany({ where: { userId: id } });
    return updated;
  });
  return res.status(200).json(user);
});

export function registerAdminUserRoutes(app: Express) {
  app.get("/api/admin/users", listUsers);
  app.post("/api/admin/users", createUser);
  app.patch("/api/admin/users/:id", updateUser);
  app.post("/api/admin/users/:id/initial-password", setInitialPassword);
}
