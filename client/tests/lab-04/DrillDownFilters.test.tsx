import { describe, it, expect, vi, beforeEach } from "vitest";
import { configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
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

  it("falls back to every ticket for an unknown status in the URL", async () => {
    const list = vi.spyOn(api, "fetchTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets?status=bogus", REQUESTER);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(lastCall(list)).not.toHaveProperty("status");
    expect(screen.getByLabelText("Status", { selector: "#mt-status" })).toHaveValue("ALL");
  });
});

describe("UI-21 the queue offers Unresolved (D-13)", () => {
  it("opens /staff/queue?status=UNRESOLVED with Unresolved chosen, and asks the API for it", async () => {
    const queue = vi.spyOn(api, "fetchStaffQueue").mockResolvedValue({
      data: [], pagination: EMPTY_PAGE,
      appliedQuery: { search: "", status: "UNRESOLVED", itPriority: null, categoryId: null, owner: "any", appearsResolved: false, sort: "itPriority", order: "desc", page: 1, pageSize: 10 },
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
