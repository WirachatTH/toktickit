import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";
import { AppRoutes } from "../../src/AppRoutes.js";
import { DiscussionPanel } from "../../src/components/DiscussionPanel.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { ROUTER_FUTURE } from "../lab-03/routerFuture.js";
import { LocationProbe } from "../lab-03/authTestUtils.js";
import { ADMIN, REQUESTER, STAFF } from "./dashboardFixtures.js";

// REG-06, REG-07, UI-22, UI-23 — final hardening across the Lab 1–4 screens
// (docs/lab-04/specification.md FR-16 to FR-19, BR-43, BR-44, D-20; ui-spec §8).
// The Actions Taken panel has its own repeated-click and failure tests (UI-07,
// UI-08 in ActionsTaken.test.tsx); this file covers the Lab 2 and Lab 3 forms.

configure({ asyncUtilTimeout: 5000 }); // whole-app render; cold start (see TicketWorkflow.test.tsx)

const EMPTY_PAGE = { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 };
const NETWORK = () => new TypeError("Failed to fetch");
const SERVER = () => new ApiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
const pending = () => new Promise<never>(() => undefined);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue([{ id: 1, name: "Corporate Laptop" }]);
  vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue([]);
  vi.spyOn(api, "fetchComments").mockResolvedValue([]);
  vi.spyOn(api, "fetchInternalNotes").mockResolvedValue([]);
  vi.spyOn(api, "fetchActionsTaken").mockResolvedValue([]);
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

// ---------------------------------------------------------------- Create Ticket

const SUMMARY = "Laptop battery drains quickly";
const DESCRIPTION = "The battery drops from 100% to 20% within an hour of unplugging the charger.";

async function openCreateTicket() {
  renderAt("/tickets/new", REQUESTER);
  await screen.findByRole("option", { name: "Hardware" });
  await userEvent.selectOptions(screen.getByLabelText(/category/i), "1");
  await userEvent.selectOptions(screen.getByLabelText(/related system/i), "1");
  await userEvent.type(screen.getByLabelText(/ticket summary/i), SUMMARY);
  await userEvent.type(screen.getByLabelText(/description/i), DESCRIPTION);
}

function expectTicketInputKept() {
  expect(screen.getByLabelText(/category/i)).toHaveValue("1");
  expect(screen.getByLabelText(/related system/i)).toHaveValue("1");
  expect(screen.getByLabelText(/ticket summary/i)).toHaveValue(SUMMARY);
  expect(screen.getByLabelText(/description/i)).toHaveValue(DESCRIPTION);
  expect(screen.getByRole("button", { name: /submit ticket/i })).toBeEnabled();
}

// ------------------------------------------------------------- User Management

const ADMIN_USERS: api.AdminUser[] = [
  { id: 1, name: "Siriporn Boonmee", email: "siriporn.boonmee@kmutt.ac.th", role: "ADMINISTRATOR", isActive: true, mustChangePassword: false, lastLoginAt: null, createdAt: "2026-10-01T08:00:00.000Z" },
];

async function openCreateUser() {
  vi.spyOn(api, "fetchAdminUsers").mockResolvedValue(ADMIN_USERS);
  renderAt("/admin/users", { ...ADMIN, id: 1 });
  await screen.findByTestId("users-table");
  await userEvent.click(screen.getByRole("button", { name: "Create user" }));
  const panel = await screen.findByRole("dialog", { name: "Create user" });
  await userEvent.type(within(panel).getByLabelText(/^Full name/), "Napat Wongsa");
  await userEvent.type(within(panel).getByLabelText(/^Email/), "napat.wongsa@kmutt.ac.th");
  await userEvent.type(within(panel).getByLabelText(/^Initial password/), "Initial-pass-2026");
  return panel;
}

function expectUserInputKept(panel: HTMLElement) {
  expect(screen.getByRole("dialog", { name: "Create user" })).toBe(panel);
  expect(within(panel).getByLabelText(/^Full name/)).toHaveValue("Napat Wongsa");
  expect(within(panel).getByLabelText(/^Email/)).toHaveValue("napat.wongsa@kmutt.ac.th");
  expect(within(panel).getByLabelText(/^Initial password/)).toHaveValue("Initial-pass-2026");
}

