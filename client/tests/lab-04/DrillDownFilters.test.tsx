import { describe, it, expect, vi, beforeEach } from "vitest";
import { configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import * as api from "../../src/api.js";
import { AppRoutes } from "../../src/AppRoutes.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { ROUTER_FUTURE } from "../lab-03/routerFuture.js";
import { ADMIN, REQUESTER, STAFF } from "./dashboardFixtures.js";

// UI-21 — the screens a dashboard drills down to open with its filter applied
// and ask the API for it (docs/lab-04/ui-spec.md §7; specification.md D-13, AC-23).

configure({ asyncUtilTimeout: 5000 }); // whole-app render; cold start (see TicketWorkflow.test.tsx)

const EMPTY_PAGE = { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 };

// Lab 3's LocationProbe shows only the path; these filters live in the query string.
function UrlProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{pathname + search}</output>;
}

// Stands in for the browser's Back button and for a link from another screen.
function History() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate(-1)}>test: back</button>
      <button type="button" onClick={() => navigate("/tickets?status=RESOLVED&sort=updatedAt&order=desc")}>test: resolved, by update</button>
    </>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue([]);
  vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue([]);
});

function renderAt(path: string, user: api.AuthUser) {
  vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(user);
  render(
    <AuthProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
        <AppRoutes />
        <UrlProbe />
        <History />
      </MemoryRouter>
    </AuthProvider>,
  );
}
const location = () => screen.getByTestId("location");
const lastCall = <T,>(spy: { mock: { calls: T[][] } }) => spy.mock.calls[spy.mock.calls.length - 1][0];

