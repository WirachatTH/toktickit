import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "../../src/components/Modal.js";

// Issue 10 — RESP-06 at component level (ui-spec §1.8, §10): the shared Modal.
// Screens pass onClose as an inline function, so the dialog re-renders with a
// new one whenever its parent does; that must never move the user's focus.

function Parent() {
  const [ticks, setTicks] = useState(0);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Modal titleId="t" onClose={() => setOpen(false)}>
          <h2 id="t">Dialog</h2>
          <button type="button">First</button>
          <label htmlFor="second">Second</label>
          <input id="second" />
          {/* Re-renders the parent, like a counter or a toast would. */}
          <button type="button" onClick={() => setTicks((n) => n + 1)}>Tick {ticks}</button>
        </Modal>
      )}
    </>
  );
}

describe("RESP-06 the shared Modal (ui-spec §1.8, §10)", () => {
  it("focuses the first control on open, and keeps focus where the user put it when the parent re-renders", async () => {
    render(<Parent />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();

    const second = screen.getByLabelText("Second");
    await userEvent.type(second, "abc");
    expect(second).toHaveFocus();
    // Re-render the parent without touching focus (a DOM click doesn't move it):
    // the Modal now gets a new onClose.
    screen.getByRole("button", { name: "Tick 0" }).click();
    expect(await screen.findByRole("button", { name: "Tick 1" })).toBeInTheDocument();
    expect(second).toHaveFocus();
    expect(second).toHaveValue("abc");
  });

  it("still closes with Escape through the latest onClose, and gives focus back to its opener", async () => {
    render(<Parent />);
    const open = screen.getByRole("button", { name: "Open" });
    await userEvent.click(open);
    await userEvent.click(screen.getByRole("button", { name: /^Tick/ }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(open).toHaveFocus();
  });
});
