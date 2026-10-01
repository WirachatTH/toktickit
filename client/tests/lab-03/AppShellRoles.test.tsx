import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import * as api from "../../src/api.js";
import { AppRoutes } from "../../src/AppRoutes.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import { LocationProbe, REQUESTER } from "./authTestUtils.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// The app shell and routing for signed-in users (docs/lab-03/ui-spec.md §2).
// Issue 3 adds UI-12; Issue 4 extends this file with role navigation
// (UI-09 to UI-11).

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  vi.spyOn(api, "fetchActiveRequesters").mockResolvedValue([]);
  vi.spyOn(api, "checkSystem").mockResolvedValue({ online: true, categories: [] });
});

function renderAppAt(path: string) {
  return render(
    <AuthProvider>
      <RequesterProvider>
        <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
          <AppRoutes />
          <LocationProbe />
        </MemoryRouter>
      </RequesterProvider>
    </AuthProvider>,
  );
}

describe("UI-12 a user who must change their password", () => {
  it.each(["/", "/tickets", "/tickets/new", "/tickets/42", "/login", "/staff/queue", "/admin/users"])(
    "opening %s is taken to Change Password",
    async (path) => {
      vi.spyOn(api, "fetchCurrentUser").mockResolvedValue({ ...REQUESTER, mustChangePassword: true });
      renderAppAt(path);
      await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/change-password"));
      expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
    },
  );

  it("is not redirected once the password has been changed", async () => {
    vi.spyOn(api, "fetchCurrentUser").mockResolvedValue({ ...REQUESTER, mustChangePassword: false });
    renderAppAt("/");
    // Give the provider time to load the user, then confirm nothing moved.
    await waitFor(() => expect(api.fetchCurrentUser).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("leaves a signed-out visitor on the Lab 2 flow until Issue 5 (no forced redirect yet)", async () => {
    vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(null);
    renderAppAt("/tickets");
    await waitFor(() => expect(api.fetchCurrentUser).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/select-requester"));
  });
});
