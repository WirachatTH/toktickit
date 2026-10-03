import { expect, request, type APIRequestContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Shared by the Lab 3 specs (docs/lab-03/tests.md §2.12, §2.13). Every spec runs
// once per project in playwright.config.ts — desktop 1280, tablet 834, mobile
// 375 — so one test body covers all three breakpoints.

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCREENSHOTS = path.join(HERE, "../../artifacts/lab-03/screenshots");
export const FIXTURE_FILE = path.join(HERE, "../lab-02/fixtures/sample.png");

// The page's own origin: the Vite dev server Playwright starts proxies /api to
// the server (D-11), and the server only accepts writes from a known Origin.
export const ORIGIN = "http://localhost:5174";

// The documented local-development accounts (README "Local development accounts").
export const DEV_PASSWORD = "TokTickIT-dev-2026";
export const ACCOUNTS = {
  requester: { email: "somchai.prasert@kmutt.ac.th", name: "Somchai Prasert" },
  staff: { email: "chanon.rattanakorn@kmutt.ac.th", name: "Chanon Rattanakorn" },
  admin: { email: "siriporn.boonmee@kmutt.ac.th", name: "Siriporn Boonmee" },
  secondAdmin: { email: "krit.wattana@kmutt.ac.th", name: "Krit Wattana" },
} as const;

// Everything these specs create carries one of these prefixes, and
// e2e/globalTeardown.ts removes exactly those rows after the run, so the
// shared development database is left as it was.
export const E2E_EMAIL_PREFIX = "e2e3.";
export const E2E_TICKET_PREFIX = "E2E lab3 ";

// A per-run, per-project email: repeated runs never share an account, so the
// in-memory sign-in throttle (keyed by email, D-12) never carries over.
export function runEmail(info: TestInfo, label: string): string {
  return `${E2E_EMAIL_PREFIX}${Date.now().toString(36)}.${info.project.name}.${label}@kmutt.ac.th`;
}

export const bp = (info: TestInfo) => info.project.name as "desktop" | "tablet" | "mobile";

// ui-spec §13: artifacts/lab-03/screenshots/<folder>/<breakpoint>-<state>.png
export async function shot(page: Page, info: TestInfo, folder: string, state: string): Promise<void> {
  const dir = path.join(SCREENSHOTS, folder);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${bp(info)}-${state}.png`), fullPage: true });
}

export async function signIn(page: Page, email: string, password = DEV_PASSWORD): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for the sign-in to finish: navigating away mid-request would cancel it.
  await expect(page).not.toHaveURL(/\/login$/);
}

// Below 768px the shell's links and account block sit behind the Menu toggle
// (ui-spec §2). Opens it when it is there and closed; a no-op elsewhere.
export async function openNav(page: Page): Promise<void> {
  await expect(page.getByRole("navigation", { name: "Primary", includeHidden: true })).toBeAttached();
  const toggle = page.getByRole("button", { name: "Toggle navigation menu" });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

export async function logOut(page: Page): Promise<void> {
  await openNav(page);
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

// "No horizontal page scroll" (ui-spec §11).
export async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, `${where}: the page is wider than the viewport`).toBeLessThanOrEqual(client);
}

// "Touch targets ≥44px on mobile" (ui-spec §11).
export async function expectTouchTargets(targets: Locator[], where: string): Promise<void> {
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box, `${where}: ${target} is on screen`).not.toBeNull();
    expect(box!.height, `${where}: ${target} is at least 44px tall`).toBeGreaterThanOrEqual(44);
  }
}

// An API client signed in as one account, for setting up data the UI step
// under test doesn't own (the tests.md rows say which steps are API set-up).
export async function apiAs(email: string, password = DEV_PASSWORD): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: ORIGIN, extraHTTPHeaders: { Origin: ORIGIN } });
  const res = await api.post("/api/auth/login", { data: { email, password } });
  expect(res.status(), `API sign-in as ${email}`).toBe(200);
  return api;
}

export const INITIAL_PASSWORD = "E2E-initial-2026";

export async function createUser(
  admin: APIRequestContext,
  user: { name: string; email: string; role?: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR"; isActive?: boolean },
): Promise<{ id: number; email: string; name: string }> {
  const res = await admin.post("/api/admin/users", {
    data: { role: "REQUESTER", isActive: true, initialPassword: INITIAL_PASSWORD, ...user },
  });
  expect(res.status(), `create ${user.email}: ${await res.text()}`).toBe(201);
  return res.json();
}

// The element that has focus, described well enough to assert an order.
export async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "body";
    const label = el.getAttribute("aria-label") || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) || el.textContent || "";
    return `${el.tagName.toLowerCase()}:${label.replace(/\*/g, "").trim()}`;
  });
}

// "Focus always visible": the focused element draws an outline or a ring.
export async function expectFocusVisible(page: Page, where: string): Promise<void> {
  const style = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0, ring: s.boxShadow !== "none" };
  });
  expect(style.outline || style.ring, `${where}: ${await focused(page)} shows a focus indicator`).toBe(true);
}
