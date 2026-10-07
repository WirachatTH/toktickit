import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as api from "../../src/api.js";
import type { ActionTaken, StaffTicketDetail as Detail, TicketDetail } from "../../src/api.js";
import { ApiError } from "../../src/api.js";
import { AppRoutes } from "../../src/AppRoutes.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { ROUTER_FUTURE } from "../lab-03/routerFuture.js";

// UI-01 to UI-11 — the Actions Taken area on IT Staff Ticket Detail and the
// read-only "Work on your request" on Requester Ticket Detail
// (docs/lab-04/ui-spec.md §1.5, §4, §6; specification.md FR-01 to FR-06).
// The real route table, shell, and screens; only the network is mocked.

const STAFF: api.AuthUser = { id: 8, name: "Pimchanok Srisuk", email: "pimchanok.srisuk@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false };
const ADMIN: api.AuthUser = { ...STAFF, id: 9, name: "Siriporn Boonmee", email: "siriporn.boonmee@kmutt.ac.th", role: "ADMINISTRATOR" };
const REQUESTER: api.AuthUser = { ...STAFF, id: 3, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th", role: "REQUESTER" };
const person = (id: number, name: string, role: api.Role = "IT_STAFF", isActive = true) => ({ id, name, role, isActive });
const PIM = person(8, "Pimchanok Srisuk");
const CHANON = person(10, "Chanon Rattanakorn");
const SIRIPORN = person(9, "Siriporn Boonmee", "ADMINISTRATOR");
const CAPS = { canAssign: true, canChangePriority: true, canChangeStatus: true, canPostComment: true, canPostNote: true, canWriteActions: true };

function staffTicket(over: Partial<Detail> = {}): Detail {
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
    owner: CHANON,
    resolutionSummary: null,
    requesterResolvedAt: null,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-02T09:00:00.000Z",
    attachments: [],
    permittedTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    capabilities: CAPS,
    resolvedAt: null,
    resolutionGate: { passes: true, completedCount: 1, plannedCount: 0, openFollowUpCount: 0 },
    ...over,
  };
}

function action(over: Partial<ActionTaken> = {}): ActionTaken {
  return {
    id: 118,
    ticketId: 42,
    actionAt: "2026-10-03T03:30:00.000Z",
    description: "Replace the laptop battery.",
    result: null,
    status: "PLANNED",
    assignee: PIM,
    createdBy: CHANON,
    performedBy: null,
    followUpRequired: false,
    followUpNote: null,
    followUpHandled: null,
    followUpOfId: null,
    attachmentNotes: null,
    cancelReason: null,
    cancelledBy: null,
    completedAt: null,
    cancelledAt: null,
    version: 1,
    createdAt: "2026-10-02T03:00:00.000Z",
    updatedAt: "2026-10-02T03:00:00.000Z",
    ...over,
  };
}

const COMPLETED = action({
  id: 101,
  actionAt: "2026-10-01T10:00:00.000Z",
  description: "Recalibrated the battery.",
  status: "COMPLETED",
  result: "Battery lasted three hours.",
  performedBy: CHANON,
  completedAt: "2026-10-01T11:00:00.000Z",
  followUpRequired: true,
  followUpNote: "Check again in a week.",
  followUpHandled: false,
  attachmentNotes: "battery-report.pdf on this ticket",
});
const CANCELLED = action({
  id: 102,
  actionAt: "2026-10-02T10:00:00.000Z",
  description: "Replace the charger.",
  status: "CANCELLED",
  cancelReason: "The charger tested fine.",
  cancelledBy: CHANON,
  cancelledAt: "2026-10-02T11:00:00.000Z",
  version: 2,
});
const PLANNED = action();

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchComments").mockResolvedValue([]);
  vi.spyOn(api, "fetchInternalNotes").mockResolvedValue([]);
  vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue([PIM, CHANON, SIRIPORN]);
});

