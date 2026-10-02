import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { Badge, RoleBadge } from "../../src/components/Badge.js";
import { InternalRegion } from "../../src/components/DiscussionPanel.js";

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
