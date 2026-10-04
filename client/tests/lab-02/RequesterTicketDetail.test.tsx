import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequesterTicketDetail } from "../../src/screens/RequesterTicketDetail.js";
import * as api from "../../src/api.js";
import { ApiError, TicketDetail } from "../../src/api.js";
import { ROUTES } from "../../src/routes.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// Issue 8 — Requester Ticket Detail (ui-spec.md §6.5, specification.md
// BR-45/BR-46, AC-03). Attachment add/download/remove *interactions* are
// covered in AttachmentSection.test.tsx (UI-12/13/14) — this file covers
// the screen itself: what's shown, what's safely absent, and ownership.
//
// Lab 3, Issue 5 (BR-69): the Development Requester is gone (FR-13). Setup no
// longer stores a selection; the screen acts as the signed-in user, and the API
// calls no longer carry a Requester id (the server takes it from the session),
// so the assertions on those call arguments drop the id. Named in the PR.

const TICKET: TicketDetail = {
  id: 42,
  ticketNumber: "TCK-000042",
  requester: { id: 3, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th" },
  category: { id: 1, name: "Hardware" },
  relatedSystem: { id: 2, name: "Corporate Laptop" },
  summary: "Laptop battery drains quickly",
  description: "Battery drops from 100% to 20% within an hour of unplugging the charger.",
  requestedPriority: "MEDIUM",
  currentStatus: "NEW",
  // Lab 3 fields the payload now always carries (api-spec §3.3) — fixture only.
  owner: null,
  resolutionSummary: null,
  requesterResolvedAt: null,
  canComment: true,
  canMarkAppearsResolved: false,
  createdAt: "2026-08-27T09:15:00.000Z",
  updatedAt: "2026-08-27T09:15:00.000Z",
  attachments: [
    {
      id: 7,
      originalFilename: "battery_report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 184320,
      uploadedAt: "2026-08-27T09:15:00.000Z",
      isRemoved: false,
      removedAt: null,
      removedReason: null,
    },
  ],
};

function renderScreen(path = "/tickets/42") {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
      <Routes>
        <Route path={ROUTES.detailPattern} element={<RequesterTicketDetail />} />
        <Route path={ROUTES.list} element={<p>My Tickets screen placeholder</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  // Lab 3, Issue 6 — the screen now loads its Public Comments too (setup only).
  vi.spyOn(api, "fetchComments").mockResolvedValue([]);
});

describe("rendering an owned ticket (UI-10, BR-46)", () => {
  it("shows the ticket's read-only info, badges, and attachments", async () => {
    vi.spyOn(api, "fetchTicket").mockResolvedValue(TICKET);
    renderScreen();

    expect(await screen.findByText("TCK-000042")).toBeInTheDocument();
    expect(screen.getByText("Laptop battery drains quickly")).toBeInTheDocument();
    expect(screen.getByText(/battery drops from 100%/i)).toBeInTheDocument();
    expect(screen.getByText("Hardware")).toBeInTheDocument();
    expect(screen.getByText("Corporate Laptop")).toBeInTheDocument();
    expect(screen.getAllByText("Somchai Prasert").length).toBeGreaterThan(0);
    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
    expect(screen.getByText("NEW")).toBeInTheDocument();
    expect(screen.getByText("battery_report.pdf")).toBeInTheDocument();
  });

  // REG-14 — Lab 2 BR-46 ("no comment box") is superseded by Lab 3 FR-14/FR-15
  // (BR-68), so this test is rewritten to the Lab 3 rule (BR-69): the Requester
  // now has a comment box, and everything else BR-46 kept out stays out.
  it("REG-14 has a comment box, but never internal notes, IT Priority, Actions Taken, or a status control, regardless of the ticket's data", async () => {
    vi.spyOn(api, "fetchTicket").mockResolvedValue({ ...TICKET, itPriority: "HIGH", internalNotes: [{ body: "secret" }] } as TicketDetail);
    renderScreen();
    await screen.findByText("TCK-000042");

    expect(await screen.findByRole("textbox", { name: /add a comment/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post comment" })).toBeInTheDocument();
    expect(screen.queryByText(/internal note/i)).not.toBeInTheDocument();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
    expect(screen.queryByText(/IT Priority/i)).not.toBeInTheDocument();
    expect(screen.queryByText("HIGH")).not.toBeInTheDocument();
    expect(screen.queryByText(/action(s)? taken/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /status/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change status/i })).not.toBeInTheDocument();
  });

  it("fetches the ticket by the id in the URL (the server scopes it to the signed-in Requester)", async () => {
    const fetchSpy = vi.spyOn(api, "fetchTicket").mockResolvedValue(TICKET);
    renderScreen("/tickets/42");
    await screen.findByText("TCK-000042");
    expect(fetchSpy).toHaveBeenCalledWith(42);
  });

  it("offers a link back to My Tickets", async () => {
    vi.spyOn(api, "fetchTicket").mockResolvedValue(TICKET);
    renderScreen();
    await screen.findByText("TCK-000042");

    await userEvent.click(screen.getByRole("link", { name: /back to my tickets/i }));
    expect(await screen.findByText(/my tickets screen placeholder/i)).toBeInTheDocument();
  });
});

describe("a Ticket the current Requester does not own (UI-11, AC-03, BR-45)", () => {
  it("shows a safe not-found state for a deep link, with no ticket data ever rendered", async () => {
    vi.spyOn(api, "fetchTicket").mockRejectedValue(new ApiError(404, "NOT_FOUND", "Ticket not found."));
    renderScreen("/tickets/999");

    expect(await screen.findByText(/could not be found/i)).toBeInTheDocument();
    expect(screen.queryByText(/tck-/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Laptop battery drains quickly")).not.toBeInTheDocument();
  });

  it("offers a way back to My Tickets from the not-found state", async () => {
    vi.spyOn(api, "fetchTicket").mockRejectedValue(new ApiError(404, "NOT_FOUND", "Ticket not found."));
    renderScreen("/tickets/999");
    await screen.findByText(/could not be found/i);

    await userEvent.click(screen.getByRole("button", { name: /back to my tickets/i }));
    expect(await screen.findByText(/my tickets screen placeholder/i)).toBeInTheDocument();
  });
});

describe("failure and retry", () => {
  it("shows a safe failure state with a working retry on a non-404 error", async () => {
    const fetchSpy = vi
      .spyOn(api, "fetchTicket")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(TICKET);
    renderScreen();

    expect(await screen.findByText(/unable to load this ticket/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    await screen.findByText("TCK-000042");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
