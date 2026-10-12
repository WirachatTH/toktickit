import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { ThrowawaySchema, migrationFiles, runPrisma } from "./helpers/throwawaySchema.js";
import { verifyPassword } from "../../src/password.js";
import { seed, ACCOUNTS, TICKETS, SEED_PASSWORD, FIRST_LOGIN_EMAIL } from "../../prisma/seed.js";

// MIG-01 to MIG-09 — the Lab 3 migration and seed (docs/lab-03/specification.md
// §7.5, §7.6, BR-72 to BR-79). Every test here runs in a throwaway schema
// (D-22); the shared development database is never touched.

const SLOW = 180_000;
const files = migrationFiles();
const LAB3_FILE = files.find((f) => path.basename(path.dirname(f)).includes("lab3"))!;
// Every migration before Lab 3's, not "every one that isn't Lab 3's": later labs
// add migrations after it (Lab 4 BR-46).
const LAB2_FILES = files.slice(0, files.indexOf(LAB3_FILE));

describe("Lab 3 migration on Lab 2-shaped data (MIG-01 to MIG-04)", () => {
  const schema = new ThrowawaySchema();
  let db: PrismaClient;
  let before: {
    users: { id: number; name: string; email: string; isActive: boolean }[];
    tickets: { id: number; ticketNumber: string; requesterId: number; requestedPriority: string; currentStatus: string }[];
    attachments: { id: number; ticketId: number; storedFilename: string; isRemoved: boolean; removedReason: string | null }[];
  };

  beforeAll(async () => {
    await schema.create();
    schema.applyMigrations(LAB2_FILES);
    db = schema.client();

    // Lab 2-shaped data, inserted as raw SQL because the Prisma client already
    // speaks the Lab 3 schema. Includes an inactive Requester, a mixed-case
    // padded email (MIG-04), every priority, and a soft-removed attachment.
    const run = (sql: string) => db.$executeRawUnsafe(sql);
    await run(`INSERT INTO "Category" ("name") VALUES ('Hardware'), ('Network')`);
    await run(`INSERT INTO "RelatedSystem" ("name") VALUES ('Printer'), ('VPN')`);
    await run(`INSERT INTO "RequesterUser" ("name", "email", "isActive") VALUES
      ('Requester One', 'one@kmutt.ac.th', true),
      ('Requester Two', '  Mixed.Case@KMUTT.ac.th ', true),
      ('Requester Three', 'three@kmutt.ac.th', false)`);
    await run(`INSERT INTO "Ticket" ("ticketNumber", "requesterId", "categoryId", "relatedSystemId", "summary", "description", "requestedPriority", "updatedAt") VALUES
      ('TCK-000001', 1, 1, 1, 'Printer jams', 'The printer jams on every second page.', 'LOW', now()),
      ('TCK-000002', 2, 2, 2, 'VPN drops', 'The VPN drops during large uploads.', 'HIGH', now()),
      ('TCK-000003', 3, 1, 2, 'Old ticket', 'A ticket from a since-deactivated Requester.', 'MEDIUM', now())`);
    await run(`INSERT INTO "Attachment" ("ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes") VALUES
      (1, 'jam.png', 'stored-jam.png', 'image/png', 1200)`);
    await run(`INSERT INTO "Attachment" ("ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes", "isRemoved", "removedAt", "removedReason") VALUES
      (2, 'old.pdf', 'stored-old.pdf', 'application/pdf', 3400, true, now(), 'Wrong file attached')`);

    before = {
      users: await db.$queryRawUnsafe(`SELECT "id", "name", "email", "isActive" FROM "RequesterUser" ORDER BY "id"`),
      tickets: await db.$queryRawUnsafe(
        `SELECT "id", "ticketNumber", "requesterId", "requestedPriority"::text AS "requestedPriority", "currentStatus"::text AS "currentStatus" FROM "Ticket" ORDER BY "id"`,
      ),
      attachments: await db.$queryRawUnsafe(
        `SELECT "id", "ticketId", "storedFilename", "isRemoved", "removedReason" FROM "Attachment" ORDER BY "id"`,
      ),
    };

    schema.applyFile(LAB3_FILE);
  }, SLOW);

  afterAll(async () => {
    await schema.drop();
  }, SLOW);

  it("MIG-01 keeps every ticket, attachment, and user, with the same ids and requester bindings", async () => {
    const users = await db.user.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } });
    expect(users).toEqual(before.users.map(({ id, name }) => ({ id, name })));

    const tickets = await db.ticket.findMany({
      orderBy: { id: "asc" },
      select: { id: true, ticketNumber: true, requesterId: true, requestedPriority: true, currentStatus: true },
    });
    expect(tickets).toEqual(before.tickets);

    const attachments = await db.attachment.findMany({
      orderBy: { id: "asc" },
      select: { id: true, ticketId: true, storedFilename: true, isRemoved: true, removedReason: true },
    });
    expect(attachments).toEqual(before.attachments);

    // The relation still resolves through the renamed table.
    const withRequester = await db.ticket.findMany({ select: { requesterId: true, requester: { select: { id: true } } } });
    for (const t of withRequester) expect(t.requester.id).toBe(t.requesterId);
  });

  it("MIG-02 backfills IT Priority from Requested Priority on every ticket, and makes it required", async () => {
    const tickets = await db.ticket.findMany({ select: { requestedPriority: true, itPriority: true } });
    expect(tickets).toHaveLength(before.tickets.length);
    for (const t of tickets) expect(t.itPriority).toBe(t.requestedPriority);

    const [column] = await db.$queryRawUnsafe<{ is_nullable: string }[]>(
      `SELECT is_nullable FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Ticket' AND column_name = 'itPriority'`,
      schema.name,
    );
    expect(column.is_nullable).toBe("NO");
  });

  it("MIG-03 leaves every migrated user a locked REQUESTER that must change its password", async () => {
    const users = await db.user.findMany({ orderBy: { id: "asc" } });
    expect(users.map((u) => u.isActive)).toEqual(before.users.map((u) => u.isActive));
    for (const u of users) {
      expect(u.role).toBe("REQUESTER");
      expect(u.mustChangePassword).toBe(true);
      expect(u.passwordHash).toBeNull();
      // BR-10 — the locked state: nothing verifies against a missing hash.
      expect(await verifyPassword("anything", u.passwordHash)).toBe(false);
    }
  });

  it("MIG-04 trims and lowercases every migrated email", async () => {
    const padded = before.users.find((u) => u.email !== u.email.trim().toLowerCase());
    expect(padded, "the fixture must really contain a mixed-case, padded email").toBeDefined();

    const users = await db.user.findMany({ select: { id: true, email: true } });
    expect(users.find((u) => u.id === padded!.id)!.email).toBe("mixed.case@kmutt.ac.th");
    for (const u of users) expect(u.email).toBe(u.email.trim().toLowerCase());
  });
});

