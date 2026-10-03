import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import * as api from "../../src/api.js";
import type { QueueResponse, QueueRow } from "../../src/api.js";
import { AppRoutes } from "../../src/AppRoutes.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { LocationProbe } from "./authTestUtils.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// UI-17 to UI-20 — the IT Staff Ticket Queue (docs/lab-03/ui-spec.md §6). The
// real route table, shell, and screen are rendered; only the network is mocked.

const STAFF: api.AuthUser = { id: 8, name: "Pimchanok Srisuk", email: "pimchanok.srisuk@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false };
const ADMIN: api.AuthUser = { ...STAFF, id: 9, name: "Siriporn Boonmee", email: "siriporn.boonmee@kmutt.ac.th", role: "ADMINISTRATOR" };
const person = (id: number, name: string, role: api.Role = "IT_STAFF", isActive = true) => ({ id, name, role, isActive });

const DEFAULT_APPLIED: api.QueueQuery = {
  search: "", status: "ACTIVE", itPriority: null, categoryId: null, owner: "any", appearsResolved: false,
  sort: "itPriority", order: "desc", page: 1, pageSize: 10,
};

function row(over: Partial<QueueRow> & { id: number }): QueueRow {
  return {
    ticketNumber: `TCK-${String(over.id).padStart(6, "0")}`,
    summary: `Ticket ${over.id}`,
    requester: person(3, "Somchai Prasert", "REQUESTER"),
    category: { id: 1, name: "Hardware" },
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "OPEN",
    owner: null,
    requesterResolvedAt: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
    ...over,
  };
}

function reply(data: QueueRow[], applied: Partial<api.QueueQuery> = {}, totalItems = data.length): QueueResponse {
  const appliedQuery = { ...DEFAULT_APPLIED, ...applied };
  return { data, pagination: { page: appliedQuery.page, pageSize: appliedQuery.pageSize, totalItems, totalPages: Math.ceil(totalItems / appliedQuery.pageSize) }, appliedQuery };
}

// The mock echoes the request back as appliedQuery, the way the server does.
function echoQueue(rows: QueueRow[] = [row({ id: 1 })], totalItems?: number) {
  return vi.spyOn(api, "fetchStaffQueue").mockImplementation(async (params) => {
    const p = params as Record<string, string>;
    const applied: Partial<api.QueueQuery> = {
      ...(p.search ? { search: p.search } : {}),
      ...(p.status ? { status: p.status as api.QueueQuery["status"] } : {}),
      ...(p.itPriority ? { itPriority: p.itPriority as api.Priority } : {}),
      ...(p.categoryId ? { categoryId: Number(p.categoryId) } : {}),
      ...(p.owner ? { owner: /^\d+$/.test(p.owner) ? Number(p.owner) : (p.owner as "any") } : {}),
      ...(p.appearsResolved ? { appearsResolved: true } : {}),
      ...(p.sort ? { sort: p.sort as api.QueueQuery["sort"] } : {}),
      ...(p.order ? { order: p.order as "asc" | "desc" } : {}),
      ...(p.page ? { page: Number(p.page) } : {}),
    };
    return reply(rows, applied, totalItems ?? rows.length);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchCategories").mockResolvedValue([{ id: 1, name: "Hardware" }, { id: 2, name: "Software" }]);
  vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue([person(8, "Pimchanok Srisuk"), person(9, "Siriporn Boonmee", "ADMINISTRATOR"), person(10, "Chanon Rattanakorn")]);
});

function SearchProbe() {
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="search">{useLocation().search}</output>
      <button type="button" data-testid="browser-back" onClick={() => navigate(-1)} />
    </>
  );
}

function renderQueue(user: api.AuthUser = STAFF, path = "/staff/queue") {
  vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(user);
  return render(
    <AuthProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
        <AppRoutes />
        <LocationProbe />
        <SearchProbe />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const table = () => screen.getByTestId("queue-table");
const lastParams = () => (vi.mocked(api.fetchStaffQueue).mock.calls.at(-1)![0] as Record<string, string>);

describe("UI-17 queue rows (FR-21, ui-spec §6.2)", () => {
  it("shows seven columns, the owner or Unassigned, the appears-resolved pill, and 'Requested:' only when the priorities differ", async () => {
    echoQueue([
      row({ id: 1, itPriority: "HIGH", requestedPriority: "MEDIUM", owner: null, currentStatus: "NEW", summary: "Laptop battery drains quickly" }),
      row({ id: 2, itPriority: "LOW", requestedPriority: "LOW", owner: person(8, "Pimchanok Srisuk"), requesterResolvedAt: "2026-10-01T09:00:00.000Z" }),
      row({ id: 3, owner: person(11, "Suda Kaewmanee", "IT_STAFF", false) }),
    ]);
    renderQueue();
    await waitFor(() => expect(within(table()).getAllByRole("row")).toHaveLength(4));

    expect(within(table()).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Ticket", "Summary", "Category", "Priority", "Status", "Owner", "Updated"]);
    const [, first, second, third] = within(table()).getAllByRole("row");

    expect(within(first).getByRole("link", { name: "TCK-000001" })).toHaveAttribute("href", "/staff/tickets/1");
    expect(within(first).getByText("Laptop battery drains quickly")).toHaveAttribute("title", "Laptop battery drains quickly");
    expect(within(first).getByText("Somchai Prasert")).toBeInTheDocument();
    expect(within(first).getByText("Unassigned").tagName).toBe("EM");
    expect(within(first).getByText("Requested: MEDIUM")).toBeInTheDocument();
    expect(within(first).getByText("HIGH")).toHaveClass("zg-badge--priority-high");

    expect(within(second).queryByText(/^Requested:/)).toBeNull();
    expect(within(second).getByText("Requester: appears resolved")).toBeInTheDocument();
    expect(within(second).getByText("Pimchanok Srisuk")).toBeInTheDocument();
    expect(within(second).getByText("You")).toBeInTheDocument(); // the signed-in user owns it
    expect(within(first).queryByText("Requester: appears resolved")).toBeNull();

    expect(within(third).getByText("Suda Kaewmanee")).toBeInTheDocument();
    expect(within(third).getByText("Inactive")).toBeInTheDocument();
    // Updated: a relative time, with the full date in the title.
    expect(within(third).getByTitle(/2026/)).toBeInTheDocument();
  });

  it("renders a card per ticket for small screens, and the whole row opens the detail", async () => {
    echoQueue([row({ id: 7, summary: "Printer jam" })]);
    renderQueue();
    const cards = await screen.findByTestId("queue-cards");
    expect(within(cards).getByText("TCK-000007")).toBeInTheDocument();
    expect(within(cards).getByText("Printer jam")).toBeInTheDocument();
    await userEvent.click(within(table()).getByText("Printer jam"));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/staff/tickets/7"));
  });
});

describe("UI-18 search, filters, sort, pagination, and the URL (FR-22, ui-spec §6.1)", () => {
  it("sends each filter, resets to page 1, and keeps the state in the URL", async () => {
    const spy = echoQueue([row({ id: 1 })], 35);
    renderQueue(STAFF, "/staff/queue?page=3");
    await waitFor(() => expect(lastParams()).toMatchObject({ page: "3" }));

    await userEvent.selectOptions(screen.getAllByLabelText("Status")[0], "ALL");
    await waitFor(() => expect(lastParams()).toEqual({ status: "ALL" }));
    await userEvent.selectOptions(screen.getAllByLabelText("IT Priority")[0], "HIGH");
    await waitFor(() => expect(lastParams()).toEqual({ status: "ALL", itPriority: "HIGH" }));
    await userEvent.selectOptions(screen.getAllByLabelText("Category")[0], "2");
    await userEvent.selectOptions(screen.getAllByLabelText("Owner")[0], "unassigned");
    await userEvent.click(screen.getAllByLabelText("Requester says resolved")[0]);
    await userEvent.selectOptions(screen.getAllByLabelText("Sort")[0], "createdAt:asc");
    await waitFor(() =>
      expect(lastParams()).toEqual({ status: "ALL", itPriority: "HIGH", categoryId: "2", owner: "unassigned", appearsResolved: "true", sort: "createdAt", order: "asc" }),
    );
    // The filter state is in the URL, so Back and refresh restore it.
    const search = new URLSearchParams(screen.getByTestId("search").textContent!);
    expect(Object.fromEntries(search)).toEqual({ status: "ALL", itPriority: "HIGH", categoryId: "2", owner: "unassigned", appearsResolved: "true", sort: "createdAt", order: "asc" });

    // Page buttons keep the filters and move only the page.
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ status: "ALL", page: "2" }));

    // Search is debounced, trimmed, and goes back to page 1.
    const calls = spy.mock.calls.length;
    await userEvent.type(screen.getAllByLabelText(/search/i)[0], "  battery ");
    expect(spy.mock.calls.length).toBe(calls);
    await waitFor(() => expect(lastParams()).toMatchObject({ search: "battery" }));
    expect(lastParams().page).toBeUndefined();

    await userEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    await waitFor(() => expect(lastParams()).toEqual({}));
    expect(screen.getAllByLabelText(/search/i)[0]).toHaveValue("");
    expect(screen.getAllByLabelText("Status")[0]).toHaveValue("ACTIVE");
  });

  it("restores the filters from the URL on load, and offers the six sort presets", async () => {
    echoQueue([row({ id: 1 })]);
    renderQueue(STAFF, "/staff/queue?status=ALL&owner=me&sort=updatedAt&order=desc&search=wifi");
    // order=desc is the default, so it is not repeated in the request (BR-66).
    await waitFor(() => expect(lastParams()).toEqual({ status: "ALL", owner: "me", sort: "updatedAt", search: "wifi" }));
    expect(screen.getAllByLabelText("Status")[0]).toHaveValue("ALL");
    expect(screen.getAllByLabelText("Owner")[0]).toHaveValue("me");
    expect(screen.getAllByLabelText(/search/i)[0]).toHaveValue("wifi");
    const sort = screen.getAllByLabelText("Sort")[0];
    expect(sort).toHaveValue("updatedAt:desc");
    expect(within(sort).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Priority (default)", "Newest", "Oldest", "Recently updated", "Ticket number", "Status",
    ]);
  });

  // PR #57 review: Clear filters straight after a search put the other filters
  // back (the delayed search wrote a stale copy of the URL).
  it("clears every filter, not just the search, when Clear filters follows a search", async () => {
    echoQueue([]);
    renderQueue(STAFF, "/staff/queue?owner=me");
    await waitFor(() => expect(lastParams()).toEqual({ owner: "me" }));
    await userEvent.type(screen.getAllByLabelText(/search/i)[0], "zzzz");
    await waitFor(() => expect(lastParams()).toEqual({ owner: "me", search: "zzzz" }));

    for (const button of [() => screen.getAllByRole("button", { name: "Clear filters" })[0], () => within(screen.getByTestId("queue-no-results")).getByRole("button", { name: "Clear filters" })]) {
      await waitFor(() => expect(lastParams()).toMatchObject({ owner: "me" }));
      await userEvent.click(button());
      await waitFor(() => expect(lastParams()).toEqual({}));
      // Wait out the search delay: nothing may put the old filters back.
      await new Promise((r) => setTimeout(r, 500));
      expect(lastParams()).toEqual({});
      expect(screen.getByTestId("search").textContent).toBe("");
      expect(screen.getAllByLabelText("Owner")[0]).toHaveValue("any");
      // Set up the same state again for the second Clear button.
      await userEvent.selectOptions(screen.getAllByLabelText("Owner")[0], "me");
      await userEvent.type(screen.getAllByLabelText(/search/i)[0], "zzzz");
      await waitFor(() => expect(lastParams()).toEqual({ owner: "me", search: "zzzz" }));
    }
  });

  // PR #57 review round 2: Clear filters pushed two history entries (the
  // delayed search fired after the Clear), so Back had to be pressed twice.
  it("adds one history entry per Clear filters click, so one Back returns to the search", async () => {
    echoQueue([]);
    renderQueue(STAFF, "/staff/queue?owner=me");
    await waitFor(() => expect(lastParams()).toEqual({ owner: "me" }));
    await userEvent.type(screen.getAllByLabelText(/search/i)[0], "zzzz");
    await waitFor(() => expect(screen.getByTestId("search").textContent).toBe("?owner=me&search=zzzz"));
    await screen.findByTestId("queue-no-results");

    await userEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    await waitFor(() => expect(screen.getByTestId("search").textContent).toBe(""));
    await new Promise((r) => setTimeout(r, 500)); // past the search delay
    await userEvent.click(screen.getByTestId("browser-back"));
    await waitFor(() => expect(screen.getByTestId("search").textContent).toBe("?owner=me&search=zzzz"));
  });

  it("keeps a filter changed while a search is still waiting to be sent", async () => {
    echoQueue([row({ id: 1 })]);
    renderQueue();
    await waitFor(() => expect(lastParams()).toEqual({}));
    // Type, then change Status before the 300 ms search delay is over.
    await userEvent.type(screen.getAllByLabelText(/search/i)[0], "wifi", { delay: null });
    await userEvent.selectOptions(screen.getAllByLabelText("Status")[0], "ALL");
    await new Promise((r) => setTimeout(r, 600));
    await waitFor(() => expect(lastParams()).toEqual({ status: "ALL", search: "wifi" }));
    expect(screen.getAllByLabelText("Status")[0]).toHaveValue("ALL");
  });

  it("shows 'Showing 11–20 of 35' and moves with Prev and Next", async () => {
    echoQueue([row({ id: 11 })], 35);
    renderQueue(STAFF, "/staff/queue?page=2");
    expect(await screen.findByText("Showing 11–20 of 35")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: "3" }));
    await userEvent.click(screen.getByRole("button", { name: "Prev" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: "2" }));
  });
});

