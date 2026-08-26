import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequesterSelector } from "../../src/screens/RequesterSelector.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";

// Issue 4 — Development Requester Selection screen
// (ui-spec.md §6.2, tests.md UI-15/UI-16/UI-17).

const ACTIVE_REQUESTERS = [
  { id: 1, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th" },
  { id: 2, name: "Napassorn Chaiyasit", email: "napassorn.chaiyasit@kmutt.ac.th" },
];

function renderSelector() {
  return render(
    <MemoryRouter initialEntries={["/select-requester"]}>
      <RequesterProvider>
        <Routes>
          <Route path="/select-requester" element={<RequesterSelector />} />
          <Route path="/tickets" element={<div>MY_TICKETS_SCREEN</div>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("RequesterSelector", () => {
  it("shows the required 'not a login screen' explanation", async () => {
    vi.spyOn(api, "fetchActiveRequesters").mockResolvedValue(ACTIVE_REQUESTERS);
    renderSelector();
    expect(screen.getByText(/this is not a login screen/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/development requester/i)).toBeInTheDocument());
  });

  it("shows a loading state while the active-requester list is in flight", () => {
    vi.spyOn(api, "fetchActiveRequesters").mockReturnValue(new Promise(() => {}));
    renderSelector();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an empty state when there are no active Requesters", async () => {
    vi.spyOn(api, "fetchActiveRequesters").mockResolvedValue([]);
    renderSelector();
    await waitFor(() => {
      expect(screen.getByText(/no active requesters are available/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows a safe failure state when the API call fails, with a working retry", async () => {
    const spy = vi
      .spyOn(api, "fetchActiveRequesters")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(ACTIVE_REQUESTERS);
    renderSelector();

    await waitFor(() => {
      expect(screen.getByText(/unable to load development requesters/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("populates the dropdown with exactly the Requesters the API returned", async () => {
    vi.spyOn(api, "fetchActiveRequesters").mockResolvedValue(ACTIVE_REQUESTERS);
    renderSelector();

    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());
    expect(screen.getByRole("option", { name: "Somchai Prasert" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Napassorn Chaiyasit" })).toBeInTheDocument();
  });

  it("disables Continue until a Requester is chosen", async () => {
    vi.spyOn(api, "fetchActiveRequesters").mockResolvedValue(ACTIVE_REQUESTERS);
    renderSelector();

    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    await userEvent.selectOptions(screen.getByRole("combobox"), "1");
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  it("persists the selection and navigates to My Tickets on Continue, fully by keyboard", async () => {
    vi.spyOn(api, "fetchActiveRequesters").mockResolvedValue(ACTIVE_REQUESTERS);
    renderSelector();

    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());

    const select = screen.getByRole("combobox");
    select.focus();
    await userEvent.selectOptions(select, "2");
    await userEvent.tab();
    expect(screen.getByRole("button", { name: /continue/i })).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText("MY_TICKETS_SCREEN")).toBeInTheDocument());

    const stored = JSON.parse(window.localStorage.getItem("tokTickIT.devRequester") ?? "null");
    expect(stored).toEqual(ACTIVE_REQUESTERS[1]);
  });
});
