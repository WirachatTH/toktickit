import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MyTickets } from "../../src/screens/MyTickets.js";
import { RequesterProvider, useRequester } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";
import type { Requester, TicketListItem, TicketListResponse } from "../../src/api.js";
import { ROUTES } from "../../src/routes.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// Issue 7 — My Tickets (ui-spec.md §6.4, specification.md BR-12/BR-14-19,
// AC-10, AC-13, BR-09/BR-43/BR-44).
//
// The screen deliberately renders BOTH the desktop table and the mobile
// card list at once (RESP-01 test below) — CSS `d-none`/`d-md-none` picks
// which is visible, jsdom doesn't apply either. So every ticket number in
// these tests appears twice in the DOM; assertions below use findAllByText
// (or scope into one container with `within`) rather than the singular
// findByText/getByText, which throws on more than one match. Likewise
// "Create Ticket" appears both in the page header and, in the empty state,
// as the CTA — getAllByRole is used there for the same reason.

const CATEGORIES = [
  { id: 1, name: "Hardware" },
  { id: 2, name: "Software" },
];
const SYSTEMS = [{ id: 1, name: "Corporate Laptop" }];

const REQUESTER_A: Requester = { id: 3, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th" };
const REQUESTER_B: Requester = { id: 4, name: "Napassorn Chaiyasit", email: "napassorn.chaiyasit@kmutt.ac.th" };

const TICKET_A: TicketListItem = {
  id: 1,
  ticketNumber: "TCK-000001",
  summary: "Laptop battery drains quickly",
  categoryName: "Hardware",
  relatedSystemName: "Corporate Laptop",
  requestedPriority: "MEDIUM",
  currentStatus: "NEW",
  attachmentCount: 0,
  createdAt: "2026-08-27T09:15:00.000Z",
  updatedAt: "2026-08-27T09:15:00.000Z",
};

const TICKET_B: TicketListItem = {
  id: 2,
  ticketNumber: "TCK-000002",
  summary: "Requester B's own ticket",
  categoryName: "Software",
  relatedSystemName: "Corporate Laptop",
  requestedPriority: "LOW",
  currentStatus: "NEW",
  attachmentCount: 0,
  createdAt: "2026-08-27T09:15:00.000Z",
  updatedAt: "2026-08-27T09:15:00.000Z",
};

function paginatedResponse(data: TicketListItem[]): TicketListResponse {
  return { data, pagination: { page: 1, pageSize: 10, totalItems: data.length, totalPages: data.length > 0 ? 1 : 0 } };
}

function renderScreen(requester: Requester = REQUESTER_A) {
  window.localStorage.setItem("tokTickIT.devRequester", JSON.stringify(requester));
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[ROUTES.list]}>
      <RequesterProvider>
        <Routes>
          <Route path={ROUTES.list} element={<MyTickets />} />
          <Route path={ROUTES.detailPattern} element={<p>Ticket Detail screen placeholder</p>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(api, "fetchCategories").mockResolvedValue(CATEGORIES);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(SYSTEMS);
});

