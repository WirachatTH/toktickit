import { describe, it, expect, vi, beforeEach } from "vitest";
import { configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as api from "../../src/api.js";
import { AppRoutes } from "../../src/AppRoutes.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { ROUTER_FUTURE } from "../lab-03/routerFuture.js";
import { ADMIN, adminDashboard, STAFF, staffDashboard } from "./dashboardFixtures.js";

// UI-15 to UI-17 — the IT Staff and Administrator dashboards
// (docs/lab-04/ui-spec.md §1.3, §1.4, §3.1, §3.2, §3.4, §3.5; specification.md
// FR-11, FR-13, FR-15, BR-34). The real route table and shell; only the network
// is mocked. The fixtures make every metric differ from its list's length.

// The whole app renders; its first render in a file is a cold start (see TicketWorkflow.test.tsx).
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderDashboard(user: api.AuthUser) {
  vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(user);
  render(
    <AuthProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={["/dashboard"]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const card = (label: string) => screen.getByRole("group", { name: label });

describe("UI-15 the IT Staff Dashboard shows the API's values (FR-11, BR-34)", () => {
  it("renders the heading, data time, every card in API order with its exact value and drill-down", async () => {
    const load = vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(staffDashboard());
    renderDashboard(STAFF);
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome back, Pimchanok" })).toBeInTheDocument();
    // The heading shows while the data loads; the data time arrives with it.
    expect(await screen.findByText("Updated 16:12 (Bangkok time)")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);

    const cards = screen.getAllByRole("group").filter((g) => g.classList.contains("zg-metric-card"));
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["Unassigned", "My tickets", "My planned actions", "Requester says resolved", "Created today", "Resolved today"]);
    for (const m of staffDashboard().metrics) {
      expect(within(card(m.label)).getByText(String(m.value))).toHaveClass("zg-metric-card__value");
      expect(within(card(m.label)).getByRole("link", { name: `View ${m.label} (${m.value})` })).toHaveAttribute("href", m.href);
    }
    // 9 planned actions counted by the server, 2 listed: the card shows 9, nothing is recounted.
    expect(within(card("My planned actions")).getByText("9")).toBeInTheDocument();
    expect(within(card("Created today")).getByText("Bangkok day; the queue opens newest first")).toBeInTheDocument();
    expect(within(card("Resolved today")).getByText("0")).toBeInTheDocument();
  });

  it("renders the status and priority strips as links with full names", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(staffDashboard());
    renderDashboard(STAFF);
    const strip = await screen.findByRole("list", { name: "By status" });
    const links = within(strip).getAllByRole("link");
    expect(links).toHaveLength(8);
    expect(within(strip).getByRole("link", { name: "In progress: 12 tickets" })).toHaveAttribute("href", "/staff/queue?status=IN_PROGRESS");
    expect(within(strip).getByText("IN PROGRESS")).toHaveClass("zg-badge--status-in-progress");
    const priorities = screen.getByRole("list", { name: "Unresolved by IT Priority" });
    expect(within(priorities).getByRole("link", { name: "High: 20 tickets" })).toHaveAttribute("href", "/staff/queue?status=UNRESOLVED&itPriority=HIGH");
  });

  it("renders the lists with links to each ticket and their View all, and the Quick actions", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(staffDashboard());
    renderDashboard(STAFF);
    const planned = await screen.findByRole("region", { name: "My planned actions" });
    expect(planned).toHaveAttribute("id", "my-planned-actions");
    const plannedLinks = within(planned).getAllByRole("link");
    expect(plannedLinks[0]).toHaveAttribute("href", "/staff/tickets/42#action-118");
    expect(plannedLinks[0]).toHaveAccessibleName(expect.stringContaining("Replace the laptop battery."));
    expect(plannedLinks[0]).toHaveAccessibleName(expect.stringContaining("TCK-000042"));

    const urgent = screen.getByRole("region", { name: "Urgent tickets" });
    expect(within(urgent).getByRole("link", { name: /TCK-000050: Payroll server unreachable/ })).toHaveAttribute("href", "/staff/tickets/50");
    expect(within(urgent).getByRole("link", { name: "View all urgent tickets" })).toHaveAttribute("href", "/staff/queue?status=UNRESOLVED&itPriority=HIGH&sort=createdAt&order=asc");

    const recent = screen.getByRole("region", { name: "Recently updated" });
    expect(within(recent).getAllByRole("listitem")).toHaveLength(2);
    expect(within(recent).getByRole("link", { name: "View all recently updated tickets" })).toHaveAttribute("href", "/staff/queue?sort=updatedAt&order=desc");
    expect(within(recent).getByTitle("Laptop battery drains quickly")).toBeInTheDocument();

    const quick = screen.getByRole("region", { name: "Quick actions" });
    expect(within(quick).getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Ticket Queue", "/staff/queue"],
      ["Unassigned tickets", "/staff/queue?owner=unassigned"],
      ["My tickets", "/staff/queue?owner=me"],
    ]);
  });
});

