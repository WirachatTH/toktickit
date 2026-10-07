import { describe, it, expect, vi, beforeEach } from "vitest";
import { configure, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as api from "../../src/api.js";
import { AppRoutes } from "../../src/AppRoutes.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { ROUTER_FUTURE } from "../lab-03/routerFuture.js";
import { emptyRequesterDashboard, REQUESTER, requesterDashboard } from "./dashboardFixtures.js";

// UI-18, UI-19 — the Requester Dashboard (docs/lab-04/ui-spec.md §3.3, §3.5;
// specification.md FR-12, FR-15, BR-36, AC-18).

configure({ asyncUtilTimeout: 5000 }); // whole-app render; cold start (see TicketWorkflow.test.tsx)

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(REQUESTER);
});

function renderDashboard() {
  render(
    <AuthProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={["/dashboard"]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}
const card = (label: string) => screen.getByRole("group", { name: label });

describe("UI-18 the Requester's own summary (FR-12, AC-18)", () => {
  it("greets them, shows each card's exact value and drill-down, and never IT Priority", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
    renderDashboard();
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome, Somchai" })).toBeInTheDocument();
    for (const m of requesterDashboard().metrics) {
      expect(within(card(m.label)).getByRole("link", { name: `View ${m.label} (${m.value})` })).toHaveAttribute("href", m.href);
    }
    // 12 closed counted by the server, none listed: nothing is recounted.
    expect(within(card("Closed")).getByText("12")).toBeInTheDocument();
    expect(screen.queryByText(/IT Priority/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^(HIGH|MEDIUM|LOW)$/)).not.toBeInTheDocument();
  });

  it("marks 'Waiting for you' in words, not only colour, whenever it is above 0", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
    renderDashboard();
    const waiting = await screen.findByRole("group", { name: "Waiting for you" });
    expect(waiting).toHaveClass("zg-metric-card--attention");
    expect(within(waiting).getByText("Needs your reply")).toBeInTheDocument();
    expect(within(card("Open requests")).queryByText("Needs your reply")).not.toBeInTheDocument();
  });

  it("lists their tickets with links to their own detail screen, View all links, and Quick actions", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(requesterDashboard());
    renderDashboard();
    const attention = await screen.findByRole("region", { name: "Needs your attention" });
    expect(within(attention).getByRole("link", { name: /TCK-000061: Docking station no longer charges/ })).toHaveAttribute("href", "/tickets/61");
    expect(within(attention).getByRole("link", { name: "View all tickets waiting for you" })).toHaveAttribute("href", "/tickets?status=WAITING_FOR_REQUESTER");
    const recent = screen.getByRole("region", { name: "Recently updated" });
    expect(within(recent).getByRole("link", { name: "View all recently updated tickets" })).toHaveAttribute("href", "/tickets?sort=updatedAt&order=desc");
    const resolved = screen.getByRole("region", { name: "Recently resolved (last 7 days)" });
    expect(within(resolved).getByRole("link", { name: /TCK-000062/ })).toHaveAttribute("href", "/tickets/62");
    expect(within(resolved).getByRole("link", { name: "View all resolved tickets" })).toHaveAttribute("href", "/tickets?status=RESOLVED");
    const quick = screen.getByRole("region", { name: "Quick actions" });
    expect(within(quick).getAllByRole("link").map((l) => [l.getAttribute("href"), l.textContent])).toEqual([
      ["/tickets/new", "Create TicketSubmit a new request"],
      ["/tickets", "My TicketsTrack your requests"],
    ]);
  });
});

describe("UI-19 a brand-new Requester, and failure (FR-15, ui-spec §3.5)", () => {
  it("shows every card at 0, the list sentences, and an invitation to create a first ticket", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(emptyRequesterDashboard());
    renderDashboard();
    const start = await screen.findByRole("region", { name: "Getting started" });
    expect(within(start).getByText("You haven't submitted any requests yet.")).toBeInTheDocument();
    expect(within(start).getByRole("link", { name: "Create Ticket" })).toHaveAttribute("href", "/tickets/new");
    for (const label of ["Open requests", "Waiting for you", "Resolved", "Closed"]) expect(within(card(label)).getByText("0")).toBeInTheDocument();
    expect(within(card("Waiting for you")).queryByText("Needs your reply")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing needs your reply right now.")).toBeInTheDocument();
    expect(screen.getByText("No tickets were resolved in the last 7 days.")).toBeInTheDocument();
  });

  it("shows a safe failure with Retry", async () => {
    const load = vi.spyOn(api, "fetchRequesterDashboard").mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(requesterDashboard());
    renderDashboard();
    expect(await screen.findByText("We couldn't load your dashboard.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("group", { name: "Open requests" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