describe("UI-19 empty, no-results, and failure are distinct (FR-23, AC-27)", () => {
  it("says the queue is clear when nothing is active and no filter is set", async () => {
    echoQueue([]);
    renderQueue();
    expect(await screen.findByText("The queue is clear — there are no active tickets.")).toBeInTheDocument();
    expect(screen.queryByText("No tickets match your search or filters.")).toBeNull();
  });

  it("says nothing matches when a filter or search is set, with Clear filters", async () => {
    echoQueue([]);
    renderQueue(STAFF, "/staff/queue?itPriority=LOW");
    expect(await screen.findByText("No tickets match your search or filters.")).toBeInTheDocument();
    expect(screen.queryByText(/the queue is clear/i)).toBeNull();
    await userEvent.click(within(screen.getByTestId("queue-no-results")).getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastParams()).toEqual({}));
  });

  // PR #57 review: an empty page past the end was read as "nothing at all".
  it("takes a page past the end to the last page, instead of saying the queue is clear", async () => {
    const all = Array.from({ length: 14 }, (_, i) => row({ id: i + 1 }));
    vi.spyOn(api, "fetchStaffQueue").mockImplementation(async (params) => {
      const page = Number((params as Record<string, string>).page ?? 1);
      const owner = (params as Record<string, string>).owner;
      const data = all.slice((page - 1) * 10, page * 10);
      return reply(data, { page, ...(owner ? { owner: owner as "me" } : {}) }, 14);
    });
    for (const path of ["/staff/queue?page=99", "/staff/queue?page=99&owner=me"]) {
      const { unmount } = renderQueue(STAFF, path);
      await waitFor(() => expect(lastParams().page).toBe("2"));
      expect(await screen.findByText("Showing 11–14 of 14")).toBeInTheDocument();
      expect(screen.queryByText(/the queue is clear/i)).toBeNull();
      expect(screen.queryByText("No tickets match your search or filters.")).toBeNull();
      expect(within(table()).getAllByRole("row")).toHaveLength(5);
      unmount();
    }
  });

  // PR #57 review round 2: if the count and the rows disagree (tickets closed
  // between the two queries) the "last page" is the page already shown, and the
  // screen stayed on its loading skeleton for good.
  it("never stays loading when the last page itself comes back empty", async () => {
    const spy = vi.spyOn(api, "fetchStaffQueue").mockResolvedValue(reply([], { page: 2 }, 14));
    renderQueue(STAFF, "/staff/queue?page=2");
    expect(await screen.findByText("The queue changed while it was loading.")).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.queryByText(/the queue is clear/i)).toBeNull();
    spy.mockResolvedValue(reply([row({ id: 11 })], { page: 2 }, 11));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await within(table()).findByText("TCK-000011")).toBeInTheDocument();
  });

  it("shows a failure banner with Retry, which loads again", async () => {
    const spy = vi.spyOn(api, "fetchStaffQueue").mockRejectedValueOnce(new Error("down")).mockResolvedValue(reply([row({ id: 1 })]));
    renderQueue();
    expect(await screen.findByText("Unable to load the queue. Please try again.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("TCK-000001", { selector: "a" })).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("UI-20 the queue for an Administrator (AC-33)", () => {
  it("shows a Read-only pill beside the heading, the same table, and no 'Me' owner option", async () => {
    echoQueue([row({ id: 1 })]);
    renderQueue(ADMIN);
    const heading = await screen.findByRole("heading", { name: "Ticket Queue" });
    expect(within(heading.parentElement!).getByText("Read-only")).toBeInTheDocument();
    expect(await within(table()).findByText("TCK-000001")).toBeInTheDocument();
    const owner = screen.getAllByLabelText("Owner")[0];
    await waitFor(() => expect(within(owner).getByRole("option", { name: "Chanon Rattanakorn" })).toBeInTheDocument());
    expect(within(owner).queryByRole("option", { name: "Me" })).toBeNull();
  });

  it("IT Staff get no Read-only pill and do get 'Me'", async () => {
    echoQueue([row({ id: 1 })]);
    renderQueue(STAFF);
    await screen.findByRole("heading", { name: "Ticket Queue" });
    expect(screen.queryByText("Read-only")).toBeNull();
    expect(within(screen.getAllByLabelText("Owner")[0]).getByRole("option", { name: "Me" })).toBeInTheDocument();
  });
});
