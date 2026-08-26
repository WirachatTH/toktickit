import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../../src/components/Button.js";
import { TextInput } from "../../src/components/TextInput.js";
import { TextArea } from "../../src/components/TextArea.js";
import { Select } from "../../src/components/Select.js";
import { FormField } from "../../src/components/FormField.js";
import { Badge } from "../../src/components/Badge.js";
import { LoadingSpinner } from "../../src/components/LoadingSpinner.js";
import { EmptyState } from "../../src/components/EmptyState.js";
import { ErrorState } from "../../src/components/ErrorState.js";

// Issue 3 — Zen Green Design System component library
// (docs/lab-02/ui-spec.md §3–§5, issues.md Issue 3 "To test").

describe("Button", () => {
  it("shows a busy indicator and disables itself while busy", () => {
    render(
      <Button busy busyLabel="Submitting…">
        Submit
      </Button>
    );
    const button = screen.getByRole("button", { name: /submitting/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>
    );
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies the requested variant class", () => {
    render(<Button variant="destructive">Remove</Button>);
    expect(screen.getByRole("button", { name: /remove/i })).toHaveClass("zg-btn-destructive");
  });
});

describe("Field controls (TextInput/TextArea/Select)", () => {
  it("TextInput: read-only variant carries a visually distinct class from editable", () => {
    const { rerender } = render(<TextInput aria-label="Ticket Number" readOnly value="TCK-000001" onChange={() => {}} />);
    expect(screen.getByLabelText("Ticket Number")).toHaveClass("zg-field--readonly");

    rerender(<TextInput aria-label="Ticket Number" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Ticket Number")).not.toHaveClass("zg-field--readonly");
  });

  it("TextInput: invalid state applies is-invalid and aria-invalid", () => {
    render(<TextInput aria-label="Summary" invalid value="" onChange={() => {}} />);
    const input = screen.getByLabelText("Summary");
    expect(input).toHaveClass("is-invalid");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("TextArea: read-only variant carries a visually distinct class from editable", () => {
    render(<TextArea aria-label="Description" readOnly value="details" onChange={() => {}} />);
    expect(screen.getByLabelText("Description")).toHaveClass("zg-field--readonly");
  });

  it("Select: read-only variant stays keyboard-focusable (native readonly does not exist on <select>, and disabled would silently drop it from tab order)", () => {
    render(
      <Select aria-label="Category" readOnly value="1" onChange={() => {}}>
        <option value="1">Hardware</option>
        <option value="2">Software</option>
      </Select>
    );
    const select = screen.getByLabelText("Category");
    expect(select).not.toBeDisabled();
    expect(select).toHaveClass("zg-field--readonly");
    expect(select).toHaveAttribute("aria-readonly", "true");
  });

  it("Select: read-only variant blocks keyboard input from changing the value", async () => {
    render(
      <Select aria-label="Category" readOnly defaultValue="1" onChange={() => {}}>
        <option value="1">Hardware</option>
        <option value="2">Software</option>
      </Select>
    );
    const select = screen.getByLabelText("Category") as HTMLSelectElement;
    select.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(select.value).toBe("1");
  });
});

describe("FormField", () => {
  it("shows the required asterisk without it replacing the validation message", () => {
    render(
      <FormField htmlFor="summary" label="Summary" required error="Summary is required.">
        <TextInput id="summary" invalid value="" onChange={() => {}} />
      </FormField>
    );
    expect(screen.getByText("*")).toBeInTheDocument();
    expect(screen.getByText("Summary is required.")).toBeInTheDocument();
  });

  it("actually links the error to the field via aria-describedby, not just visual proximity", () => {
    render(
      <FormField htmlFor="summary" label="Summary" required error="Summary is required.">
        <TextInput id="summary" value="" onChange={() => {}} />
      </FormField>
    );
    const input = screen.getByLabelText(/summary/i);
    const errorMessage = screen.getByRole("alert");
    expect(input).toHaveAttribute("aria-describedby", errorMessage.id);
    expect(errorMessage.id).toBe("summary-error");
  });

  it("marks the field invalid automatically when an error is present, even if the caller forgot to pass invalid", () => {
    render(
      <FormField htmlFor="summary" label="Summary" error="Summary is required.">
        <TextInput id="summary" value="" onChange={() => {}} />
      </FormField>
    );
    expect(screen.getByLabelText(/summary/i)).toHaveClass("is-invalid");
  });

  it("preserves an existing aria-describedby on the field instead of overwriting it", () => {
    render(
      <FormField htmlFor="summary" label="Summary" error="Summary is required.">
        <TextInput id="summary" value="" aria-describedby="summary-hint" onChange={() => {}} />
      </FormField>
    );
    expect(screen.getByLabelText(/summary/i)).toHaveAttribute(
      "aria-describedby",
      "summary-hint summary-error"
    );
  });

  it("renders no error message when the field is valid", () => {
    render(
      <FormField htmlFor="summary" label="Summary" required>
        <TextInput id="summary" value="A valid summary" onChange={() => {}} />
      </FormField>
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Badge", () => {
  it("renders a distinct class per priority value", () => {
    const { rerender } = render(<Badge kind="priority" value="LOW" />);
    expect(screen.getByText("LOW")).toHaveClass("zg-badge--priority-low");

    rerender(<Badge kind="priority" value="HIGH" />);
    expect(screen.getByText("HIGH")).toHaveClass("zg-badge--priority-high");
  });

  it("renders the status badge class", () => {
    render(<Badge kind="status" value="NEW" />);
    expect(screen.getByText("NEW")).toHaveClass("zg-badge--status-new");
  });

  it("falls back to a visible, distinct class instead of emitting the literal string 'undefined' for an unrecognized value", () => {
    // Simulates unvalidated API data bypassing the compile-time union type.
    render(<Badge kind="priority" value={"URGENT" as unknown as "LOW"} />);
    const badge = screen.getByText("URGENT");
    expect(badge).toHaveClass("zg-badge--unknown");
    expect(badge.className).not.toContain("undefined");
  });
});

describe("Loading/empty/error states", () => {
  it("LoadingSpinner exposes a status role", () => {
    render(<LoadingSpinner label="Loading tickets…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading tickets…");
  });

  it("EmptyState and ErrorState render distinct, non-color-only messaging", () => {
    render(<EmptyState message="You haven't created any tickets yet." />);
    expect(screen.getByText("You haven't created any tickets yet.")).toBeInTheDocument();

    render(<ErrorState message="Something went wrong. Please try again." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});
