import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireRequester } from "../../src/components/RequireRequester.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";

// Issue 4 — route guard (AC-02, BR-08): no Requester-scoped screen is
// reachable without a current selection.

const STORAGE_KEY = "tokTickIT.devRequester";

function renderGuardedRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <RequesterProvider>
        <Routes>
          <Route path="/select-requester" element={<div>SELECTOR_SCREEN</div>} />
          <Route
            path="/tickets"
            element={
              <RequireRequester>
                <div>MY_TICKETS_SCREEN</div>
              </RequireRequester>
            }
          />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

describe("RequireRequester", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("redirects to the Selector when no Requester is selected", () => {
    renderGuardedRoute("/tickets");
    expect(screen.getByText("SELECTOR_SCREEN")).toBeInTheDocument();
    expect(screen.queryByText("MY_TICKETS_SCREEN")).not.toBeInTheDocument();
  });

  it("renders the guarded screen when a Requester is already selected", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id: 1, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th" })
    );
    renderGuardedRoute("/tickets");
    expect(screen.getByText("MY_TICKETS_SCREEN")).toBeInTheDocument();
  });

  it("ignores a corrupted localStorage value and redirects safely rather than crashing", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json");
    renderGuardedRoute("/tickets");
    expect(screen.getByText("SELECTOR_SCREEN")).toBeInTheDocument();
  });
});