// ------------------------------------------------------- Comments and notes

const STAFF_REF = { id: 8, name: "Pimchanok Srisuk", role: "IT_STAFF" as const, isActive: true };
const entry = (id: number, body: string) => ({ id, body, createdAt: "2026-10-01T10:00:00.000Z", author: STAFF_REF });
const tab = (name: RegExp) => screen.getByRole("tab", { name });
const panelOf = (name: RegExp) => document.getElementById(tab(name).getAttribute("aria-controls")!)!;

async function typeComment(text: string) {
  render(<DiscussionPanel ticketId={42} canComment canPost />);
  const box = await within(panelOf(/public comments/i)).findByRole("textbox");
  await waitFor(() => expect(box).toBeEnabled());
  await userEvent.type(box, text);
  return { box, post: within(panelOf(/public comments/i)).getByRole("button", { name: "Post public comment" }) };
}

async function typeNote(text: string) {
  render(<DiscussionPanel ticketId={42} canComment canPost />);
  await userEvent.click(tab(/internal notes/i));
  const box = await within(panelOf(/internal notes/i)).findByRole("textbox");
  await waitFor(() => expect(box).toBeEnabled());
  await userEvent.type(box, text);
  return { box, post: within(panelOf(/internal notes/i)).getByRole("button", { name: "Add internal note" }) };
}

