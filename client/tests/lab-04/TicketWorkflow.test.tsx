import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as api from "../../src/api.js";
import type { ActionTaken, StaffTicketDetail as Detail } from "../../src/api.js";
import { ApiError } from "../../src/api.js";
import { AppRoutes } from "../../src/AppRoutes.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { ROUTER_FUTURE } from "../lab-03/routerFuture.js";

// UI-12 to UI-14 — the status control and the gate notice on IT Staff Ticket
// Detail (docs/lab-04/ui-spec.md §1.6, §5; specification.md FR-08, FR-09, BR-30).

const STAFF: api.AuthUser = { id: 8, name: "Pimchanok Srisuk", email: "pimchanok.srisuk@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false };
const PIM = { id: 8, name: "Pimchanok Srisuk", role: "IT_STAFF" as const, isActive: true };
const CAPS = { canAssign: true, canChangePriority: true, canChangeStatus: true, canPostComment: true, canPostNote: true, canWriteActions: true };
const PASSING = { passes: true, completedCount: 1, plannedCount: 0, openFollowUpCount: 0 };

function ticket(over: Partial<Detail> = {}): Detail {
  return {
    id: 42, ticketNumber: "TCK-000042",
    requester: { id: 3, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th", isActive: true },
    category: { id: 1, name: "Hardware" }, relatedSystem: { id: 2, name: "Corporate Laptop" },
    summary: "Laptop battery drains quickly", description: "Battery drops quickly.",
    requestedPriority: "MEDIUM", itPriority: "HIGH", currentStatus: "IN_PROGRESS", owner: PIM,
    resolutionSummary: null, requesterResolvedAt: null, resolvedAt: null,
    createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-02T09:00:00.000Z", attachments: [],
    permittedTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"], capabilities: CAPS, resolutionGate: PASSING,
    ...over,
  };
}
const BLOCKED = ticket({ permittedTransitions: ["WAITING_FOR_REQUESTER", "CANCELLED"], resolutionGate: { passes: false, completedCount: 0, plannedCount: 2, openFollowUpCount: 0 } });

const PLANNED: ActionTaken = {
  id: 118, ticketId: 42, actionAt: "2026-10-03T03:30:00.000Z", description: "Replace the laptop battery.", result: null, status: "PLANNED",
  assignee: PIM, createdBy: PIM, performedBy: null, followUpRequired: false, followUpNote: null, followUpHandled: null, followUpOfId: null,
  attachmentNotes: null, cancelReason: null, cancelledBy: null, completedAt: null, cancelledAt: null, version: 1,
  createdAt: "2026-10-02T03:00:00.000Z", updatedAt: "2026-10-02T03:00:00.000Z",
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchComments").mockResolvedValue([]);
  vi.spyOn(api, "fetchInternalNotes").mockResolvedValue([]);
  vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue([PIM]);
  vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(STAFF);
});

function renderDetail(...loads: Detail[]) {
  const load = vi.spyOn(api, "fetchStaffTicket");
  for (const t of loads.slice(0, -1)) load.mockResolvedValueOnce(t);
  load.mockResolvedValue(loads[loads.length - 1]);
  const actions = vi.spyOn(api, "fetchActionsTaken").mockResolvedValue([PLANNED]);
  render(
    <AuthProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={["/staff/tickets/42"]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
  return { load, actions };
}

const controls = () => screen.getByRole("region", { name: "Ticket controls" });
const statusOptions = () => within(within(controls()).getByLabelText("New status")).getAllByRole("option").map((o) => o.textContent);

describe("UI-12 only permitted transitions, and why Resolved is missing (FR-08, BR-30, ui-spec §1.6)", () => {
  it("leaves Resolved out while the gate fails and lists only the unmet conditions, with counts", async () => {
    renderDetail(BLOCKED);
    await screen.findByRole("heading", { name: "TCK-000042" });
    expect(statusOptions()).toEqual(["Choose…", "Waiting for requester", "Cancelled"]);
    const notice = within(controls()).getByRole("status", { name: "Why Resolved is unavailable" });
    expect(notice).toHaveAttribute("aria-live", "polite");
    expect(within(notice).getByText("Resolved is available once:")).toBeInTheDocument();
    expect(within(notice).getAllByRole("listitem").map((i) => i.textContent)).toEqual([
      "at least one action is completed (0 completed)",
      "no action is still planned (2 planned)",
    ]);
  });

  it("names an open follow-up when that is all that remains", async () => {
    renderDetail(ticket({ permittedTransitions: ["WAITING_FOR_REQUESTER", "CANCELLED"], resolutionGate: { passes: false, completedCount: 2, plannedCount: 0, openFollowUpCount: 1 } }));
    await screen.findByRole("heading", { name: "TCK-000042" });
    const notice = within(controls()).getByRole("status", { name: "Why Resolved is unavailable" });
    expect(within(notice).getAllByRole("listitem").map((i) => i.textContent)).toEqual(["every follow-up is handled (1 open)"]);
  });

  it("offers Resolved and shows no notice once the gate passes, and none where Resolved is not a next step", async () => {
    renderDetail(ticket());
    await screen.findByRole("heading", { name: "TCK-000042" });
    expect(statusOptions()).toContain("Resolved");
    expect(within(controls()).queryByRole("status", { name: "Why Resolved is unavailable" })).not.toBeInTheDocument();
  });

  it("shows no notice on a resolved ticket, whose next steps never include Resolved", async () => {
    renderDetail(ticket({ currentStatus: "RESOLVED", permittedTransitions: ["CLOSED", "REOPENED"], resolutionGate: { passes: false, completedCount: 0, plannedCount: 0, openFollowUpCount: 0 } }));
    await screen.findByRole("heading", { name: "TCK-000042" });
    expect(within(controls()).queryByRole("status", { name: "Why Resolved is unavailable" })).not.toBeInTheDocument();
  });
});

describe("UI-13 the summary refreshes after a change (FR-09)", () => {
  it("updates the header badge and controls from a status change's response", async () => {
    renderDetail(ticket());
    await screen.findByRole("heading", { name: "TCK-000042" });
    vi.spyOn(api, "changeStatus").mockResolvedValue(ticket({ currentStatus: "WAITING_FOR_REQUESTER", permittedTransitions: ["IN_PROGRESS", "RESOLVED", "CANCELLED"] }));
    await userEvent.selectOptions(within(controls()).getByLabelText("New status"), "WAITING_FOR_REQUESTER");
    await userEvent.click(within(controls()).getByRole("button", { name: "Update status" }));
    await waitFor(() => expect(screen.getAllByText("WAITING FOR REQUESTER").length).toBeGreaterThan(0));
    expect(statusOptions()).toEqual(["Choose…", "In progress", "Resolved", "Cancelled"]);
  });

  it("reloads the ticket after an action is completed, so the gate notice and the status choices change", async () => {
    const { load } = renderDetail(BLOCKED, ticket());
    await screen.findByRole("heading", { name: "TCK-000042" });
    expect(within(controls()).getByRole("status", { name: "Why Resolved is unavailable" })).toBeInTheDocument();
    vi.spyOn(api, "changeActionStatus").mockResolvedValue({ ...PLANNED, status: "COMPLETED", result: "Battery replaced.", performedBy: PIM, version: 2 });
    const area = await screen.findByRole("region", { name: /Actions taken/ });
    await userEvent.click(await within(area).findByRole("button", { name: "Complete" }));
    const dialog = await screen.findByRole("dialog", { name: "Complete this action?" });
    await userEvent.type(within(dialog).getByLabelText(/Result/), "Battery replaced.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark as completed" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(controls()).queryByRole("status", { name: "Why Resolved is unavailable" })).not.toBeInTheDocument());
    expect(statusOptions()).toContain("Resolved");
  });
});

describe("UI-13 the Requester sees when it was resolved (BR-31, ui-spec §6)", () => {
  it("shows the Bangkok date and time beside the resolution summary", async () => {
    vi.spyOn(api, "fetchCurrentUser").mockResolvedValue({ ...STAFF, id: 3, role: "REQUESTER" });
    vi.spyOn(api, "fetchActionsTaken").mockResolvedValue([]);
    vi.spyOn(api, "fetchTicket").mockResolvedValue({
      id: 42, ticketNumber: "TCK-000042", requester: { id: 3, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th" },
      category: { id: 1, name: "Hardware" }, relatedSystem: { id: 2, name: "Corporate Laptop" }, summary: "Laptop battery drains quickly",
      description: "Battery drops quickly.", requestedPriority: "MEDIUM", currentStatus: "RESOLVED", owner: PIM,
      resolutionSummary: "Replaced the battery and tested it.", requesterResolvedAt: null, resolvedAt: "2026-10-05T03:30:00.000Z",
      canComment: true, canMarkAppearsResolved: false, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-05T03:30:00.000Z", attachments: [],
    });
    render(
      <AuthProvider>
        <MemoryRouter future={ROUTER_FUTURE} initialEntries={["/tickets/42"]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    const resolution = await screen.findByRole("region", { name: "Resolution" });
    // 03:30 UTC is 10:30 in Bangkok.
    expect(within(resolution).getByText(/^Resolved on .*5 Oct 2026, 10:30$/)).toBeInTheDocument();
  });
});

describe("UI-14 a blocked resolution reported by the server (FR-08, BR-28)", () => {
  it("shows the server's reason under the status select and reloads the ticket and its actions", async () => {
    const { load, actions } = renderDetail(ticket(), BLOCKED);
    await screen.findByRole("heading", { name: "TCK-000042" });
    vi.spyOn(api, "changeStatus").mockRejectedValue(
      new ApiError(409, "RESOLUTION_BLOCKED", "This ticket can't be resolved yet: 1 planned action is still open."),
    );
    await userEvent.selectOptions(within(controls()).getByLabelText("New status"), "RESOLVED");
    await userEvent.click(within(controls()).getByRole("button", { name: "Update status" }));
    const dialog = await screen.findByRole("dialog", { name: "Resolve this ticket?" });
    await userEvent.type(within(dialog).getByLabelText("Resolution summary"), "Replaced the battery and tested it.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Resolve ticket" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await within(controls()).findByText("This ticket can't be resolved yet: 1 planned action is still open.")).toBeInTheDocument();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(actions).toHaveBeenCalledTimes(2));
    expect(within(controls()).getByRole("status", { name: "Why Resolved is unavailable" })).toBeInTheDocument();
  });
});
