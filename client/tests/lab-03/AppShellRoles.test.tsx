import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as api from "../../src/api.js";
import { AppRoutes } from "../../src/AppRoutes.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { LocationProbe, REQUESTER } from "./authTestUtils.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// The app shell and routing for signed-in users (docs/lab-03/ui-spec.md §2):
// UI-09 to UI-13. The real route table, providers, and shell are rendered;
// only the network is mocked.

const STAFF: api.AuthUser = { ...REQUESTER, id: 8, name: "Pimchanok Srisuk", email: "pimchanok.srisuk@kmutt.ac.th", role: "IT_STAFF" };
const ADMIN: api.AuthUser = { ...REQUESTER, id: 9, name: "Siriporn Boonmee", email: "siriporn.boonmee@kmutt.ac.th", role: "ADMINISTRATOR" };
const EMPTY_LIST: api.TicketListResponse = { data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } };

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  vi.spyOn(api, "checkSystem").mockResolvedValue({ online: true, categories: [] });
  vi.spyOn(api, "fetchTickets").mockResolvedValue(EMPTY_LIST);
  vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue([]);
  // Issue 7 — the IT Staff home is now the real queue (setup only).
  vi.spyOn(api, "fetchStaffQueue").mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 }, appliedQuery: { search: "", status: "ACTIVE", itPriority: null, categoryId: null, owner: "any", appearsResolved: false, sort: "itPriority", order: "desc", page: 1, pageSize: 10 } });
  vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue([]);
  // Issue 9 — the Administrator home is now the real User Management list (setup only).
  vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([]);
  // Lab 4 BR-46 (1): every home is now the Dashboard, which loads its own data (setup only).
  const dashboard = { generatedAt: "2026-10-07T09:00:00.000Z", timeZone: "Asia/Bangkok", today: { start: "2026-10-06T17:00:00.000Z", end: "2026-10-07T17:00:00.000Z" }, metrics: [], lists: {} };
  vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue({ ...dashboard, lists: { needsAttention: [], recentlyUpdated: [], recentlyResolved: [] } });
  vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue({ ...dashboard, byStatus: [], byItPriority: [], lists: { myPlannedActions: [], urgent: [], recentlyUpdated: [] } });
  vi.spyOn(api, "fetchAdminDashboard").mockResolvedValue({ ...dashboard, byStatus: [], byItPriority: [], lists: { myPlannedActions: [], urgent: [], recentlyUpdated: [] }, users: [] });
});

