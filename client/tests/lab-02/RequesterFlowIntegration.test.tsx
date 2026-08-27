import { describe, it, expect, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireRequester } from "../../src/components/RequireRequester.js";
import { AppShell } from "../../src/components/AppShell.js";
import { RequesterProvider, useRequester } from "../../src/context/RequesterContext.js";
import { ROUTES } from "../../src/routes.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// Issue 4 — integration coverage across RequesterContext + RequireRequester
// + AppShell together, not each in isolation. RequesterSelector.test.tsx,
// RequireRequester.test.tsx, and AppShell.test.tsx each mock or stub the
// other two — none of them proves that clicking the *real* Change Requester
// button, wired to the *real* context, actually gets a guarded screen back
// to the Selector. That exact "each piece tested alone, never together" gap
// is what shipped a real bug in a classmate's independently-built Lab 2
// (Change Requester left the user on a screen that then 404'd).

const STORAGE_KEY = "tokTickIT.devRequester";

function ShellLayout({ children }: { children: ReactNode }) {
  const { requester, changeRequester } = useRequester();
  return (
    <AppShell currentRequesterName={requester?.name} onChangeRequester={changeRequester}>
      {children}
    </AppShell>
  );
}

function renderApp() {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[ROUTES.list]}>
      <RequesterProvider>
        <Routes>
          <Route path={ROUTES.select} element={<div>SELECTOR_SCREEN</div>} />
          <Route
            path={ROUTES.list}
            element={
              <RequireRequester>
                <ShellLayout>
                  <p>MY_TICKETS_SCREEN</p>
                </ShellLayout>
              </RequireRequester>
            }
          />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

describe("Change Requester end-to-end (real context + real guard + real shell)", () => {
  beforeEach(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id: 1, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th" })
    );
  });

  it("clicking the real Change Requester button returns to the Selector via the guard reacting to context, with no explicit navigate() needed", async () => {
    renderApp();

    expect(screen.getByText("MY_TICKETS_SCREEN")).toBeInTheDocument();
    expect(screen.getByText("Somchai Prasert")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /change requester/i }));

    await waitFor(() => expect(screen.getByText("SELECTOR_SCREEN")).toBeInTheDocument());
    expect(screen.queryByText("MY_TICKETS_SCREEN")).not.toBeInTheDocument();
  });

  it("also clears the persisted selection, so a page reload does not silently restore the old Requester", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: /change requester/i }));
    await waitFor(() => expect(screen.getByText("SELECTOR_SCREEN")).toBeInTheDocument());

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
