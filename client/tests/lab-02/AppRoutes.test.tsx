import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../../src/AppRoutes.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { ROUTES } from "../../src/routes.js";
import * as api from "../../src/api.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// Regression coverage for a real external-review finding (message.txt,
// "Blocking 1"): RequesterSelector.test.tsx, RequireRequester.test.tsx, and
// AppShell.test.tsx each build their own synthetic <Routes> table, so
// nothing ever exercised the guard against the actual route table App.tsx
// ships. Deleting <RequireRequester> from all three guarded routes left the
// full suite green before this file existed — confirmed by reproducing it.
//
// This imports AppRoutes directly (the same component App.tsx renders
// inside BrowserRouter), so that specific regression is no longer possible
// without this file failing.
//
// Lab 3, Issue 4 (BR-69): the guard on these screens is now sign-in, not the
// Development Requester selection (Lab 2 BR-08 is superseded, Lab 3 BR-68). The
// "redirects to the Selector" cases are rewritten to assert the Lab 3 rule —
// redirect to Login — and the "renders directly" cases sign a Requester in
// instead of storing a selection; their assertions are unchanged.

const A_REQUESTER = { id: 1, name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th" };

const SIGNED_IN_REQUESTER: api.AuthUser = { ...A_REQUESTER, role: "REQUESTER", isActive: true, mustChangePassword: false };

function renderAt(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
        <RequesterProvider>
          <AppRoutes />
        </RequesterProvider>
      </MemoryRouter>
    </AuthProvider>
  );
}

const GUARDED_PATHS: Array<[string, string]> = [
  ["My Tickets", ROUTES.list],
  ["Create Ticket", ROUTES.create],
  ["Ticket Detail", "/tickets/42"],
];

describe("AppRoutes — the real route table, guarded end to end", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Selector's own states are covered elsewhere; here only the guard's
    // decision (redirect vs. render) matters, so keep the fetch fast.
    vi.spyOn(api, "fetchActiveRequesters").mockResolvedValue([A_REQUESTER]);
    vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(null);
  });

  it.each(GUARDED_PATHS)(
    "redirects %s to Login when nobody is signed in",
    async (_label, path) => {
      renderAt(path);
      expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    }
  );

  it.each(GUARDED_PATHS)(
    "renders %s directly when a Requester is already signed in — the guard doesn't over-block",
    async (_label, path) => {
      vi.mocked(api.fetchCurrentUser).mockResolvedValue(SIGNED_IN_REQUESTER);
      renderAt(path);
      expect(screen.queryByText(/this is not a login screen/i)).not.toBeInTheDocument();
      expect(await screen.findByText(A_REQUESTER.name)).toBeInTheDocument();
    }
  );

  it("AC-02 covers all three named screens, not just one", () => {
    // Documents the exact reviewer nitpick this file addresses: AC-02 names
    // My Tickets, Create Ticket, and Ticket Detail explicitly; the fix
    // above (it.each over GUARDED_PATHS) exercises every one of them.
    expect(GUARDED_PATHS.map(([label]) => label)).toEqual(["My Tickets", "Create Ticket", "Ticket Detail"]);
  });

  it("still lets the unguarded routes through with no Requester selected", async () => {
    renderAt(ROUTES.select);
    expect(await screen.findByText(/this is not a login screen/i)).toBeInTheDocument();

    renderAt("/");
    expect(await screen.findByText(/Check System/i)).toBeInTheDocument();
  });
});