describe("REG-06 a burst of clicks sends one request (FR-17, BR-43)", () => {
  it("Create Ticket: Submit, clicked twice and pressed again with Enter, creates one ticket", async () => {
    const create = vi.spyOn(api, "createTicket").mockImplementation(pending);
    await openCreateTicket();
    const submit = screen.getByRole("button", { name: /submit ticket/i });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.submit(submit.closest("form")!);
    expect(create).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
  });

  it("Post public comment and Add internal note each send one request", async () => {
    const postComment = vi.spyOn(api, "postComment").mockImplementation(pending);
    const comment = await typeComment("Please restart and try again.");
    fireEvent.click(comment.post);
    fireEvent.click(comment.post);
    fireEvent.submit(comment.post.closest("form")!);
    expect(postComment).toHaveBeenCalledTimes(1);
  });

  it("Add internal note sends one request", async () => {
    const postNote = vi.spyOn(api, "postInternalNote").mockImplementation(pending);
    const note = await typeNote("Root cause: recalled battery");
    fireEvent.click(note.post);
    fireEvent.click(note.post);
    fireEvent.submit(note.post.closest("form")!);
    expect(postNote).toHaveBeenCalledTimes(1);
  });

  it("Create user sends one request", async () => {
    const create = vi.spyOn(api, "createUser").mockImplementation(pending);
    const panel = await openCreateUser();
    const save = within(panel).getByRole("button", { name: "Create user" });
    fireEvent.click(save);
    fireEvent.click(save);
    fireEvent.submit(save.closest("form")!);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("REG-07 a recoverable failure keeps what was typed (FR-18, BR-44)", () => {
  it("Create Ticket keeps every value after a 400, naming the field", async () => {
    vi.spyOn(api, "createTicket").mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Some fields need attention.", { summary: "Enter a summary of at most 150 characters." }));
    await openCreateTicket();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));
    expect(await screen.findByText("Enter a summary of at most 150 characters.")).toBeInTheDocument();
    expectTicketInputKept();
  });

  it("Create Ticket keeps every value after a network error, and says the API could not be reached", async () => {
    vi.spyOn(api, "createTicket").mockRejectedValue(NETWORK());
    await openCreateTicket();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));
    expect(await screen.findByText(/cannot reach the toktickit api/i)).toBeInTheDocument();
    expectTicketInputKept();
  });

  // The server answered, so "cannot reach" would be wrong (ui-spec §8: a safe failure message).
  it("Create Ticket keeps every value after a 500, with a safe message that does not blame the network", async () => {
    vi.spyOn(api, "createTicket").mockRejectedValue(SERVER());
    await openCreateTicket();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));
    expect(
      await screen.findByText("Something went wrong. Your ticket has not been created, and nothing you entered has been lost — try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/cannot reach/i)).not.toBeInTheDocument();
    expectTicketInputKept();
  });

  // PR #80 review: with the API down, the proxy in front of it answers 5xx with
  // a body that is not the API's JSON. That is an outage, not an API error.
  it.each([
    ["a proxy's plain-text 500", () => new Response("Error occurred while trying to proxy", { status: 500, headers: { "Content-Type": "text/plain" } }), /cannot reach the toktickit api/i],
    ["a gateway's HTML 502", () => new Response("<html><body>Bad Gateway</body></html>", { status: 502, headers: { "Content-Type": "text/html" } }), /cannot reach the toktickit api/i],
    ["the API's own JSON 500", () => new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }), { status: 500, headers: { "Content-Type": "application/json" } }), /^Something went wrong\. Your ticket has not been created/],
  ])("Create Ticket reads %s correctly, and keeps every value", async (_label, response, message) => {
    await openCreateTicket();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => response());
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expectTicketInputKept();
  });

  it.each([
    ["a 400", () => new ApiError(400, "VALIDATION_ERROR", "Some fields need attention.", { body: "Enter at most 2000 characters." }), "Enter at most 2000 characters."],
    ["a network error", NETWORK, "Something went wrong. Please try again."],
    ["a 500", SERVER, "Something went wrong. Please try again."],
  ])("a public comment keeps its draft after %s", async (_label, failure, message) => {
    vi.spyOn(api, "postComment").mockRejectedValue(failure());
    const { box, post } = await typeComment("Please restart and try again.");
    await userEvent.click(post);
    expect(await within(panelOf(/public comments/i)).findByText(message)).toBeInTheDocument();
    expect(box).toHaveValue("Please restart and try again.");
  });

  it("a public comment keeps its draft after a 409 for a ticket closed meanwhile", async () => {
    vi.spyOn(api, "postComment").mockRejectedValue(new ApiError(409, "TICKET_CLOSED", "This ticket is closed."));
    const { box, post } = await typeComment("Please restart and try again.");
    await userEvent.click(post);
    await waitFor(() => expect(post).toBeDisabled());
    expect(box).toHaveValue("Please restart and try again.");
  });

  it.each([
    ["a network error", NETWORK],
    ["a 500", SERVER],
  ])("an internal note keeps its draft after %s", async (_label, failure) => {
    vi.spyOn(api, "postInternalNote").mockRejectedValue(failure());
    const { box, post } = await typeNote("Root cause: recalled battery");
    await userEvent.click(post);
    expect(await within(panelOf(/internal notes/i)).findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(box).toHaveValue("Root cause: recalled battery");
  });

  it.each([
    ["a 400", () => new ApiError(400, "VALIDATION_ERROR", "Some fields need attention.", { name: "Enter a name of 2 to 100 characters." }), "Enter a name of 2 to 100 characters."],
    ["a 409", () => new ApiError(409, "EMAIL_TAKEN", "x", { email: "Another user already has this email." }), "Another user already has this email."],
    ["a network error", NETWORK, "Something went wrong. Please try again."],
    ["a 500", SERVER, "Something went wrong. Please try again."],
  ])("the Create user panel stays open with every value after %s", async (_label, failure, message) => {
    vi.spyOn(api, "createUser").mockRejectedValue(failure());
    const panel = await openCreateUser();
    await userEvent.click(within(panel).getByRole("button", { name: "Create user" }));
    expect(await within(panel).findByText(message)).toBeInTheDocument();
    expectUserInputKept(panel);
  });
});