function renderStaff(t: Detail, actions: ActionTaken[], user: api.AuthUser = STAFF) {
  vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(user);
  const loadTicket = vi.spyOn(api, "fetchStaffTicket").mockResolvedValue(t);
  const loadActions = vi.spyOn(api, "fetchActionsTaken").mockResolvedValue(actions);
  render(
    <AuthProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[`/staff/tickets/${t.id}`]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
  return { loadTicket, loadActions };
}

const area = () => screen.getByRole("region", { name: /Actions taken/ });
const cards = () => within(area()).getAllByRole("article");
const card = (text: string) => cards().find((c) => within(c).queryByText(text))!;

describe("UI-01 list mode (FR-01, ui-spec §1.5, §4.2)", () => {
  it("shows the actions in the API's order with every field labelled, and says when there are none", async () => {
    const { loadActions } = renderStaff(staffTicket(), [COMPLETED, CANCELLED, PLANNED]);
    expect(await screen.findByRole("heading", { name: "Actions taken (3)" })).toBeInTheDocument();
    expect(loadActions).toHaveBeenCalledWith(42);
    expect(within(area()).getByText("Visible to the Requester")).toBeInTheDocument();
    expect(within(area()).getByRole("list").tagName).toBe("OL");
    expect(cards().map((c) => c.id)).toEqual(["action-101", "action-102", "action-118"]);

    const done = card("Recalibrated the battery.");
    for (const label of ["Result", "Attachment notes", "Performed by", "Created by"]) expect(within(done).getByText(label)).toBeInTheDocument();
    expect(within(done).getByText("Battery lasted three hours.")).toBeInTheDocument();
    expect(within(done).getByText("battery-report.pdf on this ticket")).toBeInTheDocument();
    expect(within(done).getByText("Follow-up needed")).toBeInTheDocument();
    expect(within(done).getByText("Check again in a week.")).toBeInTheDocument();
    // An empty value is a dash, never a blank — for each field, not just somewhere on the card.
    const planned = card("Replace the laptop battery.");
    const valueOf = (label: string) => within(planned).getByText(label).nextElementSibling?.textContent;
    expect(valueOf("Result")).toBe("—");
    expect(valueOf("Attachment notes")).toBe("—");
  });

  it("shows the empty state", async () => {
    renderStaff(staffTicket(), []);
    expect(await screen.findByRole("heading", { name: "Actions taken (0)" })).toBeInTheDocument();
    expect(within(area()).getByText("No actions yet. Add the first action to plan or record work on this ticket.")).toBeInTheDocument();
  });

  it("shows a failure with Retry", async () => {
    vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(STAFF);
    vi.spyOn(api, "fetchStaffTicket").mockResolvedValue(staffTicket());
    const load = vi.spyOn(api, "fetchActionsTaken").mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce([PLANNED]);
    render(
      <AuthProvider>
        <MemoryRouter future={ROUTER_FUTURE} initialEntries={["/staff/tickets/42"]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText("We couldn't load the actions.")).toBeInTheDocument();
    await userEvent.click(within(area()).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Actions taken (1)" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("UI-02 create mode (FR-02, BR-04, BR-11, ui-spec §4.3)", () => {
  it("shows the follow-up note only while follow-up is ticked, requires a result for recorded work, and sends the form", async () => {
    renderStaff(staffTicket(), []);
    await userEvent.click(await screen.findByRole("button", { name: "Add action" }));
    const panel = await screen.findByRole("dialog", { name: "Add action" });

    expect(within(panel).queryByLabelText(/Follow-up note/)).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Follow-up required?" }));
    expect(within(panel).getByLabelText(/Follow-up note/)).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Follow-up required?" }));
    expect(within(panel).queryByLabelText(/Follow-up note/)).not.toBeInTheDocument();

    // Nothing typed: the errors sit under their fields and nothing is sent.
    const create = vi.spyOn(api, "createActionTaken").mockResolvedValue(PLANNED);
    await userEvent.click(within(panel).getByRole("radio", { name: "Record work already done" }));
    const resultLabel = within(panel).getByText((_, el) => el?.tagName === "LABEL" && /^Result/.test(el.textContent ?? ""));
    expect(resultLabel.querySelector(".zg-required")).not.toBeNull();
    await userEvent.click(within(panel).getByRole("button", { name: "Save action" }));
    expect(within(panel).getByText("Enter a description.")).toBeInTheDocument();
    expect(within(panel).getByText("Enter the result.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    await userEvent.click(within(panel).getByRole("radio", { name: "Plan this work" }));
    await userEvent.type(within(panel).getByLabelText(/Action description/), "Replace the laptop battery.");
    // Follow-up ticked without a note: refused under the note, nothing sent (BR-04).
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Follow-up required?" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Save action" }));
    expect(within(panel).getByText("Enter a follow-up note.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Follow-up required?" }));
    await userEvent.type(within(panel).getByLabelText(/Attachment notes/), "photo-1.jpg");
    await userEvent.click(within(panel).getByRole("button", { name: "Save action" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const [ticketId, body] = create.mock.calls[0];
    expect(ticketId).toBe(42);
    expect(body).toMatchObject({ status: "PLANNED", description: "Replace the laptop battery.", assigneeId: 8, followUpRequired: false, attachmentNotes: "photo-1.jpg" });
    expect(body.actionAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$/);
    expect(body.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText("Action added")).toBeInTheDocument();
  });

  it("moves focus to the new card once it is listed (ui-spec §4.6; PR #76 review)", async () => {
    const { loadActions } = renderStaff(staffTicket(), []);
    await userEvent.click(await screen.findByRole("button", { name: "Add action" }));
    const panel = await screen.findByRole("dialog", { name: "Add action" });
    await userEvent.type(within(panel).getByLabelText(/Action description/), "Replace the laptop battery.");
    vi.spyOn(api, "createActionTaken").mockResolvedValue(PLANNED);
    // The reload takes a moment, as it does over a network: the card appears
    // only after the save has finished.
    loadActions.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([PLANNED]), 50)));
    await userEvent.click(within(panel).getByRole("button", { name: "Save action" }));
    await waitFor(() => expect(document.activeElement?.id).toBe("action-118"));
  });

  it("offers a follow-up link only to completed actions still needing one", async () => {
    renderStaff(staffTicket(), [COMPLETED, PLANNED]);
    await userEvent.click(await screen.findByRole("button", { name: "Add action" }));
    const panel = await screen.findByRole("dialog", { name: "Add action" });
    const options = within(within(panel).getByLabelText("Follow-up of")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["None", expect.stringContaining("Recalibrated the battery.")]);
  });
});

describe("UI-03 the assignee choice (BR-08)", () => {
  it("offers only the active IT Staff and Administrators from the server, starting with the caller", async () => {
    renderStaff(staffTicket(), []);
    await userEvent.click(await screen.findByRole("button", { name: "Add action" }));
    const select = within(await screen.findByRole("dialog", { name: "Add action" })).getByLabelText(/Assigned to/) as HTMLSelectElement;
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Pimchanok Srisuk", "Chanon Rattanakorn", "Siriporn Boonmee"]);
    expect(select.value).toBe("8");
  });
});

describe("UI-04 controls per action status (BR-13)", () => {
  it("offers Edit, Complete, and Cancel only on planned actions, and shows the outcome of the others", async () => {
    renderStaff(staffTicket(), [COMPLETED, CANCELLED, PLANNED]);
    await screen.findByRole("heading", { name: "Actions taken (3)" });
    const planned = card("Replace the laptop battery.");
    for (const name of ["Edit", "Complete", "Cancel action"]) expect(within(planned).getByRole("button", { name })).toBeInTheDocument();
    expect(within(planned).getByText("Planned")).toHaveClass("zg-badge--action-planned");

    const done = card("Recalibrated the battery.");
    expect(within(done).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(done).getByText("Completed")).toHaveClass("zg-badge--action-completed");
    expect(within(done).getByText(/Completed by Chanon Rattanakorn/)).toBeInTheDocument();

    const gone = card("Replace the charger.");
    expect(within(gone).queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
    expect(within(gone).getByText("Cancelled")).toHaveClass("zg-badge--action-cancelled");
    expect(within(gone).getByText("The charger tested fine.")).toBeInTheDocument();
    expect(within(gone).getByText(/Cancelled by Chanon Rattanakorn/)).toBeInTheDocument();
    // History is available on every card.
    for (const c of cards()) expect(within(c).getByRole("button", { name: "History" })).toBeInTheDocument();
  });
});

describe("UI-05 complete and cancel dialogs (FR-04, ui-spec §4.5)", () => {
  it("requires a result, returns focus on Escape, and refreshes the ticket after completing", async () => {
    const { loadTicket } = renderStaff(staffTicket(), [PLANNED]);
    await screen.findByRole("heading", { name: "Actions taken (1)" });
    const complete = within(card("Replace the laptop battery.")).getByRole("button", { name: "Complete" });
    await userEvent.click(complete);
    let dialog = await screen.findByRole("dialog", { name: "Complete this action?" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(complete).toHaveFocus();

    await userEvent.click(complete);
    dialog = await screen.findByRole("dialog", { name: "Complete this action?" });
    const send = vi.spyOn(api, "changeActionStatus").mockResolvedValue({ ...PLANNED, status: "COMPLETED", result: "Battery replaced.", performedBy: PIM, version: 2 });
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark as completed" }));
    expect(within(dialog).getByText("Enter the result.")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText(/Result/), "Battery replaced.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark as completed" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(42, 118, expect.objectContaining({ status: "COMPLETED", expectedVersion: 1, result: "Battery replaced." })));
    expect(await screen.findByText("Action completed")).toBeInTheDocument();
    // FR-09 — the ticket and its controls reload with the change.
    await waitFor(() => expect(loadTicket).toHaveBeenCalledTimes(2));
  });

  it("starts a future-dated planned action's completion date at now, and keeps a past date as planned", async () => {
    const future = action({ id: 119, description: "Due next week.", actionAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() });
    renderStaff(staffTicket(), [PLANNED, future]);
    await screen.findByRole("heading", { name: "Actions taken (2)" });
    const dateIn = async (description: string) => {
      await userEvent.click(within(card(description)).getByRole("button", { name: "Complete" }));
      const dialog = await screen.findByRole("dialog", { name: "Complete this action?" });
      const value = (within(dialog).getByLabelText(/Action date & time/) as HTMLInputElement).value;
      await userEvent.click(within(dialog).getByRole("button", { name: "Back" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      return Date.parse(`${value}:00+07:00`);
    };
    const now = Date.now();
    const fromFuture = await dateIn("Due next week.");
    expect(fromFuture).toBeLessThanOrEqual(now + 60_000);
    expect(fromFuture).toBeGreaterThan(now - 120_000);
    expect(await dateIn("Replace the laptop battery.")).toBe(Date.parse("2026-10-03T03:30:00.000Z"));

    // Completing it sends that date, since the stored one is in the future (BR-07).
    await userEvent.click(within(card("Due next week.")).getByRole("button", { name: "Complete" }));
    const dialog = await screen.findByRole("dialog", { name: "Complete this action?" });
    const send = vi.spyOn(api, "changeActionStatus").mockResolvedValue({ ...future, status: "COMPLETED", result: "Done early.", performedBy: PIM, version: 2 });
    await userEvent.type(within(dialog).getByLabelText(/Result/), "Done early.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark as completed" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const sent = Date.parse(String((send.mock.calls[0][2] as { actionAt?: string }).actionAt));
    expect(sent).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(sent).toBeGreaterThan(Date.now() - 180_000);
  });

  it("asks for a reason of at least 10 characters before cancelling", async () => {
    renderStaff(staffTicket(), [PLANNED]);
    await screen.findByRole("heading", { name: "Actions taken (1)" });
    await userEvent.click(within(card("Replace the laptop battery.")).getByRole("button", { name: "Cancel action" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel this action?" });
    const send = vi.spyOn(api, "changeActionStatus").mockResolvedValue({ ...CANCELLED, id: 118 });
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Too short");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel action" }));
    expect(within(dialog).getByText("Give a reason of 10 to 1000 characters.")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), " after all");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel action" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(42, 118, { status: "CANCELLED", expectedVersion: 1, reason: "Too short after all" }));
    expect(await screen.findByText("Action cancelled")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("UI-06 history (FR-05, ui-spec §4.2)", () => {
  it("expands the change list, oldest first, with assignee ids shown as names", async () => {
    renderStaff(staffTicket(), [PLANNED]);
    await screen.findByRole("heading", { name: "Actions taken (1)" });
    const history = vi.spyOn(api, "fetchActionHistory").mockResolvedValue([
      { id: 1, type: "CREATED", actor: CHANON, createdAt: "2026-10-02T03:00:00.000Z", changes: { description: { from: null, to: "Replace the laptop battery." } } },
      { id: 2, type: "UPDATED", actor: PIM, createdAt: "2026-10-02T04:00:00.000Z", changes: { assigneeId: { from: 10, to: 8 } } },
    ]);
    const toggle = within(card("Replace the laptop battery.")).getByRole("button", { name: "History" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(history).toHaveBeenCalledWith(42, 118);
    const items = await within(card("Replace the laptop battery.")).findAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Chanon Rattanakorn"),
      expect.stringMatching(/Pimchanok Srisuk.*Chanon Rattanakorn → Pimchanok Srisuk/),
    ]);
    expect(items[0].textContent).toContain("Created");
  });
});

describe("UI-07 a stale edit (BR-25, BR-44, ui-spec §4.6)", () => {
  it("reloads the action, says so, and keeps the unsaved text", async () => {
    const { loadActions } = renderStaff(staffTicket(), [PLANNED]);
    await screen.findByRole("heading", { name: "Actions taken (1)" });
    await userEvent.click(within(card("Replace the laptop battery.")).getByRole("button", { name: "Edit" }));
    const panel = await screen.findByRole("dialog", { name: "Edit action" });
    const description = within(panel).getByLabelText(/Action description/);
    await userEvent.clear(description);
    await userEvent.type(description, "My version of the plan");

    loadActions.mockResolvedValue([{ ...PLANNED, description: "Their version", version: 2 }]);
    vi.spyOn(api, "updateActionTaken").mockRejectedValue(new ApiError(409, "STALE_STATE", "Changed by someone else."));
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));

    expect(await within(panel).findByText("This action was changed by someone else. It has been reloaded.")).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Action description/)).toHaveValue("Their version");
    expect(within(panel).getByText("Your unsaved text")).toBeInTheDocument();
    expect(within(panel).getByText("My version of the plan")).toBeInTheDocument();
    expect(loadActions).toHaveBeenCalledTimes(2);
  });

  it("closes and reloads when the action was completed or cancelled meanwhile", async () => {
    const { loadActions } = renderStaff(staffTicket(), [PLANNED]);
    await screen.findByRole("heading", { name: "Actions taken (1)" });
    await userEvent.click(within(card("Replace the laptop battery.")).getByRole("button", { name: "Edit" }));
    const panel = await screen.findByRole("dialog", { name: "Edit action" });
    await userEvent.type(within(panel).getByLabelText(/Action description/), " now");
    vi.spyOn(api, "updateActionTaken").mockRejectedValue(new ApiError(409, "ACTION_NOT_PLANNED", "Already final."));
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("This action was already completed or cancelled.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(loadActions).toHaveBeenCalledTimes(2);
  });
});

describe("UI-07 nothing changed, nothing sent (BR-23, ui-spec §4.4; PR #76 review)", () => {
  // Seeded and API-made actions carry seconds; the date field shows minutes only.
  const SECONDS = action({ actionAt: "2026-10-03T03:30:19.700Z" });

  it("an unchanged edit sends no date and says there was nothing to save", async () => {
    renderStaff(staffTicket(), [SECONDS]);
    await screen.findByRole("heading", { name: "Actions taken (1)" });
    await userEvent.click(within(card("Replace the laptop battery.")).getByRole("button", { name: "Edit" }));
    const panel = await screen.findByRole("dialog", { name: "Edit action" });
    const update = vi.spyOn(api, "updateActionTaken").mockResolvedValue(SECONDS);
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][2]).not.toHaveProperty("actionAt");
    expect(await screen.findByText("No changes to save.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("an edited date is sent, as Bangkok time", async () => {
    renderStaff(staffTicket(), [SECONDS]);
    await screen.findByRole("heading", { name: "Actions taken (1)" });
    await userEvent.click(within(card("Replace the laptop battery.")).getByRole("button", { name: "Edit" }));
    const panel = await screen.findByRole("dialog", { name: "Edit action" });
    const update = vi.spyOn(api, "updateActionTaken").mockResolvedValue({ ...SECONDS, version: 2 });
    const date = within(panel).getByLabelText(/Action date & time/);
    fireEvent.change(date, { target: { value: "2026-10-04T09:15" } });
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][2]).toMatchObject({ actionAt: "2026-10-04T09:15:00+07:00" });
  });

  it("completing a past-dated action keeps its stored time unless the date is changed", async () => {
    renderStaff(staffTicket(), [SECONDS]);
    await screen.findByRole("heading", { name: "Actions taken (1)" });
    await userEvent.click(within(card("Replace the laptop battery.")).getByRole("button", { name: "Complete" }));
    const dialog = await screen.findByRole("dialog", { name: "Complete this action?" });
    const send = vi.spyOn(api, "changeActionStatus").mockResolvedValue({ ...SECONDS, status: "COMPLETED", result: "Done.", performedBy: PIM, version: 2 });
    await userEvent.type(within(dialog).getByLabelText(/Result/), "Done.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark as completed" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][2]).not.toHaveProperty("actionAt");
  });
});

describe("UI-07 a stale conflict in a dialog keeps what was typed (BR-44; PR #76 review)", () => {
  it("reloads the action under the Cancel dialog, keeps the reason, and retries with the new version", async () => {
    const { loadActions } = renderStaff(staffTicket(), [PLANNED]);
    await screen.findByRole("heading", { name: "Actions taken (1)" });
    await userEvent.click(within(card("Replace the laptop battery.")).getByRole("button", { name: "Cancel action" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel this action?" });
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "The Requester bought a new laptop.");
    loadActions.mockResolvedValue([{ ...PLANNED, description: "Edited meanwhile", version: 2 }]);
    const send = vi
      .spyOn(api, "changeActionStatus")
      .mockRejectedValueOnce(new ApiError(409, "STALE_STATE", "Changed by someone else."))
      .mockResolvedValueOnce({ ...CANCELLED, id: 118, version: 3 });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel action" }));
    const again = await screen.findByRole("dialog", { name: "Cancel this action?" });
    expect(await within(again).findByText("This action was changed by someone else. It has been reloaded.")).toBeInTheDocument();
    expect(within(again).getByLabelText(/Reason/)).toHaveValue("The Requester bought a new laptop.");
    await userEvent.click(within(again).getByRole("button", { name: "Cancel action" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][2]).toMatchObject({ expectedVersion: 2, reason: "The Requester bought a new laptop." });
  });
});

describe("UI-07 a stale Complete dialog refreshes what the user left alone (PR #76 follow-up)", () => {
  it("takes the colleague's follow-up and keeps the result the user typed, then retries with the new version", async () => {
    const { loadActions } = renderStaff(staffTicket(), [PLANNED]);
    await screen.findByRole("heading", { name: "Actions taken (1)" });
    await userEvent.click(within(card("Replace the laptop battery.")).getByRole("button", { name: "Complete" }));
    const dialog = await screen.findByRole("dialog", { name: "Complete this action?" });
    await userEvent.type(within(dialog).getByLabelText(/Result/), "My result");

    // Meanwhile a colleague ticked Follow-up required and wrote a result.
    loadActions.mockResolvedValue([{ ...PLANNED, followUpRequired: true, followUpNote: "Their note", result: "Their result", actionAt: "2026-10-02T01:00:00.000Z", version: 2 }]);
    const send = vi
      .spyOn(api, "changeActionStatus")
      .mockRejectedValueOnce(new ApiError(409, "STALE_STATE", "Changed by someone else."))
      .mockResolvedValueOnce({ ...PLANNED, status: "COMPLETED", result: "My result", performedBy: PIM, version: 3 });
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark as completed" }));

    const again = await screen.findByRole("dialog", { name: "Complete this action?" });
    expect(await within(again).findByText("This action was changed by someone else. It has been reloaded.")).toBeInTheDocument();
    // Untouched fields now show the colleague's values; the typed one is kept.
    await waitFor(() => expect(within(again).getByRole("checkbox", { name: "Follow-up required?" })).toBeChecked());
    expect(within(again).getByLabelText(/Follow-up note/)).toHaveValue("Their note");
    expect(within(again).getByLabelText(/Result/)).toHaveValue("My result");
    // The colleague also moved the date: the field shows it (08:00 in Bangkok).
    expect(within(again).getByLabelText(/Action date & time/)).toHaveValue("2026-10-02T08:00");

    await userEvent.click(within(again).getByRole("button", { name: "Mark as completed" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][2]).toMatchObject({ expectedVersion: 2, result: "My result", followUpRequired: true, followUpNote: "Their note" });
    // Untouched and in the past, the date is the stored one: nothing to send.
    expect(send.mock.calls[1][2]).not.toHaveProperty("actionAt");
  });

  it("sends a completion date the user changed (PR #76 follow-up)", async () => {
    renderStaff(staffTicket(), [PLANNED]);
    await screen.findByRole("heading", { name: "Actions taken (1)" });
    await userEvent.click(within(card("Replace the laptop battery.")).getByRole("button", { name: "Complete" }));
    const dialog = await screen.findByRole("dialog", { name: "Complete this action?" });
    const send = vi.spyOn(api, "changeActionStatus").mockResolvedValue({ ...PLANNED, status: "COMPLETED", result: "Done.", performedBy: PIM, version: 2 });
    await userEvent.type(within(dialog).getByLabelText(/Result/), "Done.");
    fireEvent.change(within(dialog).getByLabelText(/Action date & time/), { target: { value: "2026-10-04T08:00" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark as completed" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][2]).toMatchObject({ actionAt: "2026-10-04T08:00:00+07:00" });
  });
});

describe("UI-08 repeated clicks and failures (BR-43, BR-44)", () => {
  it("sends one request per click burst, keeps the input after a failure, and retries with the same clientRequestId", async () => {
    renderStaff(staffTicket(), []);
    await userEvent.click(await screen.findByRole("button", { name: "Add action" }));
    const panel = await screen.findByRole("dialog", { name: "Add action" });
    await userEvent.type(within(panel).getByLabelText(/Action description/), "Replace the laptop battery.");

    let fail!: (e: unknown) => void;
    const create = vi.spyOn(api, "createActionTaken").mockImplementationOnce(() => new Promise((_resolve, reject) => (fail = reject)));
    const save = within(panel).getByRole("button", { name: "Save action" });
    await userEvent.click(save);
    // The button shows it is working and takes no more clicks (ui-spec §4.3).
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent("Saving…");
    await userEvent.click(save);
    await userEvent.click(save);
    expect(create).toHaveBeenCalledTimes(1);
    fail(new TypeError("Failed to fetch"));

    expect(await within(panel).findByText("We couldn't save the action. Your input is still here.")).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Action description/)).toHaveValue("Replace the laptop battery.");

    create.mockResolvedValueOnce(PLANNED);
    await userEvent.click(within(panel).getByRole("button", { name: "Save action" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1][1].clientRequestId).toBe(create.mock.calls[0][1].clientRequestId);
  });

  it("puts a server validation message under its field and keeps the panel open", async () => {
    renderStaff(staffTicket(), []);
    await userEvent.click(await screen.findByRole("button", { name: "Add action" }));
    const panel = await screen.findByRole("dialog", { name: "Add action" });
    await userEvent.type(within(panel).getByLabelText(/Action description/), "Replace the laptop battery.");
    vi.spyOn(api, "createActionTaken").mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Some fields need attention.", { assigneeId: "Choose an active IT Staff member or Administrator." }));
    await userEvent.click(within(panel).getByRole("button", { name: "Save action" }));
    expect(await within(panel).findByText("Choose an active IT Staff member or Administrator.")).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Action description/)).toHaveValue("Replace the laptop battery.");
  });
});

describe("UI-09 the Requester's read-only view (FR-06, BR-19, ui-spec §6)", () => {
  it("shows every field of every action with no controls and no history", async () => {
    const ticket: TicketDetail = {
      id: 42, ticketNumber: "TCK-000042", requester: { id: 3, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th" },
      category: { id: 1, name: "Hardware" }, relatedSystem: { id: 2, name: "Corporate Laptop" }, summary: "Laptop battery drains quickly",
      description: "Battery drops quickly.", requestedPriority: "MEDIUM", currentStatus: "IN_PROGRESS", owner: CHANON, resolutionSummary: null,
      requesterResolvedAt: null, canComment: true, canMarkAppearsResolved: true, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-02T09:00:00.000Z", attachments: [],
    };
    vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(REQUESTER);
    vi.spyOn(api, "fetchTicket").mockResolvedValue(ticket);
    const load = vi.spyOn(api, "fetchActionsTaken").mockResolvedValue([COMPLETED, PLANNED]);
    render(
      <AuthProvider>
        <MemoryRouter future={ROUTER_FUTURE} initialEntries={["/tickets/42"]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    const section = await screen.findByRole("region", { name: "Work on your request (2)" });
    expect(load).toHaveBeenCalledWith(42);
    for (const text of ["Recalibrated the battery.", "Battery lasted three hours.", "Check again in a week.", "battery-report.pdf on this ticket", "Replace the laptop battery."]) {
      expect(within(section).getByText(text)).toBeInTheDocument();
    }
    expect(within(section).getAllByText(/Pimchanok Srisuk/).length).toBeGreaterThan(0);
    expect(within(section).queryAllByRole("button")).toEqual([]);
    expect(screen.queryByRole("button", { name: "Add action" })).not.toBeInTheDocument();
  });
});

describe("UI-10 the Administrator (BR-17, ui-spec §4.7)", () => {
  it("manages actions while the Lab 3 ticket controls stay read-only", async () => {
    renderStaff(staffTicket({ permittedTransitions: [], capabilities: { ...CAPS, canAssign: false, canChangePriority: false, canChangeStatus: false, canPostComment: false, canPostNote: false } }), [PLANNED], ADMIN);
    expect(await screen.findByRole("button", { name: "Add action" })).toBeInTheDocument();
    expect(within(card("Replace the laptop battery.")).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    const controls = screen.getByRole("region", { name: "Ticket controls" });
    expect(within(controls).getByText("Administrators can view this ticket and manage its actions, but not change its owner, priority, or status.")).toBeInTheDocument();
    expect(within(controls).queryByRole("combobox")).not.toBeInTheDocument();
    // They choose an assignee from the same eligible list (BR-08).
    await userEvent.click(screen.getByRole("button", { name: "Add action" }));
    const select = within(await screen.findByRole("dialog", { name: "Add action" })).getByLabelText(/Assigned to/);
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Pimchanok Srisuk", "Chanon Rattanakorn", "Siriporn Boonmee"]);
    expect(select).toHaveValue("9");
  });
});

describe("UI-11 a ticket no longer being worked (BR-20, ui-spec §4.1)", () => {
  it("replaces Add action with the reason, and offers no changes on a resolved or closed ticket", async () => {
    renderStaff(staffTicket({ currentStatus: "RESOLVED", capabilities: { ...CAPS, canWriteActions: false } }), [PLANNED]);
    expect(await within(await screen.findByRole("region", { name: /Actions taken/ })).findByText("Reopen the ticket to add or change actions.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add action" })).not.toBeInTheDocument();
    expect(within(card("Replace the laptop battery.")).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("says the ticket is closed", async () => {
    renderStaff(staffTicket({ currentStatus: "CLOSED", permittedTransitions: [], capabilities: { ...CAPS, canWriteActions: false } }), [COMPLETED]);
    const section = await screen.findByRole("region", { name: /Actions taken/ });
    expect(await within(section).findByText("This ticket is closed.")).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Add action" })).not.toBeInTheDocument();
  });
});
