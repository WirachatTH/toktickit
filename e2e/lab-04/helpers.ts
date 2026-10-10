import { test as base, expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCOUNTS, CAPTURE, DEV_PASSWORD, INITIAL_PASSWORD, ORIGIN, apiAs, bp, createUser } from "../lab-03/helpers.js";

// Shared by the Lab 4 specs (docs/lab-04/tests.md §2.11, §2.12). Everything the
// Lab 3 helpers already do (sign-in, the navigation toggle, overflow and focus
// checks) is imported from there by each spec; this file adds what is new.

export * from "../lab-03/helpers.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LAB4_SCREENSHOTS = path.join(HERE, "../../artifacts/lab-04/screenshots");

// Everything these specs create carries one of these prefixes; each file removes
// its own rows when it ends, and e2e/lab-04/globalTeardown.ts sweeps the rest.
export const E2E4_EMAIL_PREFIX = "e2e4.";
export const E2E4_TICKET_PREFIX = "E2E lab4 ";

const specTag = (info: TestInfo) => path.basename(info.file).replace(/\.spec\.ts$/, "");
export const ticketPrefixFor = (info: TestInfo) => `${E2E4_TICKET_PREFIX}${specTag(info)} `;
export const emailPrefix4For = (info: TestInfo) => `${E2E4_EMAIL_PREFIX}${specTag(info)}.`;
export const runEmail4 = (info: TestInfo, label: string) =>
  `${emailPrefix4For(info)}${Date.now().toString(36)}.${info.project.name}.${label}@kmutt.ac.th`;

// ui-spec §12: artifacts/lab-04/screenshots/<folder>/<breakpoint>-<state>.png,
// written only with CAPTURE_SCREENSHOTS=1 (a normal run leaves the evidence alone).
export async function shot4(page: Page, info: TestInfo, folder: string, state: string): Promise<void> {
  if (!CAPTURE) return;
  const dir = path.join(LAB4_SCREENSHOTS, folder);
  fs.mkdirSync(dir, { recursive: true });
  const modal = (await page.getByRole("dialog").count()) > 0;
  if (!modal) await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(dir, `${bp(info)}-${state}.png`), fullPage: !modal });
}

// ---------------------------------------------------------------- E2E-08
// Every Lab 4 test watches its pages. A console error, an uncaught page error,
// or a same-origin response of 400 or above fails the test, unless the step
// that provokes it said so first with `expected.allow(...)`: a journey that
// tests a stale conflict has to cause a 409, and the browser logs every such
// response as "Failed to load resource". An allowance must be used: one that
// never matches a response fails the test too, so it cannot hide anything.

interface Allowance {
  status: number;
  path: RegExp;
  why: string;
  seen: number;
}

export class Expected {
  private problems: string[] = [];
  private allowances: Allowance[] = [];
  private consoleAllowances: { text: RegExp; why: string; seen: number }[] = [];

  /** Says a step below will get `status` from a request whose path matches. */
  allow(status: number, urlPath: RegExp, why: string): void {
    this.allowances.push({ status, path: urlPath, why, seen: 0 });
  }

  /** Says a step below will itself write `text` with console.error. */
  allowConsole(text: RegExp, why: string): void {
    this.consoleAllowances.push({ text, why, seen: 0 });
  }

  /** Watches one more page (a second browser context, for example). */
  watch(page: Page, label = "page"): void {
    page.on("pageerror", (error) => this.problems.push(`${label}: uncaught ${error.message}`));
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (url.origin !== ORIGIN || response.status() < 400) return;
      const allowed = this.allowances.find((a) => a.status === response.status() && a.path.test(url.pathname));
      if (allowed) allowed.seen += 1;
      else this.problems.push(`${label}: ${response.status()} ${response.request().method()} ${url.pathname}${url.search}`);
    });
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      // The browser's own line for a failed response; the response handler above
      // has already judged that response, allowed or not, with its URL.
      if (/^Failed to load resource: the server responded with a status of \d+/.test(text)) return;
      const allowed = this.consoleAllowances.find((a) => a.text.test(text));
      if (allowed) allowed.seen += 1;
      else this.problems.push(`${label}: console.error ${text}`);
    });
  }

  verify(): void {
    const unused = [
      ...this.allowances.filter((a) => a.seen === 0).map((a) => `allowed ${a.status} ${a.path} (${a.why}) never happened`),
      ...this.consoleAllowances.filter((a) => a.seen === 0).map((a) => `allowed console.error ${a.text} (${a.why}) never happened`),
    ];
    expect([...this.problems, ...unused], "no console error, page error, or failed same-origin request (E2E-08)").toEqual([]);
  }
}

