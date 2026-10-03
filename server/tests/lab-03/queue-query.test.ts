import { describe, it, expect } from "vitest";
import { DEFAULT_QUEUE_QUERY, parseQueueQuery, queueOrderBy } from "../../src/queueQuery.js";

// UNIT-10, UNIT-11 — the Ticket Queue's query normalisation and ordering
// (docs/lab-03/api-spec.md §5.1, specification.md BR-62 to BR-66).

describe("UNIT-10 query normalisation (BR-62, BR-65, BR-66)", () => {
  it("applies the documented defaults to an empty query", () => {
    expect(parseQueueQuery({})).toEqual({
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
    expect(parseQueueQuery({})).toEqual(DEFAULT_QUEUE_QUERY);
  });

  it("keeps every valid value", () => {
    expect(
      parseQueueQuery({
        search: "  Battery  ",
        status: "WAITING_FOR_REQUESTER",
        itPriority: "LOW",
        categoryId: "3",
        owner: "17",
        appearsResolved: "true",
        sort: "status",
        order: "asc",
        page: "4",
        pageSize: "25",
      }),
    ).toEqual({
      search: "Battery",
      status: "WAITING_FOR_REQUESTER",
      itPriority: "LOW",
      categoryId: 3,
      owner: 17,
      appearsResolved: true,
      sort: "status",
      order: "asc",
      page: 4,
      pageSize: 25,
    });
    for (const status of ["ACTIVE", "ALL", "NEW", "CANCELLED"]) expect(parseQueueQuery({ status }).status).toBe(status);
    for (const owner of ["any", "unassigned", "me"]) expect(parseQueueQuery({ owner }).owner).toBe(owner);
  });

  it("replaces unknown or malformed values with the defaults, never throwing", () => {
    const applied = parseQueueQuery({
      search: ["a", "b"],
      status: "PENDING",
      itPriority: "URGENT",
      categoryId: "abc",
      owner: "someone",
      appearsResolved: "yes",
      sort: "description",
      order: "sideways",
      page: "-3",
      pageSize: "lots",
    });
    expect(applied).toEqual(DEFAULT_QUEUE_QUERY);
    expect(parseQueueQuery({ status: "active" }).status).toBe("ACTIVE"); // values are exact, not case-folded
    expect(parseQueueQuery({ categoryId: "9999999999" }).categoryId).toBeNull(); // outside Int32
    expect(parseQueueQuery({ owner: "0" }).owner).toBe("any");
    expect(parseQueueQuery({ owner: "1.5" }).owner).toBe("any");
    expect(parseQueueQuery({ search: "   " }).search).toBe("");
  });

  it("clamps page and page size to their ranges (BR-65)", () => {
    expect(parseQueueQuery({ page: "0" }).page).toBe(1);
    expect(parseQueueQuery({ page: "99999999999999999999" }).page).toBe(1);
    expect(parseQueueQuery({ page: "2000000" }).page).toBe(1_000_000);
    expect(parseQueueQuery({ pageSize: "0" }).pageSize).toBe(1);
    expect(parseQueueQuery({ pageSize: "51" }).pageSize).toBe(50);
    expect(parseQueueQuery({ pageSize: "50" }).pageSize).toBe(50);
    expect(parseQueueQuery({ pageSize: "" }).pageSize).toBe(10);
  });
});

describe("UNIT-11 the fixed ordering for every sort (BR-63, BR-64)", () => {
  it("follows IT Priority (either direction) with createdAt ascending, then id ascending", () => {
    expect(queueOrderBy("itPriority", "desc")).toEqual([{ itPriority: "desc" }, { createdAt: "asc" }, { id: "asc" }]);
    expect(queueOrderBy("itPriority", "asc")).toEqual([{ itPriority: "asc" }, { createdAt: "asc" }, { id: "asc" }]);
  });

  it("follows every other field with id in the same direction", () => {
    expect(queueOrderBy("createdAt", "desc")).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(queueOrderBy("updatedAt", "asc")).toEqual([{ updatedAt: "asc" }, { id: "asc" }]);
    expect(queueOrderBy("ticketNumber", "asc")).toEqual([{ ticketNumber: "asc" }, { id: "asc" }]);
    expect(queueOrderBy("status", "desc")).toEqual([{ currentStatus: "desc" }, { id: "desc" }]);
  });

  it("builds the default order exactly as sort=itPriority&order=desc", () => {
    const { sort, order } = parseQueueQuery({});
    expect(queueOrderBy(sort, order)).toEqual(queueOrderBy("itPriority", "desc"));
  });
});
