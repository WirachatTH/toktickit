import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
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

// ---------------------------------------------------------------------------
// Issue 10 — STYLE-02 and STYLE-06, computed from the stylesheet itself.
// ---------------------------------------------------------------------------

// The stylesheet without comments, so a colour in a comment never counts.
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rootTokens = Object.fromEntries(
  Array.from(cssCode.match(/:root\s*\{([^}]*)\}/)![1].matchAll(/(--zg-[\w-]+):\s*(#[0-9a-fA-F]{3,6})/g), (m) => [m[1], m[2]]),
);

// A colour as written in the CSS — hex, white, or one var(--zg-*) — as 6-digit hex.
function resolveColour(value: string): string {
  let v = value.trim().toLowerCase();
  const token = v.match(/^var\((--zg-[\w-]+)\)$/);
  if (token) {
    expect(rootTokens[token[1]], `${token[1]} is defined in :root`).toBeDefined();
    v = rootTokens[token[1]].toLowerCase();
  }
  if (v === "white") v = "#fff";
  expect(v, `"${value}" is a colour this test can read`).toMatch(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  const hex = v.slice(1);
  return hex.length === 3 ? hex.replace(/./g, "$&$&") : hex;
}

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Background and text colour of one class's own rule.
function pairOf(selector: string): [string, string] {
  const rule = ruleOf(selector);
  const bg = rule.match(/(?:^|[;\s])background(?:-color)?: ([^;]+);/);
  const fg = rule.match(/(?:^|[;\s])color: ([^;]+);/);
  expect(bg, `${selector} sets a background`).not.toBeNull();
  expect(fg, `${selector} sets a text colour`).not.toBeNull();
  return [resolveColour(bg![1]), resolveColour(fg![1])];
}

describe("STYLE-02 every badge and Internal-region pair meets 4.5:1 (ui-spec §1, AC-44)", () => {
  // Every pair ui-spec §1 lists, by name, so a renamed or missing class fails here.
  const REQUIRED = [
    ...["new", "open", "in-progress", "waiting-for-requester", "resolved", "closed", "reopened", "cancelled"].map((s) => `.zg-badge--status-${s}`),
    ...["low", "medium", "high"].map((p) => `.zg-badge--priority-${p}`),
    ...["requester", "it-staff", "administrator"].map((r) => `.zg-badge--role-${r}`),
    ...["resolved", "readonly", "inactive", "you"].map((p) => `.zg-pill--${p}`),
  ];

  it.each(REQUIRED)("%s", (selector) => {
    const [bg, fg] = pairOf(selector);
    expect(contrast(bg, fg), `${selector}: #${fg} on #${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("covers any other badge or pill class too, so a new one can't slip in below 4.5:1", () => {
    const others = Array.from(cssCode.matchAll(/(^|\})\s*(\.zg-(?:badge|pill)--[\w-]+)\s*\{/g), (m) => m[2]).filter((s) => !REQUIRED.includes(s));
    for (const selector of others) {
      const rule = ruleOf(selector);
      if (!/(^|[;\s])color:/.test(rule) || !/(^|[;\s])background(-color)?:/.test(rule)) continue;
      const [bg, fg] = pairOf(selector);
      expect(contrast(bg, fg), `${selector}: #${fg} on #${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the Internal region caption on its background", () => {
    const bg = resolveColour("var(--zg-internal-bg)");
    const fg = resolveColour("var(--zg-internal-text)");
    expect(contrast(bg, fg)).toBeGreaterThanOrEqual(4.5);
  });

  it("matches the ratios ui-spec §1.2 publishes, to two decimals", () => {
    const published: [string, number][] = [
      [".zg-badge--status-new", 4.87], [".zg-badge--status-open", 6.22], [".zg-badge--status-in-progress", 6.92],
      [".zg-badge--status-waiting-for-requester", 7.48], [".zg-badge--status-resolved", 6.51], [".zg-badge--status-closed", 7.92],
      [".zg-badge--status-reopened", 5.54], [".zg-badge--status-cancelled", 6.01],
    ];
    for (const [selector, ratio] of published) expect(contrast(...pairOf(selector)).toFixed(2), selector).toBe(ratio.toFixed(2));
  });
});

describe("STYLE-06 no ad hoc hex colours (ui-spec §12, AC-44)", () => {
  // Hex values belong in the token definitions (:root) and in the badge and pill
  // definitions ui-spec §1 specifies by value. Anywhere else is ad hoc.
  it("the stylesheet uses hex only in :root and the badge and pill classes", () => {
    const offenders: string[] = [];
    for (const m of cssCode.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim().replace(/\s+/g, " ");
      const hex = m[2].match(/#[0-9a-fA-F]{3,8}\b/g);
      if (!hex) continue;
      if (selector === ":root" || /^\.zg-(badge|pill)--[\w-]+$/.test(selector)) continue;
      offenders.push(`${selector} → ${hex.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("no component or screen writes a hex colour inline", () => {
    const root = resolve(process.cwd(), "src");
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => /\.(tsx?|jsx?)$/.test(f));
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.flatMap((f) => {
      const code = readFileSync(resolve(root, f), "utf8");
      return Array.from(code.matchAll(/["'`][^"'`\n]*?(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)\b[^"'`\n]*["'`]/g), (m) => `${f}: ${m[1]}`);
    });
    expect(offenders).toEqual([]);
  });
});
