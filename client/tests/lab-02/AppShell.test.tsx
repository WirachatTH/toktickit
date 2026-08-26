import { describe, it, expect, vi } from "vitest";
import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../../src/components/AppShell.js";

// Issue 3 — App shell navigation, Requester display, responsive mobile nav
// (docs/lab-02/ui-spec.md §6.1, issues.md Issue 3 "To test": UI-18/STYLE-02).

function renderShell(path: string, props: Partial<ComponentProps<typeof AppShell>> = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell {...props}>
        <p>Page content</p>
      </AppShell>
    </MemoryRouter>
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

  it("shows the current Requester name and calls onChangeRequester when clicked", async () => {
    const onChangeRequester = vi.fn();
    renderShell("/tickets", { currentRequesterName: "Somchai Prasert", onChangeRequester });

    expect(screen.getByText("Somchai Prasert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /change requester/i }));
    expect(onChangeRequester).toHaveBeenCalledOnce();
  });

  it("does not render the Requester display when no Requester is selected", () => {
    renderShell("/tickets");
    expect(screen.queryByRole("button", { name: /change requester/i })).not.toBeInTheDocument();
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
    renderShell("/tickets", { currentRequesterName: "Somchai Prasert", onChangeRequester: vi.fn() });

    const brand = screen.getByRole("link", { name: "TokTickIT" });
    const toggle = screen.getByRole("button", { name: /toggle navigation menu/i });
    const myTickets = screen.getByRole("link", { name: /my tickets/i });
    const createTicket = screen.getByRole("link", { name: /create ticket/i });
    const changeRequester = screen.getByRole("button", { name: /change requester/i });

    const focusOrder = [brand, toggle, myTickets, createTicket, changeRequester];
    for (const element of focusOrder) {
      await user.tab();
      expect(element).toHaveFocus();
    }
  });
});
