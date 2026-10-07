import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as api from "../../src/api.js";
import type { StaffTicketDetail as Detail } from "../../src/api.js";
import { AppRoutes } from "../../src/AppRoutes.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// UI-21 to UI-23, UI-25 — IT Staff Ticket Detail (docs/lab-03/ui-spec.md §7).
// The real route table, shell, and screen; only the network is mocked.

const STAFF: api.AuthUser = { id: 8, name: "Pimchanok Srisuk", email: "pimchanok.srisuk@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false };
const ADMIN: api.AuthUser = { ...STAFF, id: 9, name: "Siriporn Boonmee", email: "siriporn.boonmee@kmutt.ac.th", role: "ADMINISTRATOR" };
const person = (id: number, name: string, role: api.Role = "IT_STAFF", isActive = true) => ({ id, name, role, isActive });
// Lab 4 BR-46 (setup only): the payload now always carries canWriteActions.
const ALL_CAPS = { canAssign: true, canChangePriority: true, canChangeStatus: true, canPostComment: true, canPostNote: true, canWriteActions: true };
const NO_CAPS = { canAssign: false, canChangePriority: false, canChangeStatus: false, canPostComment: false, canPostNote: false, canWriteActions: false };

function ticket(over: Partial<Detail> = {}): Detail {
  return {
    id: 42,
    ticketNumber: "TCK-000042",
    requester: { id: 3, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th", isActive: true },
    category: { id: 1, name: "Hardware" },
    relatedSystem: { id: 2, name: "Corporate Laptop" },
    summary: "Laptop battery drains quickly",
    description: "Battery drops from 100% to 20% within an hour.",
    requestedPriority: "MEDIUM",
    itPriority: "HIGH",
    currentStatus: "IN_PROGRESS",
    owner: person(10, "Chanon Rattanakorn"),
    resolutionSummary: null,
    requesterResolvedAt: null,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-02T09:00:00.000Z",
    attachments: [
      { id: 7, originalFilename: "battery_report.pdf", mimeType: "application/pdf", sizeBytes: 1000, uploadedAt: "2026-10-01T09:00:00.000Z", isRemoved: false, removedAt: null, removedReason: null },
      { id: 8, originalFilename: "old.png", mimeType: "image/png", sizeBytes: 500, uploadedAt: "2026-10-01T09:00:00.000Z", isRemoved: true, removedAt: "2026-10-01T10:00:00.000Z", removedReason: "Wrong screenshot" },
    ],
    permittedTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    capabilities: ALL_CAPS,
    // Lab 4 BR-46 (setup only): the payload now always reports the gate.
    resolvedAt: null,
    resolutionGate: { passes: true, completedCount: 1, plannedCount: 0, openFollowUpCount: 0 },
    ...over,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchComments").mockResolvedValue([]);
  vi.spyOn(api, "fetchInternalNotes").mockResolvedValue([]);
  // Lab 4, Issue 3 — the screen now also loads its Actions Taken (setup only, BR-46).
  vi.spyOn(api, "fetchActionsTaken").mockResolvedValue([]);
  vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue([person(8, "Pimchanok Srisuk"), person(10, "Chanon Rattanakorn"), person(9, "Siriporn Boonmee", "ADMINISTRATOR")]);
});

function renderDetail(t: Detail, user: api.AuthUser = STAFF) {
  vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(user);
  const load = vi.spyOn(api, "fetchStaffTicket").mockResolvedValue(t);
  render(
    <AuthProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[`/staff/tickets/${t.id}`]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
  return load;
}

const info = () => screen.getByRole("region", { name: "Ticket information" });
const controls = () => screen.getByRole("region", { name: "Ticket controls" });

describe("UI-21 the layout (FR-25, ui-spec §7.1, §7.2)", () => {
  it("shows the ticket read-only, attachments download-only, the conversation tabs, and both priorities", async () => {
    renderDetail(ticket());
    expect(await screen.findByRole("heading", { name: "TCK-000042" })).toBeInTheDocument();
    expect(api.fetchStaffTicket).toHaveBeenCalledWith(42);
    for (const value of ["Somchai Prasert", "somchai.prasert@kmutt.ac.th", "Hardware", "Corporate Laptop", "Laptop battery drains quickly"]) {
      expect(within(info()).getByDisplayValue(value)).toHaveClass("zg-field--readonly");
    }
    expect(within(info()).getByDisplayValue("Battery drops from 100% to 20% within an hour.")).toHaveAttribute("readonly");
    expect(within(info()).getByText("MEDIUM")).toHaveClass("zg-badge--priority-medium");
    expect(within(info()).getByText("Requested")).toBeInTheDocument();

    const attachments = screen.getByRole("region", { name: "Attachments" });
    expect(within(attachments).getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(within(attachments).getByText("Wrong screenshot", { exact: false })).toBeInTheDocument();
    expect(within(attachments).queryByRole("button", { name: /add attachment|remove/i })).toBeNull();

    expect(screen.getByRole("tab", { name: /public comments/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /internal notes/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Post public comment" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to queue/i })).toHaveAttribute("href", "/staff/queue");
  });

  it("shows the resolution when there is one, and 'This ticket doesn't exist.' for a 404", async () => {
    renderDetail(ticket({ currentStatus: "RESOLVED", resolutionSummary: "Replaced the battery.", permittedTransitions: ["CLOSED", "REOPENED"] }));
    const resolution = await screen.findByRole("region", { name: "Resolution" });
    expect(within(resolution).getByText("Replaced the battery.")).toBeInTheDocument();
  });

  it("says a missing ticket doesn't exist", async () => {
    vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(STAFF);
    vi.spyOn(api, "fetchStaffTicket").mockRejectedValue(new api.ApiError(404, "NOT_FOUND", "Ticket not found."));
    render(
      <AuthProvider>
        <MemoryRouter future={ROUTER_FUTURE} initialEntries={["/staff/tickets/999"]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText("This ticket doesn't exist.")).toBeInTheDocument();
  });
});

describe("UI-22 ownership and stale changes (BR-31, ui-spec §7.3, §7.5)", () => {
  it("Assign to me sends the owner and status on screen, and a 409 STALE_STATE shows the banner and reloads", async () => {
    const assign = vi.spyOn(api, "changeOwner").mockRejectedValueOnce(new api.ApiError(409, "STALE_STATE", "x"));
    const load = renderDetail(ticket());
    await userEvent.click(await within(await screen.findByRole("region", { name: "Ticket controls" })).findByRole("button", { name: "Assign to me" }));
    expect(assign).toHaveBeenCalledWith(42, { ownerId: 8, expectedOwnerId: 10, expectedStatus: "IN_PROGRESS" });
    expect(await screen.findByText("This ticket was changed by someone else. It has been reloaded.")).toBeInTheDocument();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it("assigns from the owner select and shows the new owner, with a confirmation", async () => {
    vi.spyOn(api, "changeOwner").mockResolvedValue(ticket({ owner: person(9, "Siriporn Boonmee", "ADMINISTRATOR") }));
    renderDetail(ticket());
    const panel = await screen.findByRole("region", { name: "Ticket controls" });
    await userEvent.selectOptions(await within(panel).findByLabelText("Owner"), "9");
    await userEvent.click(within(panel).getByRole("button", { name: "Save owner" }));
    expect(api.changeOwner).toHaveBeenCalledWith(42, { ownerId: 9, expectedOwnerId: 10, expectedStatus: "IN_PROGRESS" });
    expect(await screen.findByText("Owner updated")).toBeInTheDocument();
  });

  it("offers Unassigned only while NEW or OPEN, and no Assign to me for the current owner", async () => {
    renderDetail(ticket({ owner: person(8, "Pimchanok Srisuk") }));
    const panel = await screen.findByRole("region", { name: "Ticket controls" });
    const owner = await within(panel).findByLabelText("Owner");
    expect(within(owner).queryByRole("option", { name: "Unassigned" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Assign to me" })).toBeNull();
  });

  it("changes IT Priority with the expected status, showing the Requested value beneath", async () => {
    const change = vi.spyOn(api, "changeItPriority").mockResolvedValue(ticket({ itPriority: "LOW" }));
    renderDetail(ticket());
    const panel = await screen.findByRole("region", { name: "Ticket controls" });
    expect(within(panel).getByText("Requested: MEDIUM")).toBeInTheDocument();
    await userEvent.selectOptions(within(panel).getByLabelText("IT Priority"), "LOW");
    await userEvent.click(within(panel).getByRole("button", { name: "Save priority" }));
    expect(change).toHaveBeenCalledWith(42, { itPriority: "LOW", expectedStatus: "IN_PROGRESS" });
  });
});

describe("UI-23 the status control (BR-41, BR-42, BR-46)", () => {
  it("lists only the permitted transitions and sends a plain one directly", async () => {
    const change = vi.spyOn(api, "changeStatus").mockResolvedValue(ticket({ currentStatus: "WAITING_FOR_REQUESTER" }));
    renderDetail(ticket());
    const select = await within(await screen.findByRole("region", { name: "Ticket controls" })).findByLabelText("New status");
    expect(within(select).getAllByRole("option").map((o) => o.getAttribute("value")).filter(Boolean)).toEqual(["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);
    await userEvent.selectOptions(select, "WAITING_FOR_REQUESTER");
    await userEvent.click(within(controls()).getByRole("button", { name: "Update status" }));
    expect(change).toHaveBeenCalledWith(42, { status: "WAITING_FOR_REQUESTER", expectedStatus: "IN_PROGRESS", expectedOwnerId: 10 });
    expect(await screen.findByText("Status changed to Waiting for requester")).toBeInTheDocument();
  });

  it("asks for a 10–2000 character resolution summary before RESOLVED", async () => {
    const change = vi.spyOn(api, "changeStatus").mockResolvedValue(ticket({ currentStatus: "RESOLVED" }));
    renderDetail(ticket());
    await userEvent.selectOptions(await within(await screen.findByRole("region", { name: "Ticket controls" })).findByLabelText("New status"), "RESOLVED");
    await userEvent.click(within(controls()).getByRole("button", { name: "Update status" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: /confirm|resolve/i });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/resolution summary/i), "Too short");
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/resolution summary/i), " — replaced the battery.");
    await userEvent.click(confirm);
    expect(change).toHaveBeenCalledWith(42, { status: "RESOLVED", expectedStatus: "IN_PROGRESS", expectedOwnerId: 10, resolutionSummary: "Too short — replaced the battery." });
  });

  it("asks for a reason before CANCELLED, says it will be public, and styles it as destructive", async () => {
    const change = vi.spyOn(api, "changeStatus").mockResolvedValue(ticket({ currentStatus: "CANCELLED" }));
    renderDetail(ticket());
    await userEvent.selectOptions(await within(await screen.findByRole("region", { name: "Ticket controls" })).findByLabelText("New status"), "CANCELLED");
    await userEvent.click(within(controls()).getByRole("button", { name: "Update status" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("This reason will be posted as a public comment.")).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Cancel ticket" });
    expect(confirm).toHaveClass("zg-btn-destructive");
    await userEvent.type(within(dialog).getByLabelText(/reason/i), "Duplicate of TCK-000041.");
    await userEvent.click(confirm);
    expect(change).toHaveBeenCalledWith(42, { status: "CANCELLED", expectedStatus: "IN_PROGRESS", expectedOwnerId: 10, reason: "Duplicate of TCK-000041." });
  });

  it("offers only Cancel on a ticket with no owner, with the hint", async () => {
    renderDetail(ticket({ owner: null, currentStatus: "OPEN", permittedTransitions: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"] }));
    const panel = await screen.findByRole("region", { name: "Ticket controls" });
    const select = await within(panel).findByLabelText("New status");
    expect(within(select).getAllByRole("option").map((o) => o.getAttribute("value")).filter(Boolean)).toEqual(["CANCELLED"]);
    expect(within(panel).getByText("Assign an owner to move this ticket forward.")).toBeInTheDocument();
  });

  it("shows a closed ticket's values read-only, with 'This ticket is closed.'", async () => {
    renderDetail(ticket({ currentStatus: "CLOSED", permittedTransitions: [], capabilities: { ...NO_CAPS, canPostNote: true } }));
    const panel = await screen.findByRole("region", { name: "Ticket controls" });
    expect(within(panel).getByText("This ticket is closed.")).toBeInTheDocument();
    expect(within(panel).queryByRole("combobox")).toBeNull();
    expect(within(panel).queryByRole("button")).toBeNull();
  });
});

describe("UI-25 the Administrator's view (FR-30, BR-21)", () => {
  it("shows everything read-only: no controls, no composers, and the note", async () => {
    renderDetail(ticket({ permittedTransitions: [], capabilities: NO_CAPS }), ADMIN);
    const panel = await screen.findByRole("region", { name: "Ticket controls" });
    // Lab 4 BR-17 (BR-46): Administrators now manage Actions Taken, and the note says so;
    // every Lab 3 ticket control stays read-only, as asserted around it.
    expect(within(panel).getByText("Administrators can view this ticket and manage its actions, but not change its owner, priority, or status.")).toBeInTheDocument();
    expect(within(panel).getByText("Chanon Rattanakorn")).toBeInTheDocument();
    expect(within(panel).queryByRole("combobox")).toBeNull();
    expect(within(panel).queryByRole("button")).toBeNull();
    await screen.findByRole("tab", { name: /public comments/i });
    expect(screen.queryAllByRole("textbox").filter((t) => !t.hasAttribute("readonly"))).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /post public comment|add internal note/i })).toBeNull();
  });
});

// Issue 10 — RESP-06 at component level (ui-spec §10): a dialog gives focus back
// to the control that opened it.
describe("RESP-06 the status confirmation returns focus (ui-spec §10)", () => {
  it("puts focus back on Update status when the confirmation is kept as is, or closed with Escape", async () => {
    renderDetail(ticket());
    await userEvent.selectOptions(await within(await screen.findByRole("region", { name: "Ticket controls" })).findByLabelText("New status"), "RESOLVED");
    const update = within(controls()).getByRole("button", { name: "Update status" });
    await userEvent.click(update);
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep as is" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(update).toHaveFocus();

    await userEvent.click(update);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(update).toHaveFocus();
  });
});