describe("UI-22 not-found and failure use the shared feedback components (FR-16, ui-spec §8)", () => {
  const sharedError = () => document.querySelector(".zg-error-state");

  it.each([
    ["Requester Ticket Detail", "/tickets/999", REQUESTER, () => vi.spyOn(api, "fetchTicket"), "This ticket could not be found."],
    ["IT Staff Ticket Detail", "/staff/tickets/999", STAFF, () => vi.spyOn(api, "fetchStaffTicket"), "This ticket doesn't exist."],
  ])("%s says a missing ticket was not found, with a way back", async (_screen, path, user, spy, message) => {
    spy().mockRejectedValue(new ApiError(404, "NOT_FOUND", "The requested resource was not found."));
    renderAt(path, user);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(sharedError()).toHaveAttribute("role", "alert");
    const way = sharedError() as HTMLElement;
    expect([...within(way).queryAllByRole("button"), ...within(way).queryAllByRole("link")]).toHaveLength(1);
  });

  it.each([
    ["My Tickets", "/tickets", REQUESTER, () => vi.spyOn(api, "fetchTickets"), { data: [], pagination: EMPTY_PAGE }],
    ["Ticket Queue", "/staff/queue", STAFF, () => vi.spyOn(api, "fetchStaffQueue"), {
      data: [], pagination: EMPTY_PAGE,
      appliedQuery: { search: "", status: "ACTIVE", itPriority: null, categoryId: null, owner: "any", appearsResolved: false, sort: "itPriority", order: "desc", page: 1, pageSize: 10 },
    }],
    ["User Management", "/admin/users", ADMIN, () => vi.spyOn(api, "fetchAdminUsers"), []],
    ["Requester Ticket Detail", "/tickets/42", REQUESTER, () => vi.spyOn(api, "fetchTicket"), null],
    ["IT Staff Ticket Detail", "/staff/tickets/42", STAFF, () => vi.spyOn(api, "fetchStaffTicket"), null],
  ] as const)("%s shows a safe failure with Retry, which loads again", async (_screen, path, user, spy, recovered) => {
    const load = spy().mockRejectedValueOnce(SERVER());
    if (recovered) (load as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce(recovered);
    else (load as unknown as { mockImplementationOnce: (f: () => Promise<never>) => void }).mockImplementationOnce(pending);
    renderAt(path, user);
    await waitFor(() => expect(sharedError()).not.toBeNull());
    expect(sharedError()).toHaveTextContent(/Please try again\./);
    await userEvent.click(within(sharedError() as HTMLElement).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(sharedError()).toBeNull());
  });
});

describe("UI-23 no dead ends and no console errors on a normal visit (FR-19, D-20)", () => {
  it.each([
    ["Requester", REQUESTER],
    ["IT Staff", STAFF],
    ["Administrator", ADMIN],
  ] as const)("shows a not-found page inside the shell for an unknown address, as %s", async (_role, user) => {
    renderAt("/no-such-page", user);
    expect(await screen.findByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText("We can't find that page. The link may be out of date.").closest(".zg-empty-state")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Go to your Dashboard" })).toHaveAttribute("href", "/dashboard");
    // Inside the shell: the role's navigation is still there.
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("location")).toHaveTextContent("/no-such-page");
  });

  it("sends a signed-out visitor at an unknown address to Login", async () => {
    renderAt("/no-such-page", null);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login"));
  });

  // PR #80 review: Login returned a visitor to the unknown address they had typed.
  it("lands on the Dashboard after signing in from an unknown address", async () => {
    vi.spyOn(api, "login").mockResolvedValue(STAFF);
    vi.spyOn(api, "fetchStaffDashboard").mockImplementation(pending);
    renderAt("/no-such-page?x=1", null);
    await userEvent.type(await screen.findByLabelText(/^Email/), STAFF.email);
    await userEvent.type(screen.getByLabelText(/^Password/), "Correct-horse-42");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/dashboard"));
    expect(screen.queryByRole("heading", { name: "Page not found" })).not.toBeInTheDocument();
  });

  it("asks who is signed in through /api/auth/session, which answers a visitor without 401", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ user: null }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    expect(await api.fetchCurrentUser()).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("/api/auth/session");
    expect((init as RequestInit | undefined)?.credentials).toBe("include");

    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({ user: STAFF }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    expect(await api.fetchCurrentUser()).toEqual(STAFF);
  });

  it("declares a favicon that exists, so a page load asks for no missing file", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const href = html.match(/<link rel="icon" type="image\/svg\+xml" href="\/([^"]+)"/)?.[1];
    expect(href, "index.html links an SVG icon").toBeTruthy();
    const file = resolve(process.cwd(), "public", href!);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toMatch(/^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });
});
