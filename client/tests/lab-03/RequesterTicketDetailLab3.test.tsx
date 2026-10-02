import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as api from "../../src/api.js";
import type { TicketDetail } from "../../src/api.js";
import { RequesterTicketDetail } from "../../src/screens/RequesterTicketDetail.js";
import { ROUTES } from "../../src/routes.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// The Requester Ticket Detail in Lab 3 (docs/lab-03/ui-spec.md §5). Issue 5
// adds UI-16 plus the owner line (BR-71) and the closed-ticket attachment rule
// (BR-70); Issue 6 adds the comments thread (UI-14); Issue 8 adds "Problem
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
  canComment: true,
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
  vi.spyOn(api, "fetchComments").mockResolvedValue([]);
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

const STAFF = { id: 8, name: "Pimchanok Srisuk", role: "IT_STAFF" as const, isActive: true };
const ME = { id: 3, name: "Somchai Prasert", role: "REQUESTER" as const, isActive: true };
const entry = (id: number, body: string, author: api.PersonRef = STAFF, createdAt = "2026-10-01T10:00:00.000Z") => ({ id, body, createdAt, author });

describe("UI-14 the Requester's comments thread and composer (FR-14, FR-15)", () => {
  it("shows the thread oldest first, each with author, role badge, and time, under 'Visible to you and IT Staff'", async () => {
    vi.mocked(api.fetchComments).mockResolvedValue([
      entry(1, "Could you restart it?", STAFF, "2026-10-01T10:00:00.000Z"),
      entry(2, "Restarted — still broken.", ME, "2026-10-01T11:00:00.000Z"),
    ]);
    renderDetail(BASE);
    const card = (await screen.findByRole("heading", { name: "Comments" })).closest("section")!;
    expect(within(card).getByText("Visible to you and IT Staff")).toBeInTheDocument();
    const items = await within(card).findAllByRole("listitem");
    expect(items.map((li) => within(li).getByTestId("entry-body").textContent)).toEqual(["Could you restart it?", "Restarted — still broken."]);
    expect(within(items[0]).getByText("Pimchanok Srisuk")).toBeInTheDocument();
    expect(within(items[0]).getByText("IT Staff")).toHaveClass("zg-badge--role-it-staff");
    expect(within(items[0]).getByRole("time")).toHaveAttribute("datetime", "2026-10-01T10:00:00.000Z");
    expect(api.fetchComments).toHaveBeenCalledWith(42);
  });

  it("says so when there are no comments yet", async () => {
    renderDetail(BASE);
    expect(await screen.findByText("No comments yet.")).toBeInTheDocument();
  });

  it("posts a comment, adds it to the thread, and clears the box; Post is blocked while the box is blank", async () => {
    const posted = entry(9, "Line one\nLine two", ME);
    const post = vi.spyOn(api, "postComment").mockResolvedValue(posted);
    renderDetail(BASE);
    const box = await screen.findByRole("textbox", { name: /add a comment/i });
    const button = screen.getByRole("button", { name: "Post comment" });
    expect(button).toBeDisabled();
    await userEvent.type(box, "   ");
    expect(button).toBeDisabled();
    await userEvent.clear(box);
    await userEvent.type(box, "Line one{Shift>}{Enter}{/Shift}Line two");
    expect(screen.getByText("17/2000")).toBeInTheDocument();
    await userEvent.click(button);

    await waitFor(() => expect(post).toHaveBeenCalledWith(42, "Line one\nLine two"));
    const body = await screen.findByTestId("entry-body");
    expect(body.textContent).toBe("Line one\nLine two");
    expect(body).toHaveStyle({ whiteSpace: "pre-wrap" });
    expect(box).toHaveValue("");
  });

  it("shows a server rejection below the box and keeps the text", async () => {
    vi.spyOn(api, "postComment").mockRejectedValue(new api.ApiError(400, "VALIDATION_ERROR", "x", { body: "Keep it to 2000 characters or fewer." }));
    renderDetail(BASE);
    const box = await screen.findByRole("textbox", { name: /add a comment/i });
    await userEvent.type(box, "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(await screen.findByText("Keep it to 2000 characters or fewer.")).toBeInTheDocument();
    expect(box).toHaveValue("Hello");
  });

  it("renders a body with HTML in it as text, never as markup (BR-51)", async () => {
    const unsafe = `<img src=x onerror="alert(1)"><script>alert("x")</script>`;
    vi.mocked(api.fetchComments).mockResolvedValue([entry(1, unsafe)]);
    const { container } = renderDetail(BASE);
    expect((await screen.findByTestId("entry-body")).textContent).toBe(unsafe);
    expect(container.querySelector("img[src='x'], script")).toBeNull();
  });

  it.each(["CLOSED", "CANCELLED"] as const)("on a %s ticket the thread stays readable and the composer is disabled with the closed note", async (status) => {
    vi.mocked(api.fetchComments).mockResolvedValue([entry(1, "Earlier reply")]);
    renderDetail({ ...BASE, currentStatus: status, canComment: false });
    expect(await screen.findByText("Earlier reply")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /add a comment/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Post comment" })).toBeDisabled();
    expect(screen.getByText("This ticket is closed — new comments are not accepted.")).toBeInTheDocument();
  });
});

// Follow-ups from the PR #56 review (Issue 7).
describe("#56 review: the composer's state", () => {
  it("closes the composer when the server says the ticket was closed meanwhile (409 TICKET_CLOSED)", async () => {
    vi.spyOn(api, "postComment").mockRejectedValue(new api.ApiError(409, "TICKET_CLOSED", "This ticket is closed, so new comments are not accepted."));
    renderDetail(BASE); // loaded as open: canComment true
    const box = await screen.findByRole("textbox", { name: /add a comment/i });
    await userEvent.type(box, "One more thing");
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(await screen.findByText("This ticket is closed — new comments are not accepted.")).toBeInTheDocument();
    expect(box).toBeDisabled();
    expect(screen.getByRole("button", { name: "Post comment" })).toBeDisabled();
  });

  it("keeps the composer disabled until the thread has loaded, and after the thread fails to load", async () => {
    let finish: (v: api.DiscussionEntry[]) => void = () => {};
    vi.mocked(api.fetchComments).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { unmount } = renderDetail(BASE);
    const box = await screen.findByRole("textbox", { name: /add a comment/i });
    expect(box).toBeDisabled();
    finish([]);
    await waitFor(() => expect(box).toBeEnabled());
    unmount();

    vi.mocked(api.fetchComments).mockRejectedValue(new Error("down"));
    renderDetail(BASE);
    expect(await screen.findByText("Unable to load this thread. Please reload the page.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /add a comment/i })).toBeDisabled();
  });

  it("keeps keyboard focus in the box after posting", async () => {
    vi.spyOn(api, "postComment").mockResolvedValue(entry(9, "Thanks!", ME));
    renderDetail(BASE);
    const box = await screen.findByRole("textbox", { name: /add a comment/i });
    await waitFor(() => expect(box).toBeEnabled());
    await userEvent.type(box, "Thanks!");
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    await screen.findByTestId("entry-body");
    await waitFor(() => expect(box).toHaveFocus());
  });
});