describe("UI-21 My Tickets reads its status and sort from the URL (D-13)", () => {
  it("opens /tickets?status=WAITING_FOR_REQUESTER filtered, and keeps a changed status in the URL", async () => {
    const list = vi.spyOn(api, "fetchTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets?status=WAITING_FOR_REQUESTER", REQUESTER);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(lastCall(list)).toMatchObject({ status: "WAITING_FOR_REQUESTER" });
    const select = screen.getByLabelText("Status", { selector: "#mt-status" });
    expect(select).toHaveValue("WAITING_FOR_REQUESTER");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All", "Open requests", "New", "Open", "In progress", "Waiting for requester", "Resolved", "Closed", "Reopened", "Cancelled",
    ]);

    await userEvent.selectOptions(select, "UNRESOLVED");
    await waitFor(() => expect(location()).toHaveTextContent("status=UNRESOLVED"));
    await waitFor(() => expect(lastCall(list)).toMatchObject({ status: "UNRESOLVED", page: 1 }));
    await userEvent.selectOptions(select, "ALL");
    await waitFor(() => expect(location()).toHaveTextContent(/^\/tickets$/));
    expect(lastCall(list)).not.toHaveProperty("status");
  });

  it("opens /tickets?sort=updatedAt&order=desc with that sort", async () => {
    const list = vi.spyOn(api, "fetchTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets?sort=updatedAt&order=desc", REQUESTER);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(lastCall(list)).toMatchObject({ sort: "updatedAt", order: "desc" });
    expect(screen.getByLabelText("Sort", { selector: "#mt-sort" })).toHaveValue("updatedAt:desc");
  });

  it("writes a changed sort to the URL, and Clear filters empties the URL", async () => {
    const list = vi.spyOn(api, "fetchTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets?status=RESOLVED", REQUESTER);
    await waitFor(() => expect(list).toHaveBeenCalled());
    await userEvent.selectOptions(screen.getByLabelText("Sort", { selector: "#mt-sort" }), "updatedAt:desc");
    await waitFor(() => expect(location()).toHaveTextContent("/tickets?status=RESOLVED&sort=updatedAt&order=desc"));
    await waitFor(() => expect(lastCall(list)).toMatchObject({ status: "RESOLVED", sort: "updatedAt", order: "desc" }));

    await userEvent.click(screen.getAllByRole("button", { name: /clear filters/i })[0]);
    await waitFor(() => expect(location()).toHaveTextContent(/^\/tickets$/));
    await waitFor(() => expect(lastCall(list)).toMatchObject({ sort: "createdAt", order: "desc" }));
    expect(lastCall(list)).not.toHaveProperty("status");
    expect(screen.getByLabelText("Status", { selector: "#mt-status" })).toHaveValue("ALL");
  });

  it("offers Clear filters when the only filter is the status from the URL", async () => {
    vi.spyOn(api, "fetchTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets?status=CLOSED", REQUESTER);
    // With no tickets and a filter applied, the empty state offers to clear it.
    expect(await screen.findByText(/no tickets match/i)).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: /clear filters/i })) expect(button).toBeEnabled();
  });

  // PR #79 review: the sort was read from the URL only once, so leaving a
  // filtered URL through the navigation reset the status but kept the old sort.
  it("follows the URL when the My Tickets link leaves a filtered and sorted view", async () => {
    const list = vi.spyOn(api, "fetchTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets?status=RESOLVED&sort=updatedAt&order=desc", REQUESTER);
    await waitFor(() => expect(lastCall(list)).toMatchObject({ status: "RESOLVED", sort: "updatedAt", order: "desc" }));
    await userEvent.click(screen.getAllByRole("link", { name: "My Tickets" })[0]);
    await waitFor(() => expect(location()).toHaveTextContent(/^\/tickets$/));
    await waitFor(() => expect(lastCall(list)).toMatchObject({ sort: "createdAt", order: "desc" }));
    expect(lastCall(list)).not.toHaveProperty("status");
    expect(screen.getByLabelText("Sort", { selector: "#mt-sort" })).toHaveValue("createdAt:desc");
    expect(screen.getByLabelText("Status", { selector: "#mt-status" })).toHaveValue("ALL");
  });

  // PR #80 review: the same class as the sort: the page number outlived the filter it belonged to.
  it("returns to page 1 when the My Tickets link leaves a filtered view on page 2", async () => {
    const row = (id: number) => ({
      id, ticketNumber: `TCK-${String(id).padStart(6, "0")}`, summary: `Ticket ${id}`, requestedPriority: "MEDIUM", currentStatus: "RESOLVED",
      category: { id: 1, name: "Hardware" }, relatedSystem: { id: 1, name: "Corporate Laptop" }, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-02T09:00:00.000Z",
    });
    const list = vi.spyOn(api, "fetchTickets").mockImplementation(async (params = {}) => ({
      data: [row(params.page ?? 1)] as unknown as api.TicketListItem[],
      pagination: { page: params.page ?? 1, pageSize: 10, totalItems: 16, totalPages: 2 },
    }));
    renderAt("/tickets?status=RESOLVED", REQUESTER);
    await screen.findAllByText("Ticket 1");
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(lastCall(list)).toMatchObject({ status: "RESOLVED", page: 2 }));
    await userEvent.click(screen.getAllByRole("link", { name: "My Tickets" })[0]);
    await waitFor(() => expect(location()).toHaveTextContent(/^\/tickets$/));
    await waitFor(() => expect(lastCall(list)).toMatchObject({ page: 1 }));
    expect(lastCall(list)).not.toHaveProperty("status");
    // One request for the new view, not a stale page 2 first.
    expect(list.mock.calls.filter(([p]) => p?.page === 2 && !p?.status)).toEqual([]);
  });

  // PR #80 re-review: the page was remembered per view, so going Back to a view
  // restored its page, although the ui-spec says a changed view starts at page 1.
  it("starts at page 1 whenever the URL changes the view: a sort alone, and Back to an earlier view", async () => {
    const list = vi.spyOn(api, "fetchTickets").mockImplementation(async (params = {}) => ({
      data: [{
        id: 1, ticketNumber: "TCK-000001", summary: "Ticket 1", requestedPriority: "MEDIUM", currentStatus: "RESOLVED",
        category: { id: 1, name: "Hardware" }, relatedSystem: { id: 1, name: "Corporate Laptop" }, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-02T09:00:00.000Z",
      }] as unknown as api.TicketListItem[],
      pagination: { page: params.page ?? 1, pageSize: 10, totalItems: 16, totalPages: 2 },
    }));
    renderAt("/tickets?status=RESOLVED", REQUESTER);
    await waitFor(() => expect(lastCall(list)).toMatchObject({ status: "RESOLVED", page: 1 }));
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(lastCall(list)).toMatchObject({ status: "RESOLVED", page: 2 }));

    // The same status with another sort: a new view, so page 1.
    await userEvent.click(screen.getByRole("button", { name: "test: resolved, by update" }));
    await waitFor(() => expect(lastCall(list)).toMatchObject({ status: "RESOLVED", sort: "updatedAt", order: "desc", page: 1 }));

    // Back to the first view: page 1 again, not the page 2 it was left on.
    await userEvent.click(screen.getByRole("button", { name: "test: back" }));
    await waitFor(() => expect(location()).toHaveTextContent(/^\/tickets\?status=RESOLVED$/));
    await waitFor(() => expect(lastCall(list)).toMatchObject({ status: "RESOLVED", sort: "createdAt", page: 1 }));
    expect(list.mock.calls.filter(([p]) => p?.page === 2)).toHaveLength(1);
  });

  it("falls back to every ticket for an unknown status in the URL", async () => {
    const list = vi.spyOn(api, "fetchTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets?status=bogus", REQUESTER);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(lastCall(list)).not.toHaveProperty("status");
    expect(screen.getByLabelText("Status", { selector: "#mt-status" })).toHaveValue("ALL");
  });
});

