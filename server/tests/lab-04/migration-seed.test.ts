import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { ThrowawaySchema, migrationFiles, runPrisma } from "../lab-03/helpers/throwawaySchema.js";
import { seed, TICKETS } from "../../prisma/seed.js";

// MIG-01 to MIG-07 — the Lab 4 migration, its rollback, and the seed
// (docs/lab-04/specification.md §7.5, §7.6, BR-47 to BR-49). Every test runs in
// a throwaway schema (Lab 3 D-22); the shared development database is never touched.

const SLOW = 240_000;
const files = migrationFiles();
const LAB4_FILE = files.find((f) => path.basename(path.dirname(f)).includes("lab4"))!;
const BEFORE_LAB4 = files.slice(0, files.indexOf(LAB4_FILE));
const DOWN_FILE = path.join(path.dirname(path.dirname(path.dirname(LAB4_FILE))), "rollback", "lab4_down.sql");

const TABLES = ["Category", "RelatedSystem", "User", "Session", "Ticket", "Attachment", "PublicComment", "InternalNote"];

// Every row of every Lab 1–3 table, as JSON, so "nothing changed" means every
// column of every row — not a chosen few.
async function snapshot(db: PrismaClient, dropTicketKey?: string) {
  const out: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const rows = await db.$queryRawUnsafe<{ row: Record<string, unknown> }[]>(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY id`);
    out[table] = rows.map(({ row }) => {
      if (table === "Ticket" && dropTicketKey) {
        const { [dropTicketKey]: _dropped, ...rest } = row;
        return rest;
      }
      return row;
    });
  }
  return out;
}

async function loadLab3Data(db: PrismaClient) {
  const run = (sql: string) => db.$executeRawUnsafe(sql);
  await run(`INSERT INTO "Category" ("name") VALUES ('Hardware'), ('Network')`);
  await run(`INSERT INTO "RelatedSystem" ("name") VALUES ('Printer'), ('VPN')`);
  await run(`INSERT INTO "User" ("name", "email", "role", "isActive", "mustChangePassword", "updatedAt") VALUES
    ('Req One', 'req.one@kmutt.ac.th', 'REQUESTER', true, false, now()),
    ('Staff One', 'staff.one@kmutt.ac.th', 'IT_STAFF', true, false, now()),
    ('Admin One', 'admin.one@kmutt.ac.th', 'ADMINISTRATOR', true, false, now())`);
  const statuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
  for (const [i, status] of statuses.entries()) {
    const owner = status === "NEW" ? "NULL" : "2";
    const summary = status === "RESOLVED" || status === "CLOSED" ? "'Fixed by replacing the cable.'" : "NULL";
    await run(`INSERT INTO "Ticket" ("ticketNumber", "requesterId", "ownerId", "categoryId", "relatedSystemId", "summary", "description", "requestedPriority", "itPriority", "currentStatus", "resolutionSummary", "createdAt", "updatedAt")
      VALUES ('TCK-00000${i + 1}', 1, ${owner}, 1, 1, 'Ticket ${status}', 'A Lab 3 ticket in ${status}.', 'MEDIUM', 'HIGH', '${status}', ${summary}, now() - interval '${10 - i} days', now() - interval '${i} hours')`);
  }
  await run(`INSERT INTO "PublicComment" ("ticketId", "authorId", "body") VALUES (3, 1, 'Still broken.'), (3, 2, 'Working on it.')`);
  await run(`INSERT INTO "InternalNote" ("ticketId", "authorId", "body") VALUES (3, 2, 'Check the switch port.')`);
  await run(`INSERT INTO "Attachment" ("ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes") VALUES (3, 'cable.png', 'stored-cable.png', 'image/png', 900)`);
}

describe("the Lab 4 migration on Lab 3-shaped data (MIG-01, MIG-02, MIG-04)", () => {
  const schema = new ThrowawaySchema();
  let db: PrismaClient;
  let lab3: Record<string, unknown[]>;
  let afterUp: Record<string, unknown[]>;

  beforeAll(async () => {
    await schema.create();
    schema.applyMigrations(BEFORE_LAB4);
    db = schema.client();
    await loadLab3Data(db);
    lab3 = await snapshot(db);
    schema.applyFile(LAB4_FILE);
    afterUp = await snapshot(db);
  }, SLOW);

  afterAll(async () => {
    await schema.drop();
  }, SLOW);

  it("MIG-01 keeps every Lab 1–3 row and column except the new resolvedAt; legacy tickets have no actions", async () => {
    expect(await snapshot(db, "resolvedAt")).toEqual(lab3);
    expect(lab3.Ticket).toHaveLength(8);
    expect(await db.actionTaken.count()).toBe(0);
    expect(await db.actionTakenEvent.count()).toBe(0);
  });

  it("MIG-02 backfills resolvedAt from updatedAt for resolved and closed tickets only", async () => {
    const tickets = await db.ticket.findMany({ orderBy: { id: "asc" } });
    for (const t of tickets) {
      if (t.currentStatus === "RESOLVED" || t.currentStatus === "CLOSED") expect(t.resolvedAt, t.currentStatus).toEqual(t.updatedAt);
      else expect(t.resolvedAt, t.currentStatus).toBeNull();
    }
    expect(tickets.filter((t) => t.resolvedAt !== null)).toHaveLength(2);
  });

  it(
    "MIG-04 rolls back to exactly Lab 3, and applies again to the same result",
    async () => {
      const reference = new ThrowawaySchema();
      try {
        // Some Lab 4 data must not stop the rollback.
        await db.actionTaken.create({ data: { ticketId: 3, actionAt: new Date(), description: "Lab 4 row", assigneeId: 2, createdById: 2 } });
        schema.applyFile(DOWN_FILE);
        expect(await snapshot(db)).toEqual(lab3);

        // The schema itself is Lab 3's: no difference from a schema that never saw Lab 4.
        await reference.create();
        reference.applyMigrations(BEFORE_LAB4);
        const diff = runPrisma(["migrate", "diff", "--from-url", reference.url, "--to-url", schema.url, "--exit-code"]);
        expect(diff).toMatch(/No difference detected/);

        schema.applyFile(LAB4_FILE);
        expect(await snapshot(db)).toEqual(afterUp);
        expect(await db.actionTaken.count()).toBe(0);
      } finally {
        await reference.drop();
      }
    },
    SLOW,
  );
});

describe("MIG-03 — the migration matches schema.prisma", () => {
  it(
    "reports no drift once every migration is applied",
    async () => {
      const full = new ThrowawaySchema();
      try {
        await full.create();
        full.applyMigrations();
        const out = runPrisma(["migrate", "diff", "--from-url", full.url, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"]);
        expect(out).toMatch(/No difference detected/);
      } finally {
        await full.drop();
      }
    },
    SLOW,
  );
});

describe("the database backs up the rules (MIG-05) and the seed (MIG-06, MIG-07)", () => {
  const schema = new ThrowawaySchema();
  let db: PrismaClient;

  beforeAll(async () => {
    await schema.create();
    schema.applyMigrations();
    db = schema.client();
    await seed(db);
  }, SLOW);

  afterAll(async () => {
    await schema.drop();
  }, SLOW);

  it("MIG-05 rejects a completed action without a result or performer, a follow-up without a note, a cancelled action without a reason, and version 0", async () => {
    const ticket = await db.ticket.findFirstOrThrow({ where: { currentStatus: "IN_PROGRESS" } });
    const staff = await db.user.findFirstOrThrow({ where: { role: "IT_STAFF", isActive: true } });
    const insert = (columns: string, values: string) =>
      db.$executeRawUnsafe(
        `INSERT INTO "ActionTaken" ("ticketId", "actionAt", "description", "assigneeId", "createdById", "updatedAt"${columns}) VALUES (${ticket.id}, now(), 'Check', ${staff.id}, ${staff.id}, now()${values})`,
      );
    const before = await db.actionTaken.count();
    await expect(insert(`, "status"`, `, 'COMPLETED'`)).rejects.toThrow(/check constraint/i);
    await expect(insert(`, "status", "result"`, `, 'COMPLETED', 'Done'`)).rejects.toThrow(/check constraint/i);
    await expect(insert(`, "followUpRequired"`, `, true`)).rejects.toThrow(/check constraint/i);
    await expect(insert(`, "status"`, `, 'CANCELLED'`)).rejects.toThrow(/check constraint/i);
    await expect(insert(`, "version"`, `, 0`)).rejects.toThrow(/check constraint/i);
    await insert("", "");
    expect(await db.actionTaken.count()).toBe(before + 1);
    // Leave the seeded data as the seed made it, for MIG-06 and MIG-07.
    await db.actionTaken.deleteMany({ where: { description: "Check", ticketId: ticket.id } });
  });

  it("MIG-06 is idempotent and never changes an existing action", async () => {
    const count = async () => ({ actions: await db.actionTaken.count(), events: await db.actionTakenEvent.count(), tickets: await db.ticket.count() });
    const first = await count();
    const sample = await db.actionTaken.findFirstOrThrow({ where: { status: "PLANNED" } });
    await db.actionTaken.update({ where: { id: sample.id }, data: { description: "Changed by a demo", version: { increment: 1 } } });
    await seed(db);
    expect(await count()).toEqual(first);
    expect((await db.actionTaken.findUniqueOrThrow({ where: { id: sample.id } })).description).toBe("Changed by a demo");

    // A seed ticket a demo has moved on gets no actions, even with none left (BR-48):
    // planned work must never be added to a ticket a demo has since resolved.
    const moved = await db.ticket.findFirstOrThrow({ where: { summary: "Laptop fan runs loudly and the case gets hot" } });
    await db.actionTaken.deleteMany({ where: { ticketId: moved.id } });
    await db.ticket.update({ where: { id: moved.id }, data: { currentStatus: "RESOLVED" } });
    await seed(db);
    expect(await db.actionTaken.count({ where: { ticketId: moved.id } })).toBe(0);
    // Back in its seeded status with no actions, it gets them again.
    await db.ticket.update({ where: { id: moved.id }, data: { currentStatus: "OPEN" } });
    await seed(db);
    expect(await db.actionTaken.count({ where: { ticketId: moved.id } })).toBe(1);
  });

  it("MIG-07 seeds every case the dashboards and the gate need", async () => {
    const tickets = await db.ticket.findMany({ include: { actionsTaken: true } });
    expect(tickets).toHaveLength(TICKETS.length);
    const counts = tickets.map((t) => t.actionsTaken.length);
    expect(counts).toContain(0);
    expect(counts).toContain(1);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(4);

    const actions = tickets.flatMap((t) => t.actionsTaken);
    expect(new Set(actions.map((a) => a.status))).toEqual(new Set(["PLANNED", "COMPLETED", "CANCELLED"]));
    expect(actions.some((a) => a.attachmentNotes)).toBe(true);
    // Every action has its CREATED event, by its creator.
    expect(await db.actionTakenEvent.count({ where: { type: "CREATED" } })).toBe(actions.length);

    // Follow-ups: one handled by a completed follow-up, one still open.
    const needing = actions.filter((a) => a.status === "COMPLETED" && a.followUpRequired);
    const handled = (id: number) => actions.some((a) => a.followUpOfId === id && a.status === "COMPLETED");
    expect(needing.some((a) => handled(a.id))).toBe(true);
    expect(needing.some((a) => !handled(a.id))).toBe(true);

    // Assignees: an Administrator, and an IT Staff member deactivated since.
    const assignees = await db.user.findMany({ where: { id: { in: actions.map((a) => a.assigneeId) } } });
    expect(assignees.some((u) => u.role === "ADMINISTRATOR")).toBe(true);
    expect(assignees.some((u) => u.role === "IT_STAFF" && !u.isActive)).toBe(true);

    // Gate states among IN_PROGRESS tickets: resolvable, blocked by planned, blocked by an open follow-up.
    const gate = (ts: typeof tickets[number]) => {
      const a = ts.actionsTaken;
      const completed = a.filter((x) => x.status === "COMPLETED");
      const open = completed.filter((x) => x.followUpRequired && !a.some((y) => y.followUpOfId === x.id && y.status === "COMPLETED"));
      return { completed: completed.length, planned: a.filter((x) => x.status === "PLANNED").length, open: open.length };
    };
    const working = tickets.filter((t) => t.currentStatus === "IN_PROGRESS").map(gate);
    expect(working.some((g) => g.completed > 0 && g.planned === 0 && g.open === 0)).toBe(true);
    expect(working.some((g) => g.planned > 0)).toBe(true);
    expect(working.some((g) => g.planned === 0 && g.open > 0)).toBe(true);

    // Every resolved or closed ticket passes the gate and has a resolvedAt (BR-49), some within 7 days.
    for (const t of tickets.filter((x) => x.currentStatus === "RESOLVED" || x.currentStatus === "CLOSED")) {
      expect(gate(t), t.summary).toMatchObject({ planned: 0, open: 0 });
      expect(gate(t).completed, t.summary).toBeGreaterThan(0);
      expect(t.resolvedAt, t.summary).not.toBeNull();
    }
    expect(tickets.some((t) => t.resolvedAt && Date.now() - t.resolvedAt.getTime() < 7 * 86_400_000)).toBe(true);

    // Every action obeys the rules the API enforces.
    for (const a of actions) {
      const ticket = tickets.find((t) => t.id === a.ticketId)!;
      expect(a.actionAt.getTime(), a.description).toBeGreaterThanOrEqual(ticket.createdAt.getTime());
      if (a.status === "COMPLETED") expect(a.actionAt.getTime()).toBeLessThanOrEqual(Date.now());
      if (a.followUpOfId) expect(actions.find((x) => x.id === a.followUpOfId)?.ticketId).toBe(a.ticketId);
    }

    // Zero and non-zero "my" metrics: an active IT Staff member with planned actions, and an Administrator with none.
    const plannedBy = new Set(actions.filter((a) => a.status === "PLANNED").map((a) => a.assigneeId));
    const staff = await db.user.findMany({ where: { role: "IT_STAFF", isActive: true } });
    expect(staff.some((u) => plannedBy.has(u.id))).toBe(true);
    const krit = await db.user.findUniqueOrThrow({ where: { email: "krit.wattana@kmutt.ac.th" } });
    expect(plannedBy.has(krit.id)).toBe(false);
    expect(tickets.some((t) => t.ownerId === krit.id)).toBe(false);
  });

  it("MIG-07 dates planned work ahead and finished work in the past, even on tickets seeded long ago", async () => {
    // A database seeded in Lab 3: the same tickets, a month older, without actions yet.
    await db.actionTaken.deleteMany({});
    await db.$executeRawUnsafe(`UPDATE "Ticket" SET "createdAt" = "createdAt" - interval '30 days', "updatedAt" = "updatedAt" - interval '30 days'`);
    await seed(db);
    const actions = await db.actionTaken.findMany({ include: { ticket: true } });
    expect(actions.length).toBeGreaterThan(0);
    const now = Date.now();
    for (const a of actions) {
      if (a.status === "PLANNED") expect(a.actionAt.getTime(), a.description).toBeGreaterThan(now);
      else expect(a.actionAt.getTime(), a.description).toBeLessThanOrEqual(now);
      expect(a.actionAt.getTime(), a.description).toBeGreaterThanOrEqual(a.ticket.createdAt.getTime());
    }
  });
});
