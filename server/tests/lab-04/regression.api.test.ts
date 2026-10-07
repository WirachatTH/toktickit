import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Role, TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { parseQueueQuery } from "../../src/queueQuery.js";
import { parseRequesterStatus, parseUserStatus, UNRESOLVED_STATUSES } from "../../src/ticketFilters.js";
import { endTestSessions, sessionCookieFor } from "../lab-03/helpers/sessions.js";

// UNIT-07, REG-03, REG-04 — the drill-down filters added to three Lab 2–3 list
// endpoints (docs/lab-04/specification.md BR-35, BR-45 (4), D-13; api-spec §4).
// Each is optional, and without it the endpoint behaves exactly as before.

const prisma = getPrisma();
const stamp = Date.now();
const ALL: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];

const users = {} as Record<"requester" | "other" | "staff" | "admin" | "idle", number>;
const cookies = {} as Record<"requester" | "staff" | "admin", string>;
const ticketIds: number[] = [];

describe("UNIT-07 status-filter parsing (BR-35, D-13)", () => {
  it("maps UNRESOLVED to the five working statuses", () => {
    expect([...UNRESOLVED_STATUSES]).toEqual(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"]);
  });

  it("reads My Tickets' status leniently: ALL by default and for anything unknown, never 400", () => {
    expect(parseRequesterStatus(undefined)).toBe("ALL");
    for (const value of ["ALL", "UNRESOLVED", ...ALL]) expect(parseRequesterStatus(value)).toBe(value);
    for (const bad of ["", "unresolved", "ACTIVE", "DONE", 3, ["OPEN"]]) expect(parseRequesterStatus(bad), String(bad)).toBe("ALL");
  });

  it("lets the queue's status accept UNRESOLVED, keeping ACTIVE as the default", () => {
    expect(parseQueueQuery({ status: "UNRESOLVED" }).status).toBe("UNRESOLVED");
    expect(parseQueueQuery({}).status).toBe("ACTIVE");
    expect(parseQueueQuery({ status: "nonsense" }).status).toBe("ACTIVE");
  });

  it("reads the user list's status as active, inactive, or nothing", () => {
    expect(parseUserStatus("active")).toBe("active");
    expect(parseUserStatus("inactive")).toBe("inactive");
    for (const bad of [undefined, "", "ACTIVE", "all", 1]) expect(parseUserStatus(bad), String(bad)).toBeNull();
  });
});

async function makeTicket(status: TicketStatus, requester: number, n: number) {
  const category = await prisma.category.findFirstOrThrow();
  const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  const t = await prisma.ticket.create({
    data: {
      ticketNumber: `REG4-${stamp}-${n}`, requesterId: requester, ownerId: status === "NEW" ? null : users.staff, categoryId: category.id, relatedSystemId: system.id,
      summary: `Regression ${status} ${stamp}`, description: "Created by the Lab 4 regression suite.", itPriority: "MEDIUM", currentStatus: status,
    },
  });
  ticketIds.push(t.id);
  return t.id;
}

beforeAll(async () => {
  const make = async (key: keyof typeof users, role: Role, isActive = true) => {
    const u = await prisma.user.create({ data: { name: `Reg4 ${key} ${stamp}`, email: `reg4.${key}.${stamp}@kmutt.ac.th`, role, isActive, mustChangePassword: false } });
    users[key] = u.id;
    if (key === "requester" || key === "staff" || key === "admin") cookies[key] = await sessionCookieFor(prisma, u.id);
  };
  await make("requester", "REQUESTER");
  await make("other", "REQUESTER");
  await make("staff", "IT_STAFF");
  await make("admin", "ADMINISTRATOR");
  await make("idle", "IT_STAFF", false);
  let n = 0;
  for (const status of ALL) {
    await makeTicket(status, users.requester, n++);
    await makeTicket(status, users.other, n++);
  }
});

afterAll(async () => {
  await endTestSessions(prisma);
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
});

const mine = (query = "") => request(app).get(`/api/tickets?pageSize=50${query}`).set("Cookie", cookies.requester);
const queue = (query = "") => request(app).get(`/api/staff/tickets?pageSize=50&search=${encodeURIComponent(`Regression`)}${query}`).set("Cookie", cookies.staff);
// The run's own stamp is in every name and email here, so only this file's users match.
const userList = (query = "") => request(app).get(`/api/admin/users?search=${stamp}${query}`).set("Cookie", cookies.admin);
const statuses = (res: request.Response) => res.body.data.map((t: { currentStatus: string }) => t.currentStatus).sort();
const ours = (res: request.Response) => ({ ...res, body: { ...res.body, data: res.body.data.filter((t: { summary: string }) => t.summary.endsWith(String(stamp))) } }) as request.Response;

describe("REG-03 without the new filters, nothing changes (BR-45 (4))", () => {
  it("My Tickets without status equals status=ALL and an unknown status, and lists every own ticket", async () => {
    const plain = await mine();
    expect(plain.status).toBe(200);
    expect(statuses(plain)).toEqual([...ALL].sort());
    for (const q of ["&status=ALL", "&status=bogus"]) expect((await mine(q)).body, q).toEqual(plain.body);
  });

  it("the queue without status equals status=ACTIVE, as in Lab 3", async () => {
    const plain = ours(await queue());
    expect(statuses(plain)).toEqual(ALL.filter((s) => s !== "CLOSED" && s !== "CANCELLED").flatMap((s) => [s, s]).sort());
    expect(ours(await queue("&status=ACTIVE")).body.data).toEqual(plain.body.data);
    expect((await queue()).body.appliedQuery.status).toBe("ACTIVE");
  });

  it("the user list without status includes inactive users, as in Lab 3", async () => {
    const plain = await userList();
    const ids = plain.body.data.map((u: { id: number }) => u.id).sort((a: number, b: number) => a - b);
    expect(ids).toEqual(Object.values(users).sort((a, b) => a - b));
    expect((await userList("&status=bogus")).body).toEqual(plain.body);
  });
});

describe("REG-04 the drill-down filters (D-13, AC-23)", () => {
  it("narrows My Tickets to the Unresolved group, or to one status, with matching pagination", async () => {
    const unresolved = await mine("&status=UNRESOLVED");
    expect(statuses(unresolved)).toEqual([...UNRESOLVED_STATUSES].sort());
    expect(unresolved.body.pagination.totalItems).toBe(5);
    const waiting = await mine("&status=WAITING_FOR_REQUESTER&pageSize=1");
    expect(statuses(waiting)).toEqual(["WAITING_FOR_REQUESTER"]);
    expect(waiting.body.pagination).toMatchObject({ totalItems: 1, totalPages: 1 });
    // Never another Requester's tickets, whatever the filter.
    for (const t of [...unresolved.body.data, ...waiting.body.data]) expect(ticketIds).toContain(t.id);
    expect(unresolved.body.data.every((t: { summary: string }) => t.summary.includes(String(stamp)))).toBe(true);
  });

  it("narrows the queue to the Unresolved group and echoes it", async () => {
    const res = await queue("&status=UNRESOLVED");
    expect(statuses(ours(res))).toEqual([...UNRESOLVED_STATUSES].flatMap((s) => [s, s]).sort());
    expect(res.body.appliedQuery.status).toBe("UNRESOLVED");
  });

  it("filters users by activation, together with role", async () => {
    const active = (await userList("&status=active")).body.data.map((u: { id: number }) => u.id);
    expect(active).not.toContain(users.idle);
    expect(active).toContain(users.staff);
    const inactive = (await userList("&status=inactive")).body.data.map((u: { id: number }) => u.id);
    expect(inactive).toEqual([users.idle]);
    const activeStaff = (await userList("&status=active&role=IT_STAFF")).body.data.map((u: { id: number }) => u.id);
    expect(activeStaff).toEqual([users.staff]);
  });
});
