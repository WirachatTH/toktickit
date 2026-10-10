import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import * as api from "../../src/api.js";
import { ActionStatusBadge, FollowUpPill } from "../../src/components/Badge.js";
import { ActionsTaken } from "../../src/components/ActionsTaken.js";

// STYLE-01 and STYLE-03 — the Lab 4 badges, pills, and the Actions Taken
// caption (docs/lab-04/ui-spec.md §1.1 to §1.3, §4.1). Colours are read from the
// CSS itself and their contrast computed, not copied from the spec.

const css = readFileSync(resolve(process.cwd(), "src/styles/zen-green.css"), "utf8");

function ruleOf(selector: string): string {
  const match = css.match(new RegExp(`${selector.replace(/[.-]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} has a rule`).not.toBeNull();
  return match![1].toLowerCase().replace(/\s+/g, " ");
}

// A declaration's value, with var(--token) resolved through :root.
function declared(selector: string, property: string): string {
  const value = ruleOf(selector).match(new RegExp(`(?:^|;|\\s)${property}:\\s*([^;]+);`))?.[1].trim();
  expect(value, `${selector} sets ${property}`).toBeTruthy();
  const token = value!.match(/^var\((--[a-z0-9-]+)\)$/)?.[1];
  if (!token) return value!;
  const resolved = ruleOf(":root").match(new RegExp(`${token}:\\s*([^;]+);`))?.[1].trim();
  expect(resolved, `${token} is defined in :root`).toBeTruthy();
  return resolved!;
}

function luminance(hex: string): number {
  const full = hex.replace("#", "");
  const value = full.length === 3 ? full.split("").map((c) => c + c).join("") : full;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const WHITE = ["#fff", "#ffffff", "white"];
const asHex = (v: string) => (WHITE.includes(v) ? "#ffffff" : v);
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(asHex(a)), luminance(asHex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("STYLE-01 action status badges and follow-up pills (ui-spec §1.1, §1.2)", () => {
  const PAIRS: [string, string, string][] = [
    [".zg-badge--action-planned", "#fff4dc", "#7a4a00"],
    [".zg-badge--action-completed", "#e8f5ec", "#0e5a2c"],
    [".zg-badge--action-cancelled", "#f1f1f1", "#5b5b5b"],
    [".zg-pill--followup-needed", "#fdedea", "#8c2a14"],
  ];

  it("uses the specified colours, each at least 4.5:1", () => {
    for (const [selector, bg, fg] of PAIRS) {
      const background = declared(selector, "background");
      const color = declared(selector, "color");
      expect([background, color], selector).toEqual([bg, fg]);
      expect(contrast(background, color), selector).toBeGreaterThanOrEqual(4.5);
    }
    const handled = ruleOf(".zg-pill--followup-handled");
    expect(handled).toMatch(/background: (#fff|#ffffff|white);/);
    expect(handled).toMatch(/border: 1px solid #0b7a46;/);
    expect(handled).toMatch(/color: #0b7a46;/);
    expect(contrast("#ffffff", "#0b7a46")).toBeGreaterThanOrEqual(4.5);
  });

  it("labels every state in words, never colour alone", () => {
    render(
      <>
        <ActionStatusBadge status="PLANNED" />
        <ActionStatusBadge status="COMPLETED" />
        <ActionStatusBadge status="CANCELLED" />
        <FollowUpPill handled={false} />
        <FollowUpPill handled />
      </>,
    );
    expect(screen.getByText("Planned")).toHaveClass("zg-badge", "zg-badge--action-planned");
    expect(screen.getByText("Completed")).toHaveClass("zg-badge", "zg-badge--action-completed");
    expect(screen.getByText("Cancelled")).toHaveClass("zg-badge", "zg-badge--action-cancelled");
    expect(screen.getByText("Follow-up needed")).toHaveClass("zg-pill", "zg-pill--followup-needed");
    expect(screen.getByText("Follow-up handled")).toHaveClass("zg-pill", "zg-pill--followup-handled");
    // An action's status never borrows a ticket status's words.
    expect(screen.queryByText(/^(Resolved|Closed|Open)$/)).not.toBeInTheDocument();
  });
});

describe("STYLE-03 Actions Taken are shared, not internal (BR-19, D-09)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "fetchActionsTaken").mockResolvedValue([]);
  });

  it("captions the area as visible to the Requester and never uses the Internal region", async () => {
    const { container } = render(
      <ActionsTaken ticketId={42} mode="staff" canWrite ticketStatus="IN_PROGRESS" people={[]} currentUserId={8} onChanged={() => undefined} />,
    );
    expect(await screen.findByText("Visible to the Requester")).toBeInTheDocument();
    expect(container.querySelector(".zg-internal-region, [class*='zg-internal']")).toBeNull();
  });
});

describe("STYLE-02 the Lab 4 styles use the Zen Green tokens (ui-spec §1, §11)", () => {
  it("writes a hex colour only in :root and the badge and pill classes, as Lab 3 STYLE-06 requires", () => {
    const lab4 = css.slice(css.indexOf("Lab 4, Issue 3"));
    expect(lab4.length).toBeGreaterThan(100);
    const offenders: string[] = [];
    for (const m of lab4.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
      if (/^:root$|\.zg-badge--|\.zg-pill--/.test(selector)) continue;
      const hex = m[2].match(/#[0-9a-fA-F]{3,8}\b/g);
      if (hex) offenders.push(`${selector} -> ${hex.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("styles the metric card and count strip with tokens (ui-spec §1.3, §1.4)", () => {
    expect(declared(".zg-metric-card__value", "color")).toBe("#006b3c");
    expect(ruleOf(".zg-metric-card__value")).toMatch(/color: var\(--zg-metric-value\)/);
    expect(ruleOf(":root")).toMatch(/--zg-metric-value: #006b3c;/);
    expect(ruleOf(".zg-metric-card")).toMatch(/background: var\(--zg-surface\)/);
    expect(ruleOf(".zg-metric-card")).toMatch(/border: 1px solid var\(--zg-border\)/);
    expect(contrast("#ffffff", "#006b3c")).toBeGreaterThanOrEqual(4.5);
    expect(ruleOf(".zg-count-strip")).toMatch(/flex-wrap: wrap/);
  });

  it("lays the dashboard cards out in 1, 2, then 4 columns (ui-spec §10)", () => {
    expect(ruleOf(".zg-dashboard-cards")).toMatch(/grid-template-columns: 1fr/);
    const at = (min: number) => css.match(new RegExp(String.raw`@media \(min-width: ${min}px\) \{ \.zg-dashboard-cards \{ grid-template-columns: repeat\((\d), minmax\(0, 1fr\)\); \} \}`))?.[1];
    expect(at(768)).toBe("2");
    expect(at(992)).toBe("4");
  });

  // Issue 8 (visual checklist): Bootstrap's defaults for these are blue.
  it("themes checkboxes, radios, and the date field's focus ring with tokens (ui-spec §11)", () => {
    expect(ruleOf(".form-check-input:checked")).toMatch(/background-color: var\(--zg-primary\)/);
    expect(ruleOf(".form-check-input:checked")).toMatch(/border-color: var\(--zg-primary\)/);
    expect(ruleOf(".form-check-input:focus")).toMatch(/box-shadow: none/);
    expect(ruleOf(".form-check-input:focus-visible")).toMatch(/outline: 2px solid var\(--zg-secondary\)/);
    expect(css).toMatch(/\.zg-field:focus-visible,[^{]*\.zg-field\[type="datetime-local"\]:focus-within \{\s*outline: 2px solid var\(--zg-secondary\)/);
  });

  it("keeps the count-strip links at a 44px touch target (ui-spec §9)", () => {
    expect(ruleOf(".zg-count-strip__link")).toMatch(/min-height: 44px/);
    expect(ruleOf(".zg-count-strip__link")).toMatch(/display: inline-flex/);
  });

  it("gives the filter chip's remove button a 44px touch target on mobile (ui-spec §9)", () => {
    // Inside a mobile media block: nothing between the block's start and the rule opens another one.
    const rule = css.match(/@media \(max-width: 767\.98px\) \{[^@]*?\.zg-filter-chip__remove\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/min-width: 44px/);
    expect(rule).toMatch(/min-height: 44px/);
  });
});
