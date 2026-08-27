import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CreateTicket } from "../../src/screens/CreateTicket.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";
import type { Ticket } from "../../src/api.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// Issue 5 — Create Ticket (ui-spec.md §6.3, specification.md AC-01/AC-04/
// AC-05/AC-06/AC-07/AC-15).

const CATEGORIES = [{ id: 1, name: "Hardware" }];
const SYSTEMS = [{ id: 1, name: "Corporate Laptop" }];
const REQUESTER = { id: 3, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th" };

const VALID_TICKET_RESPONSE: Ticket = {
  id: 42,
  ticketNumber: "TCK-000042",
  requesterId: REQUESTER.id,
  categoryId: 1,
  relatedSystemId: 1,
  summary: "Laptop battery drains quickly",
  description: "The battery drops from 100% to 20% within an hour of unplugging the charger.",
  requestedPriority: "MEDIUM",
  currentStatus: "NEW",
  createdAt: "2026-08-27T09:15:00.000Z",
  updatedAt: "2026-08-27T09:15:00.000Z",
  attachments: [],
};

function renderScreen() {
  window.localStorage.setItem("tokTickIT.devRequester", JSON.stringify(REQUESTER));
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={["/tickets/new"]}>
      <RequesterProvider>
        <CreateTicket />
      </RequesterProvider>
    </MemoryRouter>
  );
}

async function fillValidForm() {
  await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeInTheDocument());
  await userEvent.selectOptions(screen.getByLabelText(/category/i), "1");
  await userEvent.selectOptions(screen.getByLabelText(/related system/i), "1");
  await userEvent.type(screen.getByLabelText(/ticket summary/i), "Laptop battery drains quickly");
  await userEvent.type(
    screen.getByLabelText(/description/i),
    "The battery drops from 100% to 20% within an hour of unplugging the charger."
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(api, "fetchCategories").mockResolvedValue(CATEGORIES);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(SYSTEMS);
});

describe("reference data comes from the database", () => {
  it("loads Category and Related System options from the API", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByRole("option", { name: "Hardware" })).toBeInTheDocument());
    expect(screen.getByRole("option", { name: "Corporate Laptop" })).toBeInTheDocument();
  });

  it("shows a safe failure state with a working retry when reference data fails to load", async () => {
    vi.spyOn(api, "fetchCategories").mockRejectedValueOnce(new Error("network down"));
    renderScreen();
    await waitFor(() => expect(screen.getByText(/unable to load categories/i)).toBeInTheDocument());
  });
});

describe("the read-only, system-generated fields", () => {
  it("shows Ticket Number and Ticket Date as not-yet-generated, and Requester pre-filled from the current selection", async () => {
    renderScreen();
    expect(screen.getByLabelText(/ticket number/i)).toHaveValue("Generated after submission");
    expect(screen.getByLabelText(/requester/i)).toHaveValue(REQUESTER.name);
    expect(screen.getByLabelText(/ticket number/i)).toHaveClass("zg-field--readonly");
  });
});

describe("validation before submit", () => {
  it("rejects an empty required field without calling the API (AC-04)", async () => {
    const createSpy = vi.spyOn(api, "createTicket");
    renderScreen();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByText(/summary must be between/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("rejects a summary that is too short without calling the API", async () => {
    const createSpy = vi.spyOn(api, "createTicket");
    renderScreen();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/category/i), "1");
    await userEvent.selectOptions(screen.getByLabelText(/related system/i), "1");
    await userEvent.type(screen.getByLabelText(/ticket summary/i), "hi");
    await userEvent.type(screen.getByLabelText(/description/i), "A description that is definitely long enough.");
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByText(/summary must be between/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe("submission", () => {
  it("sends the requester id and the trimmed payload", async () => {
    const createSpy = vi.spyOn(api, "createTicket").mockResolvedValue(VALID_TICKET_RESPONSE);
    renderScreen();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith(
      REQUESTER.id,
      expect.objectContaining({
        categoryId: 1,
        relatedSystemId: 1,
        summary: "Laptop battery drains quickly",
        requestedPriority: "MEDIUM",
      })
    );
  });

  it("shows a busy, disabled Submit while the request is in flight", async () => {
    let resolveCreate: (t: typeof VALID_TICKET_RESPONSE) => void = () => {};
    vi.spyOn(api, "createTicket").mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; })
    );
    renderScreen();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByRole("button", { name: /submitting/i })).toBeDisabled();

    // Let the pending promise settle and the resulting re-render happen
    // inside this test's async scope, rather than leaking a state update
    // past the test's own end (which would log an act() warning).
    resolveCreate(VALID_TICKET_RESPONSE);
    await screen.findByTestId("created-ticket-number");
  });

  it("issues exactly one request when Submit is clicked twice rapidly", async () => {
    const createSpy = vi.spyOn(api, "createTicket").mockResolvedValue(VALID_TICKET_RESPONSE);
    renderScreen();
    await fillValidForm();

    const button = screen.getByRole("button", { name: /submit ticket/i });
    await userEvent.click(button);
    await userEvent.click(button);

    await waitFor(() => expect(screen.getByTestId("created-ticket-number")).toBeInTheDocument());
    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});

describe("success state", () => {
  it("shows the ticket number returned by the backend", async () => {
    vi.spyOn(api, "createTicket").mockResolvedValue(VALID_TICKET_RESPONSE);
    renderScreen();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByTestId("created-ticket-number")).toHaveTextContent("TCK-000042");
    expect(screen.getByRole("button", { name: /view ticket/i })).toBeInTheDocument();
  });

  it("offers Create another, which returns to an empty form", async () => {
    vi.spyOn(api, "createTicket").mockResolvedValue(VALID_TICKET_RESPONSE);
    renderScreen();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));
    await screen.findByTestId("created-ticket-number");

    await userEvent.click(screen.getByRole("button", { name: /create another/i }));
    await waitFor(() => expect(screen.getByLabelText(/ticket summary/i)).toHaveValue(""));
  });
});

describe("API failure preserves what the requester typed", () => {
  it("shows a safe error and keeps every entered value", async () => {
    vi.spyOn(api, "createTicket").mockRejectedValue(new Error("network down"));
    renderScreen();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByText(/cannot reach the toktickit api/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ticket summary/i)).toHaveValue("Laptop battery drains quickly");
    expect(screen.getByLabelText(/description/i)).toHaveValue(
      "The battery drops from 100% to 20% within an hour of unplugging the charger."
    );
  });

  it("re-enables Submit so the requester can retry", async () => {
    vi.spyOn(api, "createTicket").mockRejectedValue(new Error("network down"));
    renderScreen();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /submit ticket/i })).toBeEnabled());
  });

  it("shows no success state when creation failed", async () => {
    vi.spyOn(api, "createTicket").mockRejectedValue(new Error("network down"));
    renderScreen();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    await screen.findByText(/cannot reach the toktickit api/i);
    expect(screen.queryByTestId("created-ticket-number")).not.toBeInTheDocument();
  });
});

