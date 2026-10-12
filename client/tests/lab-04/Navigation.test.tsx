import { describe, it, expect, vi, beforeEach } from "vitest";
import { configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as api from "../../src/api.js";
import { AppRoutes } from "../../src/AppRoutes.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { LocationProbe } from "../lab-03/authTestUtils.js";
import { ROUTER_FUTURE } from "../lab-03/routerFuture.js";
import { ADMIN, adminDashboard, REQUESTER, requesterDashboard, STAFF, staffDashboard } from "./dashboardFixtures.js";

// UI-20, REG-02 — Dashboard in every role's navigation and as its home, with
// every Lab 1–3 screen still reachable (docs/lab-04/ui-spec.md §2;
// specification.md FR-10, BR-45 (1), D-08, AC-26).

configure({ asyncUtilTimeout: 5000 }); // whole-app render; cold start (see TicketWorkflow.test.tsx)

const EMPTY_PAGE = { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
  vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(staffDashboard());
  vi.spyOn(api, "fetchAdminDashboard").mockResolvedValue(adminDashboard());
  vi.spyOn(api, "fetchTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
  vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue([]);
  vi.spyOn(api, "fetchStaffQueue").mockResolvedValue({ data: [], pagination: EMPTY_PAGE, appliedQuery: { search: "", status: "ACTIVE", itPriority: null, categoryId: null, owner: "any", appearsResolved: false, sort: "itPriority", order: "desc", page: 1, pageSize: 10 } });
  vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue([]);
  vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([]);
});

function renderAt(path: string, user: api.AuthUser | null) {
  vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(user);
  render(
    <AuthProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>
    </AuthProvider>,
  );
}
const location = () => screen.getByTestId("location");
const nav = () => screen.getByRole("navigation", { name: "Primary" });
const destinations = () =>
  within(nav())
    .getAllByRole("link")
    .filter((l) => !l.closest('[aria-label="Account"]'))
    .map((l) => l.textContent);

describe("UI-20 Dashboard is every role's home and first destination (FR-10, D-08)", () => {
  it.each([
    ["Requester", REQUESTER, ["Dashboard", "My Tickets", "Create Ticket"]],
    ["IT Staff", STAFF, ["Dashboard", "Ticket Queue"]],
    ["Administrator", ADMIN, ["Dashboard", "User Management", "Ticket Queue"]],
  ] as const)("puts Dashboard first for %s and marks it as the current page there", async (_who, user, expected) => {
    renderAt("/dashboard", user);
    await screen.findByRole("heading", { level: 1 });
    expect(destinations()).toEqual(expected);
    expect(within(nav()).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "TokTickIT" })).toHaveAttribute("href", "/dashboard");
  });

  it("signs a visitor in to the Dashboard", async () => {
    vi.spyOn(api, "login").mockResolvedValue(STAFF);
    renderAt("/login", null);
    await userEvent.type(await screen.findByLabelText(/^Email/), STAFF.email);
    await userEvent.type(screen.getByLabelText(/^Password/), "Some-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(location()).toHaveTextContent(/^\/dashboard$/));
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome back, Pimchanok" })).toBeInTheDocument();
  });

  it("brings a role that opens a forbidden page to its Dashboard, with the callout", async () => {
    renderAt("/admin/users", REQUESTER);
    await waitFor(() => expect(location()).toHaveTextContent(/^\/dashboard$/));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have access to that page.");
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome, Somchai" })).toBeInTheDocument();
  });

  it("keeps a list screen's link marked while on it, not Dashboard", async () => {
    renderAt("/staff/queue", STAFF);
    await screen.findByRole("heading", { name: "Ticket Queue" });
    expect(within(nav()).getByRole("link", { name: "Ticket Queue" })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });
});

describe("REG-02 every Lab 1–3 screen is still reachable from each role's navigation (AC-26, AC-33)", () => {
  it.each([
    [REQUESTER, [["My Tickets", "/tickets", "My Tickets"], ["Create Ticket", "/tickets/new", "Create Ticket"]]],
    [STAFF, [["Ticket Queue", "/staff/queue", "Ticket Queue"]]],
    [ADMIN, [["User Management", "/admin/users", "User Management"], ["Ticket Queue", "/staff/queue", "Ticket Queue"]]],
  ] as const)("opens each of %s's Lab 1–3 screens from the Dashboard", async (user, screens) => {
    renderAt("/dashboard", user);
    await screen.findByRole("heading", { level: 1 });
    for (const [link, path, heading] of screens) {
      await userEvent.click(within(nav()).getByRole("link", { name: link }));
      await waitFor(() => expect(location()).toHaveTextContent(new RegExp(`^${path}$`)));
      expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
      await userEvent.click(within(nav()).getByRole("link", { name: "Dashboard" }));
      await waitFor(() => expect(location()).toHaveTextContent(/^\/dashboard$/));
    }
  });
});