export const test = base.extend<{ expected: Expected }>({
  expected: [
    async ({ page }, use) => {
      const expected = new Expected();
      expected.watch(page);
      await use(expected);
      expected.verify();
    },
    { auto: true },
  ],
});
export { expect };

// ---------------------------------------------------------------- API set-up

export async function me(api: APIRequestContext): Promise<{ id: number; name: string; email: string }> {
  return (await (await api.get("/api/auth/me")).json()).user;
}

/** A ticket created through the API as the signed-in Requester. */
export async function createTicket(requester: APIRequestContext, summary: string): Promise<{ id: number; ticketNumber: string }> {
  const [categories, systems] = await Promise.all([requester.get("/api/categories"), requester.get("/api/systems")]);
  const res = await requester.post("/api/tickets", {
    multipart: {
      categoryId: String((await categories.json())[0].id),
      relatedSystemId: String((await systems.json())[0].id),
      summary,
      description: "Created by the Lab 4 end-to-end suite; removed when the spec ends.",
      requestedPriority: "MEDIUM",
    },
  });
  expect(res.status(), `create ticket "${summary}": ${await res.text()}`).toBe(201);
  return res.json();
}

/** Claims the ticket for the signed-in IT Staff member and moves it to In Progress. */
export async function claimAndStart(staff: APIRequestContext, ticketId: number): Promise<number> {
  const self = await me(staff);
  const claim = await staff.patch(`/api/staff/tickets/${ticketId}/owner`, { data: { ownerId: self.id, expectedOwnerId: null, expectedStatus: "NEW" } });
  expect(claim.status(), `claim: ${await claim.text()}`).toBe(200);
  const start = await staff.patch(`/api/staff/tickets/${ticketId}/status`, { data: { status: "IN_PROGRESS", expectedStatus: "OPEN", expectedOwnerId: self.id } });
  expect(start.status(), `start: ${await start.text()}`).toBe(200);
  return self.id;
}

export async function addAction(
  staff: APIRequestContext,
  ticketId: number,
  action: { status: "PLANNED" | "COMPLETED"; description: string; assigneeId: number; result?: string; hoursFromNow?: number; followUpRequired?: boolean; followUpNote?: string },
): Promise<{ id: number; version: number }> {
  const { hoursFromNow = action.status === "PLANNED" ? 24 : 0, ...rest } = action;
  const res = await staff.post(`/api/tickets/${ticketId}/actions-taken`, {
    data: { ...rest, actionAt: new Date(Date.now() + hoursFromNow * 3_600_000).toISOString() },
  });
  expect(res.status(), `add action "${action.description}": ${await res.text()}`).toBe(201);
  return res.json();
}

/** A new, active account that has already replaced its initial password. */
export async function createReadyUser(
  info: TestInfo,
  label: string,
  role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR",
  name: string,
): Promise<{ id: number; email: string; name: string; password: string }> {
  const admin = await apiAs(ACCOUNTS.admin.email);
  const user = await createUser(admin, { name, email: runEmail4(info, label), role });
  await admin.dispose();
  const own = await apiAs(user.email, INITIAL_PASSWORD);
  const changed = await own.post("/api/auth/change-password", { data: { currentPassword: INITIAL_PASSWORD, newPassword: DEV_PASSWORD } });
  expect(changed.status(), `first password change: ${await changed.text()}`).toBe(200);
  await own.dispose();
  return { ...user, password: DEV_PASSWORD };
}

// ---------------------------------------------------------------- Layout checks

/** How many columns a grid's children sit in: the number of distinct left edges. */
export async function columnsOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().left))).size);
}

/** No element under `root` is wider than it can show (clipped text), except those meant to truncate. */
export async function expectNothingClipped(page: Page, rootSelector: string, where: string): Promise<void> {
  const clipped = await page.locator(rootSelector).first().evaluate((root) => {
    const out: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("*")) {
      if (el.offsetParent === null) continue;
      const style = getComputedStyle(el);
      if (style.textOverflow === "ellipsis" || el.classList.contains("zg-visually-hidden")) continue;
      if (style.overflowX === "visible") continue;
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.tagName.toLowerCase()}.${el.className} (${el.scrollWidth} > ${el.clientWidth})`);
    }
    return out;
  });
  expect(clipped, `${where}: nothing is clipped`).toEqual([]);
}