describe("attachments on the Create Ticket form", () => {
  function makeFile(name: string, sizeBytes: number, type: string): File {
    const file = new File([new Uint8Array(sizeBytes)], name, { type });
    return file;
  }

  it("lists a chosen valid file with its name and size, removable before submit", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeInTheDocument());

    const input = screen.getByLabelText(/attachments/i) as HTMLInputElement;
    const file = makeFile("photo.png", 1024, "image/png");
    await userEvent.upload(input, file);

    expect(await screen.findByText(/photo\.png/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(screen.queryByText(/photo\.png/)).not.toBeInTheDocument();
  });

  it("rejects an oversized file client-side with a reason, and it is not sent on submit", async () => {
    const createSpy = vi.spyOn(api, "createTicket").mockResolvedValue(VALID_TICKET_RESPONSE);
    renderScreen();
    await fillValidForm();

    const input = screen.getByLabelText(/attachments/i) as HTMLInputElement;
    const tooBig = makeFile("huge.png", 6 * 1024 * 1024, "image/png");
    await userEvent.upload(input, tooBig);

    expect(await screen.findByText(/exceeds the 5 mb limit/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy.mock.calls[0][1].attachments).toEqual([]);
  });

  it("rejects a disallowed file type client-side without blocking the rest of the form", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeInTheDocument());

    const input = screen.getByLabelText(/attachments/i) as HTMLInputElement;
    const badType = makeFile("virus.exe", 1024, "application/octet-stream");
    // userEvent.upload() simulates the OS file picker's own accept-attribute
    // filtering and would silently drop this file before it ever reached the
    // component — but a real browser lets a user pick any file regardless of
    // `accept` (e.g. "All Files" in the picker, or drag-and-drop, which
    // ignores accept entirely). Dispatching the change event directly is
    // what actually exercises the app's own client-side rejection, which is
    // the real behavior under test here.
    Object.defineProperty(input, "files", { value: [badType], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByText(/only jpg, jpeg, png, webp, and pdf/i)).toBeInTheDocument();
  });

  it("stops accepting new files once 5 are queued", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeInTheDocument());

    const input = screen.getByLabelText(/attachments/i) as HTMLInputElement;
    const files = Array.from({ length: 5 }, (_, i) => makeFile(`photo-${i}.png`, 1024, "image/png"));
    await userEvent.upload(input, files);

    await waitFor(() => expect(screen.getByLabelText(/attachments/i)).toBeDisabled());
  });

  it("sends only the valid attachments on submit, alongside the ticket fields", async () => {
    const createSpy = vi.spyOn(api, "createTicket").mockResolvedValue(VALID_TICKET_RESPONSE);
    renderScreen();
    await fillValidForm();

    const input = screen.getByLabelText(/attachments/i) as HTMLInputElement;
    await userEvent.upload(input, makeFile("photo.png", 1024, "image/png"));

    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy.mock.calls[0][1].attachments).toHaveLength(1);
    expect(createSpy.mock.calls[0][1].attachments![0].name).toBe("photo.png");
  });
});
