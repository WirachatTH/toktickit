import type { Prisma, Priority, TicketStatus } from "@prisma/client";

// Lab 3, Issue 7 — the IT Staff Ticket Queue's query: normalisation, filters,
// and ordering (docs/lab-03/api-spec.md §5.1, specification.md BR-61 to BR-66).
//
// Every value is read leniently: anything unknown or malformed falls back to
// its default rather than producing a 400 (BR-66, carrying forward Lab 2 D-5),
// and the result is exactly what the response echoes as `appliedQuery`.

export type QueueSort = "itPriority" | "createdAt" | "updatedAt" | "ticketNumber" | "status";
export type QueueOrder = "asc" | "desc";
export type QueueStatus = "ACTIVE" | "ALL" | TicketStatus;
export type QueueOwner = "any" | "unassigned" | "me" | number;

export interface QueueQuery {
  search: string;
  status: QueueStatus;
  itPriority: Priority | null;
  categoryId: number | null;
  owner: QueueOwner;
  appearsResolved: boolean;
  sort: QueueSort;
  order: QueueOrder;
  page: number;
  pageSize: number;
}

export const DEFAULT_QUEUE_QUERY: Readonly<QueueQuery> = Object.freeze({
  search: "",
  status: "ACTIVE",
  itPriority: null,
  categoryId: null,
  owner: "any",
  appearsResolved: false,
  sort: "itPriority",
  order: "desc",
  page: 1,
  pageSize: 10,
});

const STATUSES: readonly TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
const PRIORITIES: readonly Priority[] = ["LOW", "MEDIUM", "HIGH"];
const SORTS: readonly QueueSort[] = ["itPriority", "createdAt", "updatedAt", "ticketNumber", "status"];
const TERMINAL: TicketStatus[] = ["CLOSED", "CANCELLED"];
const MAX_PAGE = 1_000_000; // a larger "valid" number only overflows the offset (Lab 2 BR-19 finding)
const INT32_MAX = 2147483647;

const text = (raw: unknown): string | undefined => (typeof raw === "string" ? raw : undefined);
const oneOf = <T extends string>(raw: unknown, allowed: readonly T[]): T | undefined =>
  (allowed as readonly string[]).includes(text(raw) ?? "") ? (raw as T) : undefined;

function positiveId(raw: unknown): number | undefined {
  const value = text(raw);
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= INT32_MAX ? n : undefined;
}

// Page values are plain digits, like ids: Number() alone would also read
// "1e1", "0x10", or " 3" (PR #57 review).
const DIGITS = /^\d+$/;

function pageOf(raw: unknown): number {
  const value = text(raw);
  if (value === undefined || !DIGITS.test(value)) return DEFAULT_QUEUE_QUERY.page;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) return DEFAULT_QUEUE_QUERY.page;
  return Math.min(n, MAX_PAGE);
}

// BR-65 — a numeric page size is clamped into 1–50; anything else is the default.
function pageSizeOf(raw: unknown): number {
  const value = text(raw);
  if (value === undefined || !DIGITS.test(value)) return DEFAULT_QUEUE_QUERY.pageSize;
  return Math.min(Math.max(Number(value), 1), 50);
}

export function parseQueueQuery(raw: Record<string, unknown>): QueueQuery {
  const owner = text(raw.owner);
  return {
    search: (text(raw.search) ?? "").trim(),
    status: oneOf(raw.status, ["ACTIVE", "ALL", ...STATUSES] as const) ?? DEFAULT_QUEUE_QUERY.status,
    itPriority: oneOf(raw.itPriority, PRIORITIES) ?? null,
    categoryId: positiveId(raw.categoryId) ?? null,
    owner: owner === "any" || owner === "unassigned" || owner === "me" ? owner : (positiveId(owner) ?? "any"),
    appearsResolved: raw.appearsResolved === "true",
    sort: oneOf(raw.sort, SORTS) ?? DEFAULT_QUEUE_QUERY.sort,
    order: oneOf(raw.order, ["asc", "desc"] as const) ?? DEFAULT_QUEUE_QUERY.order,
    page: pageOf(raw.page),
    pageSize: pageSizeOf(raw.pageSize),
  };
}

// BR-64 — one fixed full key per sort, so the same sort and order always give
// the same order and pages never repeat or skip a row. Status and priority are
// Postgres enums, which sort in declaration order: the BR-38 lifecycle and
// LOW < MEDIUM < HIGH.
export function queueOrderBy(sort: QueueSort, order: QueueOrder): Prisma.TicketOrderByWithRelationInput[] {
  if (sort === "itPriority") return [{ itPriority: order }, { createdAt: "asc" }, { id: "asc" }];
  const field = sort === "status" ? "currentStatus" : sort;
  return [{ [field]: order } as Prisma.TicketOrderByWithRelationInput, { id: order }];
}

// Prisma passes these values as parameters (no SQL injection), but LIKE's own
// wildcards stay live inside a parameter: escape them so a search is literal
// (the same fix as Lab 2's My Tickets search).
export function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// BR-61, BR-62 — search and every filter, combined with AND.
export function queueWhere(query: QueueQuery, currentUserId: number): Prisma.TicketWhereInput {
  const and: Prisma.TicketWhereInput[] = [];
  if (query.status === "ACTIVE") and.push({ currentStatus: { notIn: TERMINAL } });
  else if (query.status !== "ALL") and.push({ currentStatus: query.status });
  if (query.itPriority) and.push({ itPriority: query.itPriority });
  if (query.categoryId !== null) and.push({ categoryId: query.categoryId });
  if (query.owner === "unassigned") and.push({ ownerId: null });
  else if (query.owner === "me") and.push({ ownerId: currentUserId });
  else if (typeof query.owner === "number") and.push({ ownerId: query.owner });
  if (query.appearsResolved) and.push({ requesterResolvedAt: { not: null } });
  if (query.search) {
    const term = escapeLike(query.search);
    and.push({
      OR: [
        { ticketNumber: { startsWith: term, mode: "insensitive" } },
        { summary: { contains: term, mode: "insensitive" } },
        { requester: { name: { contains: term, mode: "insensitive" } } },
      ],
    });
  }
  return { AND: and };
}
