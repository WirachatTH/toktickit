import { describe, it, expect, vi } from "vitest";
import * as api from "../../src/api.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../../src/components/AppShell.js";
import { ROUTER_FUTURE } from "./routerFuture.js";

// Issue 3 — App shell navigation, Requester display, responsive mobile nav
// (docs/lab-02/ui-spec.md §6.1, issues.md Issue 3 "To test": UI-18/STYLE-02).
//
// Lab 3, Issue 5 (BR-69): the shell's Development Requester display and its
// Change Requester action are superseded by the signed-in user's block (Lab 2
// BR-41 → Lab 3 FR-09), so the three tests that used them are rewritten to the
// Lab 3 rule; the navigation and mobile tests are unchanged.

const SIGNED_IN: api.AuthUser = {
  id: 3,
  name: "Somchai Prasert",
  email: "somchai.prasert@kmutt.ac.th",
  role: "REQUESTER",
  isActive: true,
  mustChangePassword: false,
};

function renderShell(path: string, props: Partial<ComponentProps<typeof AppShell>> = {}) {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
      <AppShell {...props}>
        <p>Page content</p>
      </AppShell>
    </MemoryRouter>
  );
}

function renderSignedInShell(path: string) {
  vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(SIGNED_IN);
  return render(
    <AuthProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
        <AppShell>
          <p>Page content</p>
        </AppShell>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("AppShell", () => {
  it("renders the TokTickIT identity and both nav links", () => {
    renderShell("/tickets");
    expect(screen.getByText("TokTickIT")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /my tickets/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create ticket/i })).toBeInTheDocument();
  });

  it("marks the current page's nav link active and no other", () => {
    renderShell("/tickets/new");
    const myTickets = screen.getByRole("link", { name: /my tickets/i });
    const createTicket = screen.getByRole("link", { name: /create ticket/i });

    expect(createTicket).toHaveClass("zg-nav-link--active");
    expect(createTicket).toHaveAttribute("aria-current", "page");
    expect(myTickets).not.toHaveClass("zg-nav-link--active");
    expect(myTickets).not.toHaveAttribute("aria-current");
  });

  it("shows the signed-in user's name and ends the session when Log out is clicked", async () => {
    const logout = vi.spyOn(api, "logout").mockResolvedValue();
    renderSignedInShell("/tickets");

    expect(await screen.findByText("Somchai Prasert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(logout).toHaveBeenCalledOnce();
  });

  it("does not render the account block when nobody is signed in", () => {
    renderShell("/tickets");
    expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();
  });

  it("toggles the mobile nav open state and its aria-expanded flag", async () => {
    renderShell("/tickets");
    const toggle = screen.getByRole("button", { name: /toggle navigation menu/i });
    const nav = screen.getByRole("navigation", { name: /primary/i });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(nav).not.toHaveClass("zg-shell-nav--open");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(nav).toHaveClass("zg-shell-nav--open");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(nav).not.toHaveClass("zg-shell-nav--open");
  });

  it("keeps every interactive control reachable by keyboard alone", async () => {
    const user = userEvent.setup();
    renderSignedInShell("/tickets");
    await screen.findByText("Somchai Prasert");

    const brand = screen.getByRole("link", { name: "TokTickIT" });
    const toggle = screen.getByRole("button", { name: /toggle navigation menu/i });
    const myTickets = screen.getByRole("link", { name: /my tickets/i });
    const createTicket = screen.getByRole("link", { name: /create ticket/i });
    const changePassword = screen.getByRole("link", { name: /change password/i });
    const logOut = screen.getByRole("button", { name: /log out/i });

    const focusOrder = [brand, toggle, myTickets, createTicket, changePassword, logOut];
    for (const element of focusOrder) {
      await user.tab();
      expect(element).toHaveFocus();
    }
  });

  // Regression tripwire (review finding, message.txt): the mobile nav was
  // once visible before the toggle was ever opened, because a Bootstrap
  // "d-flex" utility class compiles to `display: flex !important`, which
  // silently beat zen-green.css's `display: none` media-query rule — a bug
  // jsdom's lack of real CSS could never catch. This can't assert the
  // computed style (jsdom doesn't apply CSS), but it *can* assert the
  // regression's literal cause never comes back: no Bootstrap layout
  // utility class riding along on the element the media query controls.
  it("never carries a Bootstrap !important layout utility class that would defeat the mobile media query", () => {
    renderShell("/tickets");
    const nav = screen.getByRole("navigation", { name: /primary/i });
    for (const utility of ["d-flex", "d-inline-flex", "d-block", "d-inline"]) {
      expect(nav).not.toHaveClass(utility);
    }
  });
});