describe("loading and rendering the list", () => {
  it("requests the list scoped to the current Requester and renders it", async () => {
    const fetchSpy = vi.spyOn(api, "fetchTickets").mockResolvedValue(paginatedResponse([TICKET_A]));
    renderScreen();

    await waitFor(async () => expect((await screen.findAllByText("TCK-000001")).length).toBeGreaterThan(0));
    expect(fetchSpy).toHaveBeenCalledWith(REQUESTER_A.id, expect.any(Object));
  });

  it("renders both the desktop table and the mobile card list in the DOM — the CSS breakpoint (not jsdom) decides which is visible (RESP-01)", async () => {
    vi.spyOn(api, "fetchTickets").mockResolvedValue(paginatedResponse([TICKET_A]));
    renderScreen();

    await screen.findAllByText("TCK-000001");
    expect(screen.getByTestId("my-tickets-table")).toBeInTheDocument();
    expect(within(screen.getByTestId("my-tickets-table")).getByText("TCK-000001")).toBeInTheDocument();
    expect(screen.getByTestId("my-tickets-cards")).toBeInTheDocument();
    expect(within(screen.getByTestId("my-tickets-cards")).getByText("TCK-000001")).toBeInTheDocument();
  });

  it("navigates to Ticket Detail when a row is clicked", async () => {
    vi.spyOn(api, "fetchTickets").mockResolvedValue(paginatedResponse([TICKET_A]));
    renderScreen();

    const table = await screen.findByTestId("my-tickets-table");
    await userEvent.click(within(table).getByText("TCK-000001"));
    expect(await screen.findByText(/ticket detail screen placeholder/i)).toBeInTheDocument();
  });

  it("shows a safe failure state with a working retry on API failure", async () => {
    const fetchSpy = vi
      .spyOn(api, "fetchTickets")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(paginatedResponse([TICKET_A]));
    renderScreen();

    expect(await screen.findByText(/unable to load your tickets/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    await screen.findAllByText("TCK-000001");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("empty state — zero tickets ever (UI-07, BR-43)", () => {
  it("shows the empty state with a Create Ticket call to action, distinct from no-results", async () => {
    vi.spyOn(api, "fetchTickets").mockResolvedValue(paginatedResponse([]));
    renderScreen();

    expect(await screen.findByText(/haven't created any tickets yet/i)).toBeInTheDocument();
    // Header's own "Create Ticket" button plus the empty state's CTA.
    expect(screen.getAllByRole("button", { name: /^create ticket$/i }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/no tickets match your filters/i)).not.toBeInTheDocument();
  });
});

describe("no-results state — a filter narrows an existing list to zero (UI-08, BR-44)", () => {
  it("shows the no-results state once a filter matches nothing, and Clear Filters restores the list", async () => {
    vi.spyOn(api, "fetchTickets").mockImplementation(async (_requesterId, params = {}) => {
      if (params.categoryId === 2) return paginatedResponse([]);
      return paginatedResponse([TICKET_A]);
    });
    renderScreen();

    await screen.findAllByText("TCK-000001");

    await userEvent.selectOptions(screen.getByLabelText(/^category$/i), "2");
    expect(await screen.findByText(/no tickets match your filters/i)).toBeInTheDocument();
    expect(screen.queryByText(/haven't created any tickets yet/i)).not.toBeInTheDocument();

    const clearButtons = screen.getAllByRole("button", { name: /clear filters/i });
    await userEvent.click(clearButtons[0]);

    await waitFor(async () => expect((await screen.findAllByText("TCK-000001")).length).toBeGreaterThan(0));
    expect(screen.getByLabelText(/^category$/i)).toHaveValue("");
  });
});

describe("switching the selected Requester reloads the list live (UI-09, AC-10, BR-09)", () => {
  function SwitchRequesterButton({ to }: { to: Requester }) {
    const { selectRequester } = useRequester();
    return (
      <button type="button" onClick={() => selectRequester(to)}>
        test-switch-requester
      </button>
    );
  }

  it("drops Requester A's tickets and loads Requester B's as soon as the selection changes", async () => {
    vi.spyOn(api, "fetchTickets").mockImplementation(async (requesterId) =>
      requesterId === REQUESTER_A.id ? paginatedResponse([TICKET_A]) : paginatedResponse([TICKET_B])
    );

    window.localStorage.setItem("tokTickIT.devRequester", JSON.stringify(REQUESTER_A));
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <RequesterProvider>
          <SwitchRequesterButton to={REQUESTER_B} />
          <MyTickets />
        </RequesterProvider>
      </MemoryRouter>
    );

    await screen.findAllByText("TCK-000001");

    await userEvent.click(screen.getByRole("button", { name: "test-switch-requester" }));

    await waitFor(() => expect(screen.getAllByText("TCK-000002").length).toBeGreaterThan(0));
    expect(screen.queryAllByText("TCK-000001")).toHaveLength(0);
  });
});

describe("search, filters, sort, and pagination interactions on MyTickets screen", () => {
  it("debounces search input and sends search parameter to the API", async () => {
    const fetchSpy = vi.spyOn(api, "fetchTickets").mockResolvedValue(paginatedResponse([TICKET_A]));
    renderScreen();

    await screen.findAllByText("TCK-000001");
    fetchSpy.mockClear();

    const searchInput = screen.getAllByLabelText(/^search$/i)[0];
    await userEvent.type(searchInput, "battery");

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        REQUESTER_A.id,
        expect.objectContaining({ search: "battery", page: 1 })
      );
    });
  });

  it("updates query parameters when Related System and Priority filters change", async () => {
    const fetchSpy = vi.spyOn(api, "fetchTickets").mockResolvedValue(paginatedResponse([TICKET_A]));
    renderScreen();

    await screen.findAllByText("TCK-000001");
    fetchSpy.mockClear();

    await userEvent.selectOptions(screen.getByLabelText(/^related system$/i), "1");
    expect(fetchSpy).toHaveBeenCalledWith(
      REQUESTER_A.id,
      expect.objectContaining({ relatedSystemId: 1, page: 1 })
    );

    await userEvent.selectOptions(screen.getByLabelText(/^priority$/i), "HIGH");
    expect(fetchSpy).toHaveBeenCalledWith(
      REQUESTER_A.id,
      expect.objectContaining({ requestedPriority: "HIGH", page: 1 })
    );
  });

  it("updates query parameters when Sort dropdown option is selected", async () => {
    const fetchSpy = vi.spyOn(api, "fetchTickets").mockResolvedValue(paginatedResponse([TICKET_A]));
    renderScreen();

    await screen.findAllByText("TCK-000001");
    fetchSpy.mockClear();

    await userEvent.selectOptions(screen.getByLabelText(/^sort$/i), "requestedPriority:desc");
    expect(fetchSpy).toHaveBeenCalledWith(
      REQUESTER_A.id,
      expect.objectContaining({ sort: "requestedPriority", order: "desc", page: 1 })
    );
  });

  it("handles pagination: Next button fetches next page, Prev button is disabled on page 1", async () => {
    const fetchSpy = vi.spyOn(api, "fetchTickets").mockResolvedValue({
      data: [TICKET_A],
      pagination: { page: 1, pageSize: 10, totalItems: 25, totalPages: 3 },
    });
    renderScreen();

    await screen.findAllByText("TCK-000001");
    const prevButton = screen.getByRole("button", { name: /^prev$/i });
    const nextButton = screen.getByRole("button", { name: /^next$/i });

    expect(prevButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    fetchSpy.mockResolvedValueOnce({
      data: [TICKET_B],
      pagination: { page: 2, pageSize: 10, totalItems: 25, totalPages: 3 },
    });

    await userEvent.click(nextButton);
    expect(fetchSpy).toHaveBeenCalledWith(
      REQUESTER_A.id,
      expect.objectContaining({ page: 2 })
    );
  });

  it("navigates to Ticket Detail via keyboard Enter or Space on table row", async () => {
    vi.spyOn(api, "fetchTickets").mockResolvedValue(paginatedResponse([TICKET_A]));
    renderScreen();

    const table = await screen.findByTestId("my-tickets-table");
    const row = within(table).getByText("TCK-000001").closest("tr");
    expect(row).toBeInTheDocument();

    row?.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText(/ticket detail screen placeholder/i)).toBeInTheDocument();
  });
});