describe("UI-16 loading, empty lists, failure, and refresh (FR-15, ui-spec §3.5)", () => {
  it("shows a busy skeleton while loading", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockReturnValue(new Promise(() => undefined));
    renderDashboard(STAFF);
    const busy = await screen.findByRole("status", { name: "Loading dashboard" });
    expect(busy).toHaveAttribute("aria-busy", "true");
  });

  it("says why each list is empty while the cards still show 0", async () => {
    const empty = staffDashboard();
    empty.metrics = empty.metrics.map((m) => ({ ...m, value: 0 }));
    empty.lists = { myPlannedActions: [], urgent: [], recentlyUpdated: [] };
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(empty);
    renderDashboard(STAFF);
    expect(await screen.findByText("No planned actions assigned to you.")).toBeInTheDocument();
    expect(screen.getByText("No urgent tickets right now.")).toBeInTheDocument();
    expect(screen.getByText("No tickets were updated recently.")).toBeInTheDocument();
    expect(within(card("Unassigned")).getByText("0")).toBeInTheDocument();
  });

  it("shows a safe failure with Retry, which loads again", async () => {
    const load = vi.spyOn(api, "fetchStaffDashboard").mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(staffDashboard());
    renderDashboard(STAFF);
    expect(await screen.findByText("We couldn't load your dashboard.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Unassigned" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("group", { name: "Unassigned" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never shows an earlier load's values or time beside a failed refresh", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValueOnce(staffDashboard()).mockRejectedValueOnce(new Error("network down"));
    renderDashboard(STAFF);
    await screen.findByText("Updated 16:12 (Bangkok time)");
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("We couldn't load your dashboard.")).toBeInTheDocument();
    expect(screen.queryByText("Updated 16:12 (Bangkok time)")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Unassigned" })).not.toBeInTheDocument();
  });

  it("keeps the values on screen while refreshing, and shows the new ones after", async () => {
    let finish!: (d: api.StaffDashboard) => void;
    const next = staffDashboard();
    next.metrics[0] = { ...next.metrics[0], value: 11 };
    const load = vi.spyOn(api, "fetchStaffDashboard").mockResolvedValueOnce(staffDashboard()).mockImplementationOnce(() => new Promise((r) => (finish = r)));
    renderDashboard(STAFF);
    await screen.findByRole("group", { name: "Unassigned" });
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const refreshing = screen.getByRole("button", { name: /Refreshing/ });
    expect(refreshing).toBeDisabled();
    expect(within(card("Unassigned")).getByText("4")).toBeInTheDocument();
    finish(next);
    await waitFor(() => expect(within(card("Unassigned")).getByText("11")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status", { name: "Dashboard updates" })).toHaveTextContent("Dashboard updated");
  });
});

describe("UI-17 the Administrator Dashboard (FR-13, BR-41, ui-spec §3.4)", () => {
  it("shows the read-only note, the ticket metrics, the user counts with their links, and the admin Quick actions", async () => {
    const load = vi.spyOn(api, "fetchAdminDashboard").mockResolvedValue(adminDashboard());
    const staffLoad = vi.spyOn(api, "fetchStaffDashboard");
    renderDashboard(ADMIN);
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome back, Siriporn" })).toBeInTheDocument();
    await screen.findByRole("group", { name: "Unassigned" });
    expect(load).toHaveBeenCalledTimes(1);
    expect(staffLoad).not.toHaveBeenCalled();
    expect(screen.getByText("Ticket metrics are read-only for Administrators")).toHaveClass("zg-pill", "zg-pill--readonly");
    expect(within(card("Unassigned")).getByText("4")).toBeInTheDocument();

    const accounts = screen.getByRole("region", { name: "User accounts" });
    for (const u of adminDashboard().users) {
      expect(within(accounts).getByText(u.label)).toBeInTheDocument();
      expect(within(accounts).getByRole("link", { name: `View ${u.label} (${u.value})` })).toHaveAttribute("href", u.href);
    }
    expect(within(accounts).getByRole("link", { name: "Manage users" })).toHaveAttribute("href", "/admin/users");
    const quick = screen.getByRole("region", { name: "Quick actions" });
    expect(within(quick).getAllByRole("link").map((l) => l.textContent)).toEqual(["User Management", "Ticket Queue"]);
  });
});