// Issue 8 (found by RESP-01 on mobile): below 768px the filters sit behind a
// "Filters" toggle. A drill-down opened a filtered list with the toggle closed,
// so nothing on the screen said the list was filtered.
describe("UI-21 a filter from the URL is on show in the mobile filters too (ui-spec §7)", () => {
  it("opens My Tickets' mobile filters when the URL carries a status", async () => {
    vi.spyOn(api, "fetchTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets?status=RESOLVED", REQUESTER);
    const toggle = await screen.findByRole("button", { name: "Filters" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("mt-mobile-status")).toHaveValue("RESOLVED");
  });

  it("opens My Tickets' mobile filters for a sort alone", async () => {
    vi.spyOn(api, "fetchTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets?sort=updatedAt&order=desc", REQUESTER);
    expect(await screen.findByRole("button", { name: "Filters" })).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("mt-mobile-sort")).toHaveValue("updatedAt:desc");
  });

  it("keeps My Tickets' mobile filters closed without a filter in the URL", async () => {
    vi.spyOn(api, "fetchTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets", REQUESTER);
    expect(await screen.findByRole("button", { name: "Filters" })).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("mt-mobile-status")).toBeNull();
  });

  it("opens the queue's mobile filters when the URL carries a filter", async () => {
    const page = (status: string) => ({
      data: [], pagination: EMPTY_PAGE,
      appliedQuery: { search: "", status, itPriority: null, categoryId: null, owner: "any", appearsResolved: false, sort: "itPriority", order: "desc", page: 1, pageSize: 10 },
    });
    vi.spyOn(api, "fetchStaffQueue").mockResolvedValue(page("UNRESOLVED") as unknown as api.QueueResponse);
    renderAt("/staff/queue?status=UNRESOLVED&itPriority=HIGH", STAFF);
    expect(await screen.findByRole("button", { name: "Filters" })).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("queue-mobile-status")).toHaveValue("UNRESOLVED");
  });

  it("keeps the queue's mobile filters closed on a plain /staff/queue", async () => {
    vi.spyOn(api, "fetchStaffQueue").mockResolvedValue({
      data: [], pagination: EMPTY_PAGE,
      appliedQuery: { search: "", status: "ACTIVE", itPriority: null, categoryId: null, owner: "any", appearsResolved: false, sort: "itPriority", order: "desc", page: 1, pageSize: 10 },
    } as unknown as api.QueueResponse);
    renderAt("/staff/queue", STAFF);
    expect(await screen.findByRole("button", { name: "Filters" })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("UI-21 the queue offers Unresolved (D-13)", () => {
  it("opens /staff/queue?status=UNRESOLVED with Unresolved chosen, and asks the API for it", async () => {
    const queue = vi.spyOn(api, "fetchStaffQueue").mockResolvedValue({
      data: [], pagination: EMPTY_PAGE,
      appliedQuery: { search: "", status: "UNRESOLVED", itPriority: "HIGH", categoryId: null, owner: "any", appearsResolved: false, sort: "itPriority", order: "desc", page: 1, pageSize: 10 },
    });
    renderAt("/staff/queue?status=UNRESOLVED&itPriority=HIGH", STAFF);
    await waitFor(() => expect(queue).toHaveBeenCalled());
    expect(lastCall(queue)).toMatchObject({ status: "UNRESOLVED", itPriority: "HIGH" });
    const select = screen.getAllByLabelText("Status")[0];
    expect(select).toHaveValue("UNRESOLVED");
    expect(within(select).getByRole("option", { name: "Unresolved" })).toBeInTheDocument();
  });
});

describe("UI-21 User Management reads role and activation from the URL (D-13)", () => {
  it("opens filtered, shows a removable chip, and dropping it asks for every user again", async () => {
    const users = vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([]);
    renderAt("/admin/users?role=IT_STAFF&status=active", ADMIN);
    await waitFor(() => expect(users).toHaveBeenCalled());
    expect(lastCall(users)).toEqual({ role: "IT_STAFF", status: "active" });
    expect(screen.getByLabelText("Role")).toHaveValue("IT_STAFF");
    const chip = screen.getByText("Active only");
    await userEvent.click(screen.getByRole("button", { name: "Remove the Active only filter" }));
    await waitFor(() => expect(location()).toHaveTextContent(/^\/admin\/users\?role=IT_STAFF$/));
    await waitFor(() => expect(lastCall(users)).toEqual({ role: "IT_STAFF" }));
    expect(chip).not.toBeInTheDocument();
  });

  // PR #80 review: nothing failed if the activation filter stopped counting as a filter.
  it("says no users match, with Clear, when the activation filter alone finds nobody", async () => {
    const users = vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([]);
    renderAt("/admin/users?status=inactive", ADMIN);
    expect(await screen.findByText("No users match your search.")).toBeInTheDocument();
    expect(screen.queryByText("No users yet.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(location()).toHaveTextContent(/^\/admin\/users$/));
    await waitFor(() => expect(lastCall(users)).toEqual({}));
    expect(await screen.findByText("No users yet.")).toBeInTheDocument();
  });

  it("lists every user, with no chip, for an unknown status in the URL", async () => {
    const users = vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([]);
    renderAt("/admin/users?status=bogus", ADMIN);
    await waitFor(() => expect(users).toHaveBeenCalled());
    expect(lastCall(users)).toEqual({});
    expect(screen.queryByText(/only$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove the/ })).not.toBeInTheDocument();
  });

  it("shows Inactive only for status=inactive, and writes a changed role to the URL", async () => {
    const users = vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([]);
    renderAt("/admin/users?status=inactive", ADMIN);
    await waitFor(() => expect(lastCall(users)).toEqual({ status: "inactive" }));
    expect(screen.getByText("Inactive only")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Role"), "REQUESTER");
    await waitFor(() => expect(location()).toHaveTextContent(/role=REQUESTER/));
    await waitFor(() => expect(lastCall(users)).toEqual({ role: "REQUESTER", status: "inactive" }));
  });
});

describe("UI-21 the filters reach the API as query parameters (api-spec §4)", () => {
  it("sends status to My Tickets and to the user list, and leaves it out when absent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ data: [], pagination: EMPTY_PAGE }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    await api.fetchTickets({ status: "UNRESOLVED", page: 1 });
    await api.fetchTickets({ page: 1 });
    await api.fetchAdminUsers({ role: "IT_STAFF", status: "inactive" });
    const urls = fetchSpy.mock.calls.map(([url]) => String(url));
    expect(new URLSearchParams(urls[0].split("?")[1]).get("status")).toBe("UNRESOLVED");
    expect(urls[1]).not.toContain("status=");
    expect(Object.fromEntries(new URLSearchParams(urls[2].split("?")[1]))).toEqual({ role: "IT_STAFF", status: "inactive" });
  });
});