describe("MIG-05 — the hand-edited migration matches schema.prisma", () => {
  it(
    "reports no drift once every migration is applied, while Prisma alone would have dropped the Lab 2 users",
    async () => {
      const full = new ThrowawaySchema();
      const lab2Only = new ThrowawaySchema();
      try {
        await full.create();
        full.applyMigrations();
        // --exit-code makes a difference a non-zero exit, which throws here.
        const out = runPrisma([
          "migrate", "diff", "--from-url", full.url, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code",
        ]);
        expect(out).toMatch(/No difference detected/);

        // The reason D-05 exists: Prisma's own diff from the Lab 2 database to
        // the Lab 3 schema deletes every Lab 2 Requester.
        await lab2Only.create();
        lab2Only.applyMigrations(LAB2_FILES);
        const generated = runPrisma([
          "migrate", "diff", "--from-url", lab2Only.url, "--to-schema-datamodel", "prisma/schema.prisma", "--script",
        ]);
        expect(generated).toContain('DROP TABLE "RequesterUser"');
      } finally {
        await full.drop();
        await lab2Only.drop();
      }
    },
    SLOW,
  );
});

describe("Lab 3 seed in a freshly migrated schema (MIG-06 to MIG-09)", () => {
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

  const count = (role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR", isActive: boolean) =>
    db.user.count({ where: { role, isActive } });

  it("MIG-07 provides exactly the documented accounts and a realistic ticket spread", async () => {
    expect(await count("REQUESTER", true)).toBe(6);
    expect(await count("REQUESTER", false)).toBe(1);
    expect(await count("IT_STAFF", true)).toBe(3);
    expect(await count("IT_STAFF", false)).toBe(1);
    expect(await count("ADMINISTRATOR", true)).toBe(2);
    expect(await count("ADMINISTRATOR", false)).toBe(0);

    const tickets = await db.ticket.findMany({ include: { owner: true, publicComments: { include: { author: true } } } });
    expect(tickets).toHaveLength(TICKETS.length);
    expect(new Set(tickets.map((t) => t.currentStatus)).size).toBe(8);
    expect(new Set(tickets.map((t) => t.itPriority)).size).toBe(3);
    expect(tickets.some((t) => t.ownerId === null)).toBe(true);
    expect(tickets.some((t) => t.ownerId !== null)).toBe(true);
    expect(tickets.some((t) => t.itPriority !== t.requestedPriority)).toBe(true);
    expect(tickets.some((t) => t.requesterResolvedAt !== null)).toBe(true);
    expect(await db.publicComment.count()).toBeGreaterThan(0);
    expect(await db.internalNote.count()).toBeGreaterThan(0);

    // The seed itself obeys the rules it demonstrates.
    for (const t of tickets) {
      expect(t.ticketNumber).toMatch(/^TCK-\d{6}$/);
      expect(t.updatedAt.getTime()).toBeGreaterThanOrEqual(t.createdAt.getTime());
      expect(t.updatedAt.getTime()).toBeLessThanOrEqual(Date.now());
      if (t.currentStatus !== "NEW" && t.currentStatus !== "CANCELLED") expect(t.ownerId).not.toBeNull(); // BR-42
      if (t.currentStatus === "NEW") expect(t.ownerId).toBeNull(); // BR-32: an owner would have opened it
      if (t.currentStatus === "RESOLVED" || t.currentStatus === "CLOSED") expect(t.resolutionSummary).toBeTruthy(); // BR-44
      if (t.owner) expect(["IT_STAFF", "ADMINISTRATOR"]).toContain(t.owner.role); // BR-29
      if (t.currentStatus === "CANCELLED" || t.currentStatus === "REOPENED") {
        // BR-45 — the reason is a Public Comment, written by IT Staff (BR-39).
        const reason = t.publicComments.find((c) => /^(Cancelled|Reopened):/.test(c.body));
        expect(reason?.author.role).toBe("IT_STAFF");
      }
    }
  });

  it("MIG-08 gives every documented account the documented password; only first.login must change it", async () => {
    for (const account of ACCOUNTS) {
      const user = await db.user.findUniqueOrThrow({ where: { email: account.email } });
      expect(await verifyPassword(SEED_PASSWORD, user.passwordHash), account.email).toBe(true);
      expect(user.mustChangePassword, account.email).toBe(account.email === FIRST_LOGIN_EMAIL);
      expect(user.role).toBe(account.role);
      expect(user.isActive).toBe(account.isActive);
    }
  });

  it("MIG-09 never stores the documented password in plaintext anywhere", async () => {
    const columns = await db.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = $1 AND data_type IN ('text', 'character varying')`,
      schema.name,
    );
    expect(columns.length).toBeGreaterThan(0);
    for (const { table_name, column_name } of columns) {
      const [{ n }] = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${table_name}" WHERE "${column_name}" LIKE '%' || $1 || '%'`,
        SEED_PASSWORD,
      );
      expect(Number(n), `${table_name}.${column_name}`).toBe(0);
    }
  });

  it("MIG-10 rejects a second user with the same email at the database level", async () => {
    const email = `duplicate.${Date.now()}@kmutt.ac.th`;
    await db.user.create({ data: { name: "First holder", email } });

    // The unique index, not application code, refuses it (Prisma P2002 on User_email_key).
    await expect(db.user.create({ data: { name: "Second holder", email } })).rejects.toMatchObject({
      code: "P2002",
      meta: { target: ["email"] },
    });
    expect(await db.user.count({ where: { email } })).toBe(1);
    // Case-insensitive uniqueness (BR-54) rests on every email being stored
    // lowercased — the migration does that for existing rows (MIG-04) and the
    // API does it for new ones (Issues 3 and 9).
  });

  it("MIG-11 rejects a role outside the three permitted values at the database level", async () => {
    // Raw SQL, because the typed Prisma client would not even compile with a
    // bad role — this proves the database enum itself refuses it (BR-53).
    const email = `bad.role.${Date.now()}@kmutt.ac.th`;
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO "User" ("name", "email", "role", "updatedAt") VALUES ('Bad role', $1, 'SUPERUSER', now())`,
        email,
      ),
    ).rejects.toThrow(/invalid input value for enum "Role"/);
    expect(await db.user.count({ where: { email } })).toBe(0);

    const [{ values }] = await db.$queryRawUnsafe<{ values: string[] }[]>(
      `SELECT enum_range(NULL::"Role")::text[] AS values`,
    );
    expect(values).toEqual(["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]);
  });

  it("MIG-06 is idempotent and never overwrites a changed password, role, activation, or ticket", async () => {
    const snapshot = async () => ({
      users: await db.user.count(),
      tickets: await db.ticket.count(),
      comments: await db.publicComment.count(),
      notes: await db.internalNote.count(),
    });
    const first = await snapshot();
    const rerun = await seed(db);
    expect(rerun).toEqual({ createdAccounts: 0, passwordsAssigned: 0, createdTickets: 0 });
    expect(await snapshot()).toEqual(first);

    // A demo changes a seeded account and a seeded ticket...
    const target = await db.user.findUniqueOrThrow({ where: { email: ACCOUNTS.find((a) => a.role === "IT_STAFF" && a.isActive)!.email } });
    await db.user.update({ where: { id: target.id }, data: { passwordHash: "scrypt$changed-by-a-demo", role: "REQUESTER", isActive: false } });
    const ticket = await db.ticket.findFirstOrThrow({ where: { currentStatus: "NEW" } });
    await db.ticket.update({ where: { id: ticket.id }, data: { currentStatus: "CANCELLED" } });

    // ...and re-running the seed keeps those changes (BR-78).
    await seed(db);
    const after = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after).toMatchObject({ passwordHash: "scrypt$changed-by-a-demo", role: "REQUESTER", isActive: false });
    expect((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).currentStatus).toBe("CANCELLED");
    expect(await snapshot()).toEqual(first);
  });
});
