import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { Badge, RoleBadge } from "../../src/components/Badge.js";
import { InternalRegion } from "../../src/components/DiscussionPanel.js";
import { TextInput } from "../../src/components/TextInput.js";
import { Select } from "../../src/components/Select.js";

// Zen Green additions for Lab 3 (docs/lab-03/ui-spec.md §1). Issue 4 adds
// STYLE-05; later issues extend this file with the status badges and the
// Internal region.

// Vitest runs from the client folder (jsdom gives import.meta.url an http: scheme).
const css = readFileSync(resolve(process.cwd(), "src/styles/zen-green.css"), "utf8");

// The declarations of one class's own rule, lower-cased, whitespace collapsed.
function ruleOf(selector: string): string {
  const match = css.match(new RegExp(`${selector.replace(/[.-]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} has a rule`).not.toBeNull();
  return match![1].toLowerCase().replace(/\s+/g, " ");
}

describe("STYLE-05 role badges and shared priority badges", () => {
  it("labels each role in words and gives it its own class", () => {
    render(
      <>
        <RoleBadge role="REQUESTER" />
        <RoleBadge role="IT_STAFF" />
        <RoleBadge role="ADMINISTRATOR" />
      </>,
    );
    expect(screen.getByText("Requester")).toHaveClass("zg-badge", "zg-badge--role-requester");
    expect(screen.getByText("IT Staff")).toHaveClass("zg-badge", "zg-badge--role-it-staff");
    expect(screen.getByText("Administrator")).toHaveClass("zg-badge", "zg-badge--role-administrator");
  });

  it("outlines Requester and IT Staff and fills Administrator, with the §1.4 colours", () => {
    const requester = ruleOf(".zg-badge--role-requester");
    expect(requester).toMatch(/background: (#fff|#ffffff|white);/);
    expect(requester).toMatch(/border: 1px solid #5b6b62;/);
    expect(requester).toMatch(/color: #5b6b62;/);

    const staff = ruleOf(".zg-badge--role-it-staff");
    expect(staff).toMatch(/background: (#fff|#ffffff|white);/);
    expect(staff).toMatch(/border: 1px solid #0b7a46;/);
    expect(staff).toMatch(/color: #0b7a46;/);

    const admin = ruleOf(".zg-badge--role-administrator");
    expect(admin).toMatch(/background: #006b3c;/);
    expect(admin).toMatch(/color: (#fff|#ffffff|white);/);
    // The fill is the difference: an outlined pill and a filled one never look alike.
    expect(admin).not.toMatch(/background: (#fff|#ffffff|white);/);
  });

  it("gives Requested Priority and IT Priority of the same value one shared class", () => {
    for (const value of ["LOW", "MEDIUM", "HIGH"] as const) {
      const { container, unmount } = render(
        <>
          <Badge kind="priority" value={value} />
          <Badge kind="priority" value={value} />
        </>,
      );
      const [requested, it] = Array.from(container.querySelectorAll(".zg-badge"));
      expect(requested.className).toBe(it.className);
      expect(requested).toHaveClass(`zg-badge--priority-${value.toLowerCase()}`);
      unmount();
    }
    // No second, IT-only palette exists for a screen to drift to.
    expect(css).not.toMatch(/--(it|requested)-priority/);
  });
});

describe("STYLE-03 the Internal region (ui-spec §1.1, §1.6)", () => {
  it("defines the three --zg-internal-* tokens with the specified values", () => {
    const root = ruleOf(":root");
    expect(root).toMatch(/--zg-internal-bg: #eef1f6;/);
    expect(root).toMatch(/--zg-internal-border: #7c8ba3;/);
    expect(root).toMatch(/--zg-internal-text: #3d4a5c;/);
  });

  it("styles the region only through those tokens: tinted background, 4px dashed left edge", () => {
    const region = ruleOf(".zg-internal-region");
    expect(region).toMatch(/background: var\(--zg-internal-bg\);/);
    expect(region).toMatch(/border-left: 4px dashed var\(--zg-internal-border\);/);
    expect(region).not.toMatch(/#[0-9a-f]{3,6}/);
    expect(ruleOf(".zg-internal-caption")).toMatch(/color: var\(--zg-internal-text\);/);
  });

  it("carries its meaning in text, not only colour", () => {
    render(<InternalRegion>note list</InternalRegion>);
    const caption = screen.getByText("Internal — not visible to the Requester");
    expect(caption).toHaveClass("zg-internal-caption");
    expect(caption.closest(".zg-internal-region")).toHaveTextContent("note list");
  });
});

describe("STYLE-01 status badges for all eight statuses (ui-spec §1.2)", () => {
  const TABLE: [string, string, string, string][] = [
    ["NEW", "zg-badge--status-new", "#eaf6ef", "#0b7a46"],
    ["OPEN", "zg-badge--status-open", "#e3f1f4", "#1e5f6e"],
    ["IN_PROGRESS", "zg-badge--status-in-progress", "#e6eefa", "#23508c"],
    ["WAITING_FOR_REQUESTER", "zg-badge--status-waiting-for-requester", "#f3ecfa", "#5e3a87"],
    ["RESOLVED", "zg-badge--status-resolved", "#dff3e4", "#12612f"],
    ["CLOSED", "zg-badge--status-closed", "#eceeed", "#3f4a44"],
    ["REOPENED", "zg-badge--status-reopened", "#fcefe6", "#9a4a12"],
    ["CANCELLED", "zg-badge--status-cancelled", "#f1f1f1", "#5b5b5b"],
  ];

  it.each(TABLE)("%s has its own class, the value with spaces as its label, and the §1.2 colours", (value, cls, bg, fg) => {
    render(<Badge kind="status" value={value as "NEW"} />);
    const badge = screen.getByText(value.replace(/_/g, " "));
    expect(badge).toHaveClass("zg-badge", cls);
    const rule = ruleOf(`.${cls}`);
    expect(rule).toContain(`background: ${bg};`);
    expect(rule).toContain(`color: ${fg};`);
  });

  it("renders NEW exactly as in Lab 2", () => {
    render(<Badge kind="status" value="NEW" />);
    expect(screen.getByText("NEW").className).toBe("zg-badge zg-badge--status-new");
  });
});

describe("STYLE-04 editable controls vs read-only ticket information (ui-spec §1.7)", () => {
  it("gives read-only fields the read-only class and editable controls the plain field class", () => {
    render(
      <>
        <TextInput aria-label="info" readOnly value="Hardware" onChange={() => {}} />
        <Select aria-label="control" value="A" onChange={() => {}}><option value="A">A</option></Select>
      </>,
    );
    expect(screen.getByLabelText("info")).toHaveClass("zg-field", "zg-field--readonly");
    expect(screen.getByLabelText("control")).toHaveClass("zg-field");
    expect(screen.getByLabelText("control")).not.toHaveClass("zg-field--readonly");
    // The read-only look comes from the shared token, never an ad hoc colour.
    expect(css).toMatch(/\.zg-field--readonly,\s*\.zg-field--readonly:focus-visible\s*\{[^}]*background: var\(--zg-readonly-bg\);/);
  });
});
