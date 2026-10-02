import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as api from "../../src/api.js";
import type { TicketDetail } from "../../src/api.js";
import { RequesterTicketDetail } from "../../src/screens/RequesterTicketDetail.js";
import { ROUTES } from "../../src/routes.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// The Requester Ticket Detail in Lab 3 (docs/lab-03/ui-spec.md §5). Issue 5
// adds UI-16 plus the owner line (BR-71) and the closed-ticket attachment rule
// (BR-70); Issues 6 and 8 extend this file with comments (UI-14) and "Problem
// appears resolved" (UI-15).

const BASE: TicketDetail = {
  id: 42,
  ticketNumber: "TCK-000042",
  requester: { id: 3, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th" },
  category: { id: 1, name: "Hardware" },
  relatedSystem: { id: 2, name: "Corporate Laptop" },
  summary: "Laptop battery drains quickly",
  description: "Battery drops from 100% to 20% within an hour.",
  requestedPriority: "MEDIUM",
  currentStatus: "IN_PROGRESS",
  owner: null,
  resolutionSummary: null,
  requesterResolvedAt: null,
  createdAt: "2026-10-01T09:15:00.000Z",
  updatedAt: "2026-10-01T09:15:00.000Z",
  attachments: [
    {
      id: 7,
      originalFilename: "battery_report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 184320,
      uploadedAt: "2026-10-01T09:15:00.000Z",
      isRemoved: false,
      removedAt: null,
      removedReason: null,
    },
  ],
};

function renderDetail(ticket: TicketDetail | Record<string, unknown>) {
  vi.spyOn(api, "fetchTicket").mockResolvedValue(ticket as TicketDetail);
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={["/tickets/42"]}>
      <Routes>
        <Route path={ROUTES.detailPattern} element={<RequesterTicketDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("UI-16 what the Requester detail never shows (BR-71)", () => {
  it("renders neither IT Priority nor Internal Notes, even when a payload wrongly carries them", async () => {
    renderDetail({
      ...BASE,
      itPriority: "HIGH",
      internalNotes: [{ id: 1, body: "Internal: the battery is a recalled batch", author: { id: 8, name: "Pimchanok Srisuk" } }],
      noteCount: 1,
    });
    await screen.findByText("TCK-000042");

    expect(screen.queryByText("HIGH")).not.toBeInTheDocument();
    expect(screen.queryByText(/IT Priority/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recalled batch/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Pimchanok Srisuk")).not.toBeInTheDocument();
    // The Requester's own priority is still there.
    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
  });

  it("shows the owner's name, or 'Not yet assigned' when there is none", async () => {
    const { unmount } = renderDetail(BASE);
    expect(await screen.findByTestId("ticket-owner")).toHaveTextContent("Not yet assigned");
    unmount();

    renderDetail({ ...BASE, owner: { id: 8, name: "Pimchanok Srisuk", role: "IT_STAFF", isActive: true } });
    const owner = await screen.findByTestId("ticket-owner");
    expect(owner).toHaveTextContent("Pimchanok Srisuk");
    expect(owner).not.toHaveTextContent("Not yet assigned");
  });
});

describe("attachments on a closed ticket (BR-70)", () => {
  it.each(["CLOSED", "CANCELLED"] as const)("on %s: no Add Attachment or Remove, a notice, and Download still offered", async (status) => {
    renderDetail({ ...BASE, currentStatus: status });
    await screen.findByText("TCK-000042");

    expect(screen.queryByRole("button", { name: "Add Attachment" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add Attachment")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.getByText("Attachments can't be changed on a closed ticket.")).toBeInTheDocument();
    const row = screen.getByText("battery_report.pdf").closest("li")!;
    expect(within(row).getByRole("button", { name: "Download" })).toBeInTheDocument();
  });

  it("keeps Add Attachment and Remove on a ticket that is still open", async () => {
    renderDetail(BASE);
    await screen.findByText("TCK-000042");
    expect(screen.getByRole("button", { name: "Add Attachment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.queryByText("Attachments can't be changed on a closed ticket.")).not.toBeInTheDocument();
  });
});