function renderAppAt(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const signedInAs = (user: api.AuthUser | null) => vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(user);
const location = () => screen.getByTestId("location");

// The destinations in the primary navigation, without the account actions.
function destinations() {
  const nav = screen.getByRole("navigation", { name: "Primary" });
  return within(nav)
    .getAllByRole("link")
    .filter((link) => !link.closest('[aria-label="Account"]'))
    .map((link) => [link.textContent, link.getAttribute("href")]);
}

describe("UI-09 the app shell for each role", () => {
  // Lab 4 BR-46 (1): Dashboard is every role's first destination (D-08).
  it.each([
    ["Requester", REQUESTER, "/tickets", "zg-badge--role-requester", [["Dashboard", "/dashboard"], ["My Tickets", "/tickets"], ["Create Ticket", "/tickets/new"]]],
    ["IT Staff", STAFF, "/staff/queue", "zg-badge--role-it-staff", [["Dashboard", "/dashboard"], ["Ticket Queue", "/staff/queue"]]],
    ["Administrator", ADMIN, "/admin/users", "zg-badge--role-administrator", [["Dashboard", "/dashboard"], ["User Management", "/admin/users"], ["Ticket Queue", "/staff/queue"]]],
  ] as const)("shows an %s exactly its destinations, name, role badge, Change password and Log out", async (badgeText, user, home, badgeClass, expected) => {
    signedInAs(user);
    renderAppAt(home);
    const account = await screen.findByRole("group", { name: "Account" });

    expect(destinations()).toEqual(expected);
    expect(within(account).getByText(user.name)).toBeInTheDocument();
    const badge = within(account).getByText(badgeText);
    expect(badge).toHaveClass("zg-badge", badgeClass);
    expect(within(account).getByRole("link", { name: "Change password" })).toHaveAttribute("href", "/change-password");
    expect(within(account).getByRole("button", { name: "Log out" })).toBeInTheDocument();
    // The Lab 2 Development Requester display is gone for a signed-in user.
    expect(screen.queryByRole("button", { name: /change requester/i })).not.toBeInTheDocument();
  });

  it("marks the current destination with aria-current", async () => {
    signedInAs(ADMIN);
    renderAppAt("/staff/queue");
    await screen.findByRole("group", { name: "Account" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Ticket Queue" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "User Management" })).not.toHaveAttribute("aria-current");
  });
});

describe("UI-10 routes a role may not open, and routes that need a sign-in", () => {
  // Lab 4 BR-46 (1): every role's home is now the Dashboard (D-08).
  it.each([
    ["a Requester", "/admin/users", "/dashboard", REQUESTER],
    ["a Requester", "/staff/queue", "/dashboard", REQUESTER],
    ["IT Staff", "/tickets/new", "/dashboard", STAFF],
    ["IT Staff", "/admin/users", "/dashboard", STAFF],
    ["an Administrator", "/tickets", "/dashboard", ADMIN],
  ] as const)("sends %s from %s to its home %s with a dismissible forbidden callout", async (_who, path, home, user) => {
    signedInAs(user);
    renderAppAt(path);
    await waitFor(() => expect(location()).toHaveTextContent(new RegExp(`^${home}$`)));
    const callout = await screen.findByRole("alert");
    expect(callout).toHaveTextContent("You don't have access to that page.");

    await userEvent.click(within(callout).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("You don't have access to that page.")).not.toBeInTheDocument();
  });

  it("sends a signed-out visitor to Login, then back to the route they asked for", async () => {
    signedInAs(null);
    vi.spyOn(api, "fetchTicket").mockRejectedValue(new api.ApiError(404, "NOT_FOUND", "Ticket not found."));
    vi.spyOn(api, "login").mockResolvedValue(REQUESTER);
    renderAppAt("/tickets/42");
    await waitFor(() => expect(location()).toHaveTextContent("/login"));
    // No session-ended banner: this visitor never had a session.
    expect(screen.queryByText(/your session has ended/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^Email/), REQUESTER.email);
    await userEvent.type(screen.getByLabelText(/^Password/), "Some-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(location()).toHaveTextContent("/tickets/42"));
  });

  it("sends them to their own home instead when their role may not open that route", async () => {
    signedInAs(null);
    vi.spyOn(api, "login").mockResolvedValue(REQUESTER);
    renderAppAt("/admin/users");
    await waitFor(() => expect(location()).toHaveTextContent("/login"));

    await userEvent.type(screen.getByLabelText(/^Email/), REQUESTER.email);
    await userEvent.type(screen.getByLabelText(/^Password/), "Some-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    // Lab 4 BR-46 (1): the Requester's home is now the Dashboard.
    await waitFor(() => expect(location()).toHaveTextContent(/^\/dashboard$/));
    // Sent home by Login itself, not bounced off the forbidden route: no callout.
    await screen.findByRole("group", { name: "Account" });
    expect(screen.queryByText("You don't have access to that page.")).not.toBeInTheDocument();
  });

  it("keeps Lab 1's System Status page public (D-18)", async () => {
    signedInAs(null);
    renderAppAt("/");
    expect(await screen.findByRole("button", { name: /check system/i })).toBeInTheDocument();
    expect(location()).toHaveTextContent(/^\/$/);
  });
});

describe("UI-11 the end of a session", () => {
  it("Log out ends the session on the server and returns to Login", async () => {
    signedInAs(REQUESTER);
    const logout = vi.spyOn(api, "logout").mockResolvedValue();
    renderAppAt("/tickets");
    const account = await screen.findByRole("group", { name: "Account" });

    await userEvent.click(within(account).getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(location()).toHaveTextContent("/login"));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/your session has ended/i)).not.toBeInTheDocument();
  });

  it("a 401 on any request mid-session returns to Login with the session-ended banner", async () => {
    signedInAs(REQUESTER);
    // The real fetchTickets, against a server that has ended the session.
    vi.mocked(api.fetchTickets).mockRestore();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    renderAppAt("/tickets");
    await waitFor(() => expect(location()).toHaveTextContent("/login"));
    expect(await screen.findByText("Your session has ended. Please sign in again.")).toBeInTheDocument();
  });

  it("only an UNAUTHENTICATED 401 counts as the end of a session — never a failed sign-in", async () => {
    const ended = vi.fn();
    const stop = api.onSessionEnded(ended);
    const reply = (code: string) =>
      new Response(JSON.stringify({ error: { code, message: "x" } }), { status: 401, headers: { "Content-Type": "application/json" } });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      fetchMock.mockResolvedValueOnce(reply("INVALID_CREDENTIALS"));
      await expect(api.login(REQUESTER.email, "Wrong-password-1")).rejects.toMatchObject({ status: 401 });
      expect(ended).not.toHaveBeenCalled();

      vi.mocked(api.fetchTickets).mockRestore();
      fetchMock.mockResolvedValueOnce(reply("UNAUTHENTICATED"));
      await expect(api.fetchTickets()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(ended).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });

  it("a wrong password at Login is not mistaken for an ended session", async () => {
    signedInAs(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    renderAppAt("/login");
    await userEvent.type(await screen.findByLabelText(/^Email/), REQUESTER.email);
    await userEvent.type(screen.getByLabelText(/^Password/), "Wrong-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Email or password is incorrect.")).toBeInTheDocument();
    expect(screen.queryByText(/your session has ended/i)).not.toBeInTheDocument();
  });
});

describe("UI-13 no Development Requester mechanism is left (FR-13)", () => {
  const KEY = "tokTickIT.devRequester";

  it("has no selector route, component, Change Requester action, or stored selection", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ id: 1, name: "Stale Selection", email: "stale@kmutt.ac.th" }));
    const reads = vi.spyOn(Storage.prototype, "getItem");
    const writes = vi.spyOn(Storage.prototype, "setItem");
    signedInAs(REQUESTER);

    // The old selector URL renders nothing of the selector.
    renderAppAt("/select-requester");
    await waitFor(() => expect(api.fetchCurrentUser).toHaveBeenCalled());
    expect(screen.queryByLabelText(/development requester/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/this is not a login screen/i)).not.toBeInTheDocument();

    // The Requester screens run on the signed-in user alone: the stale stored
    // selection is never read, never shown, and nothing is written for it.
    renderAppAt("/tickets");
    await screen.findAllByRole("group", { name: "Account" });
    expect(screen.queryByText("Stale Selection")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change requester/i })).not.toBeInTheDocument();
    expect(reads.mock.calls.filter(([key]) => key === KEY)).toHaveLength(0);
    expect(writes.mock.calls.filter(([key]) => key === KEY)).toHaveLength(0);
  });

  it("no longer offers the Development Requester API helpers", () => {
    const exported = Object.keys(api);
    expect(exported).not.toContain("fetchActiveRequesters");
    expect(exported).not.toContain("requesterHeaders");
  });
});

describe("UI-12 a user who must change their password", () => {
  it.each(["/", "/tickets", "/tickets/new", "/tickets/42", "/login", "/staff/queue", "/admin/users"])(
    "opening %s is taken to Change Password",
    async (path) => {
      signedInAs({ ...REQUESTER, mustChangePassword: true });
      renderAppAt(path);
      await waitFor(() => expect(location()).toHaveTextContent("/change-password"));
      expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
    },
  );

  it("is not redirected once the password has been changed", async () => {
    signedInAs({ ...REQUESTER, mustChangePassword: false });
    renderAppAt("/");
    // Give the provider time to load the user, then confirm nothing moved.
    await waitFor(() => expect(api.fetchCurrentUser).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(location()).toHaveTextContent(/^\/$/);
  });
});
