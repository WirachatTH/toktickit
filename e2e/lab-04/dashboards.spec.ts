import type { Page, TestInfo } from "@playwright/test";
import {
  ACCOUNTS,
  Expected,
  addAction,
  apiAs,
  bp,
  claimAndStart,
  columnsOf,
  createReadyUser,
  createTicket,
  emailPrefix4For,
  expect,
  expectNoHorizontalOverflow,
  expectNothingClipped,
  expectTouchTargets,
  logOut,
  openNav,
  shot4,
  signIn,
  test,
  ticketPrefixFor,
} from "./helpers.js";
import { removeE2EData } from "../lab-03/cleanup.js";

// Lab 4, Issue 8 — each role's Dashboard: layout at the three widths, every
// drill-down, and counts that move by exactly what was created
// (docs/lab-04/tests.md E2E-06 to E2E-09, RESP-01).
// Screenshots: artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard}/.

// These journeys are long: several sign-ins and many steps in one test.
test.describe.configure({ timeout: 150_000 });

test.afterAll(async ({}, info) => {
  // Tickets first: a user who still owns or requested one cannot be removed.
  await removeE2EData({ ticketPrefix: ticketPrefixFor(info), emailPrefix: emailPrefix4For(info) });
});

const card = (page: Page, label: string) => page.getByRole("group", { name: label, exact: true });
const valueOf = async (page: Page, label: string) => Number(await card(page, label).locator(".zg-metric-card__value").innerText());
const stripValue = async (page: Page, list: string, label: string) =>
  Number((await page.getByRole("list", { name: list }).getByRole("link", { name: new RegExp(`^${label}: \\d+ tickets?$`) }).getAttribute("aria-label"))!.match(/: (\d+) /)![1]);

async function openDashboard(page: Page, email: string, password?: string) {
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator(".zg-metric-card").first()).toBeVisible();
}

// RESP-01: 4 columns of cards at desktop, 2 at tablet, 1 on mobile; nothing wider than the screen.
async function expectDashboardLayout(page: Page, info: TestInfo, where: string) {
  expect(await columnsOf(page, ".zg-dashboard-cards > .zg-metric-card"), `${where}: card columns`).toBe({ desktop: 4, tablet: 2, mobile: 1 }[bp(info)]);
  await expectNoHorizontalOverflow(page, where);
  await expectNothingClipped(page, ".zg-dashboard", where);
  // The lists sit beside Quick actions at desktop and above it otherwise (ui-spec §10).
  const main = (await page.locator(".zg-dashboard-main").boundingBox())!;
  const side = (await page.locator(".zg-dashboard-side").boundingBox())!;
  if (bp(info) === "desktop") expect(side.x, `${where}: Quick actions beside the lists`).toBeGreaterThanOrEqual(main.x + main.width - 1);
  else expect(side.y, `${where}: Quick actions below the lists`).toBeGreaterThanOrEqual(main.y + main.height - 1);
  if (bp(info) === "mobile") {
    await expectTouchTargets(await page.locator(".zg-count-strip__link").all(), `${where}: count-strip links`);
    await expectTouchTargets(await page.locator(".zg-metric-card a").all(), `${where}: card links`);
    await expectTouchTargets(await page.locator(".zg-dashboard-row").all(), `${where}: list rows`);
  }
}

// What a drill-down link should list, asked of the same API the list screen uses.
async function listedCount(page: Page, href: string): Promise<number> {
  const [route, query = ""] = href.split("?");
  if (route === "/admin/users") return ((await (await page.request.get(`/api/admin/users?${query}`)).json()).data as unknown[]).length;
  const api = route === "/staff/queue" ? "/api/staff/tickets" : "/api/tickets";
  return (await (await page.request.get(`${api}?${query}&pageSize=1`)).json()).pagination.totalItems;
}

/** Follows one drill-down link, checks where it lands and what it lists, and comes back. */
async function follow(page: Page, link: ReturnType<Page["getByRole"]>, value: number, exact: boolean) {
  const href = (await link.getAttribute("href"))!;
  const name = (await link.getAttribute("aria-label")) ?? (await link.innerText());
  await link.click();
  await expect(page, `${name} opens ${href}`).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  await expect(page.locator("main h1, main h2").first()).toBeVisible();
  const listed = await listedCount(page, href);
  if (exact) expect(listed, `${name}: the list holds exactly what the card counted`).toBe(value);
  else expect(listed, `${name}: the list holds at least what the card counted (a superset, BR-38)`).toBeGreaterThanOrEqual(value);
  await page.goBack();
  await expect(page, `Back from ${name}`).toHaveURL(/\/dashboard(#[\w-]+)?$/);
  await expect(page.locator(".zg-metric-card").first()).toBeVisible();
}

test.describe("dashboards", () => {
  // First, while the data is only the seed's (the later tests add tickets).
  test("RESP-01 each role's Dashboard at each width, with its loading and failure states", async ({ page, expected }, info) => {
    // --- IT Staff
    await openDashboard(page, ACCOUNTS.staff.email);
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back, Chanon" })).toBeVisible();
    await expect(page.getByText(/^Updated \d{2}:\d{2} \(Bangkok time\)$/)).toBeVisible();
    await expect(page.locator(".zg-dashboard-cards > .zg-metric-card")).toHaveCount(6);
    // Dashboard is the first destination and is marked as the current page.
    await openNav(page);
    const links = page.getByRole("navigation", { name: "Primary" }).getByRole("link");
    await expect(links.first()).toHaveText("Dashboard");
    await expect(links.first()).toHaveAttribute("aria-current", "page");
    if (bp(info) === "mobile") await page.getByRole("button", { name: "Toggle navigation menu" }).click();
    await expectDashboardLayout(page, info, "IT Staff Dashboard");
    await shot4(page, info, "staff-dashboard", "staff-default");

    // A drill-down target, as it opens from the "Unassigned" card.
    await card(page, "Unassigned").getByRole("link").click();
    await expect(page).toHaveURL(/\/staff\/queue\?owner=unassigned$/);
    await expect(page.getByTestId(bp(info) === "mobile" ? "queue-cards" : "queue-table")).toBeVisible();
    await expect(page.locator(bp(info) === "mobile" ? "#queue-mobile-owner" : "#queue-owner")).toBeVisible();
    await expect(page.locator(bp(info) === "mobile" ? "#queue-mobile-owner" : "#queue-owner")).toHaveValue("unassigned");
    await expectNoHorizontalOverflow(page, "the queue from a drill-down");
    await shot4(page, info, "staff-dashboard", "staff-drilldown-queue");

    // Loading: the placeholder while the numbers are on their way.
    await page.route("**/api/dashboard/staff", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    await page.goto("/dashboard");
    const loading = page.getByRole("status", { name: "Loading dashboard" });
    await expect(loading).toBeVisible();
    await expect(loading.locator(".zg-metric-card--skeleton")).toHaveCount(6);
    await expectNoHorizontalOverflow(page, "the loading placeholder");
    await shot4(page, info, "staff-dashboard", "staff-loading");
    await expect(card(page, "Unassigned")).toBeVisible();
    await page.unroute("**/api/dashboard/staff");

    // Failure: a safe message and Retry; no number from an earlier load stays on screen.
    expected.allow(500, /^\/api\/dashboard\/staff$/, "the failure this step shows");
    await page.route("**/api/dashboard/staff", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }) }),
    );
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("We couldn't load your dashboard.")).toBeVisible();
    await expect(page.locator(".zg-metric-card")).toHaveCount(0);
    await expect(page.getByText(/^Updated /)).toHaveCount(0);
    await expectNoHorizontalOverflow(page, "the failure state");
    await shot4(page, info, "staff-dashboard", "staff-failure");
    await page.unroute("**/api/dashboard/staff");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(card(page, "Unassigned")).toBeVisible();
    await logOut(page);

    // --- Administrator: the same ticket metrics, read-only, plus the user counts.
    await openDashboard(page, ACCOUNTS.admin.email);
    await expect(page.getByText("Ticket metrics are read-only for Administrators")).toBeVisible();
    const accounts = page.getByRole("region", { name: "User accounts" });
    await expect(accounts.getByRole("link", { name: /^View / })).toHaveCount(4);
    await expectDashboardLayout(page, info, "Administrator Dashboard");
    await shot4(page, info, "staff-dashboard", "admin-default");
    await accounts.getByRole("link", { name: /^View Inactive/ }).click();
    await expect(page).toHaveURL(/\/admin\/users\?status=inactive$/);
    await expect(page.getByText("Inactive only")).toBeVisible();
    await expectNoHorizontalOverflow(page, "User Management from a drill-down");
    if (bp(info) === "mobile") await expectTouchTargets([page.getByRole("button", { name: "Remove the Inactive only filter" })], "the filter chip");
    await shot4(page, info, "staff-dashboard", "admin-users-drilldown");
    await logOut(page);

    // An Administrator who owns nothing: the "my" metrics are 0, with their sentences.
    // The last Administrator logged out from a filtered User Management; the next
    // one to sign in still starts on their own Dashboard (openDashboard checks it).
    await openDashboard(page, ACCOUNTS.secondAdmin.email);
    expect(await valueOf(page, "My tickets")).toBe(0);
    expect(await valueOf(page, "My planned actions")).toBe(0);
    await expect(page.getByText("No planned actions assigned to you.")).toBeVisible();
    await expectDashboardLayout(page, info, "Administrator Dashboard, nothing of their own");
    await shot4(page, info, "staff-dashboard", "admin-zero-mine");
    await logOut(page);

    // --- Requester: their own four cards, and never IT Priority.
    await openDashboard(page, ACCOUNTS.requester.email);
    await expect(page.getByRole("heading", { level: 1, name: "Welcome, Somchai" })).toBeVisible();
    await expect(page.locator(".zg-dashboard-cards > .zg-metric-card")).toHaveCount(4);
    await expect(page.getByText(/IT Priority/)).toHaveCount(0);
    await expectDashboardLayout(page, info, "Requester Dashboard");
    await shot4(page, info, "requester-dashboard", "requester-default");
    await card(page, "Open requests").getByRole("link").click();
    await expect(page).toHaveURL(/\/tickets\?status=UNRESOLVED$/);
    // The filter is on show at every width: on mobile the Filters panel is already open.
    await expect(page.locator(bp(info) === "mobile" ? "#mt-mobile-status" : "#mt-status")).toBeVisible();
    await expect(page.locator(bp(info) === "mobile" ? "#mt-mobile-status" : "#mt-status")).toHaveValue("UNRESOLVED");
    await expectNoHorizontalOverflow(page, "My Tickets from a drill-down");
    await shot4(page, info, "requester-dashboard", "requester-drilldown-my-tickets");

    expected.allow(500, /^\/api\/dashboard\/requester$/, "the failure this step shows");
    await page.route("**/api/dashboard/requester", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }) }),
    );
    await page.goto("/dashboard");
    await expect(page.getByText("We couldn't load your dashboard.")).toBeVisible();
    await expectNoHorizontalOverflow(page, "the Requester failure state");
    await shot4(page, info, "requester-dashboard", "requester-failure");
    await page.unroute("**/api/dashboard/requester");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(card(page, "Open requests")).toBeVisible();
  });

  test("E2E-06 each role lands on its Dashboard, and every card, count, and user link opens the list it counted; Back returns", async ({ page }) => {
    // --- IT Staff: six cards, eight statuses, three priorities.
    await openDashboard(page, ACCOUNTS.staff.email);
    for (const label of ["Unassigned", "My tickets", "Requester says resolved", "Created today", "Resolved today"]) {
      await follow(page, card(page, label).getByRole("link"), await valueOf(page, label), !/today$/.test(label));
    }
    // "My planned actions" stays on the Dashboard and jumps to its list.
    await card(page, "My planned actions").getByRole("link").click();
    await expect(page).toHaveURL(/\/dashboard#my-planned-actions$/);
    await expect(page.getByRole("region", { name: "My planned actions" })).toBeFocused();
    for (const list of ["By status", "Unresolved by IT Priority"]) {
      const count = list === "By status" ? 8 : 3;
      await expect(page.getByRole("list", { name: list }).getByRole("link"), list).toHaveCount(count);
      for (let i = 0; i < count; i++) {
        const link = page.getByRole("list", { name: list }).getByRole("link").nth(i);
        const value = Number((await link.getAttribute("aria-label"))!.match(/: (\d+) tickets?$/)![1]);
        await follow(page, link, value, true);
      }
    }
    // A row opens its ticket; a planned action opens its ticket at that action.
    const planned = page.getByRole("region", { name: "My planned actions" }).getByRole("link").first();
    const plannedHref = (await planned.getAttribute("href"))!;
    expect(plannedHref).toMatch(/^\/staff\/tickets\/\d+#action-\d+$/);
    await planned.click();
    await expect(page.locator(plannedHref.slice(plannedHref.indexOf("#")))).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/);
    await logOut(page);

    // --- Administrator: the user counts open User Management filtered by role and activation.
    await openDashboard(page, ACCOUNTS.admin.email);
    const accounts = page.getByRole("region", { name: "User accounts" });
    await expect(accounts.getByRole("link", { name: /^View / })).toHaveCount(4);
    const userLinks = 4;
    for (let i = 0; i < userLinks; i++) {
      const link = accounts.getByRole("link", { name: /^View / }).nth(i);
      const value = Number((await link.getAttribute("aria-label"))!.match(/\((\d+)\)$/)![1]);
      await follow(page, link, value, true);
    }
    await follow(page, card(page, "Unassigned").getByRole("link"), await valueOf(page, "Unassigned"), true);
    await logOut(page);

    // --- Requester: four cards, each opening My Tickets with its status.
    await openDashboard(page, ACCOUNTS.requester.email);
    for (const label of ["Open requests", "Waiting for you", "Resolved", "Closed"]) {
      await follow(page, card(page, label).getByRole("link"), await valueOf(page, label), true);
    }
    const row = page.getByRole("region", { name: "Recently updated" }).getByRole("link", { name: /^TCK-/ }).first();
    await row.click();
    await expect(page).toHaveURL(/\/tickets\/\d+$/);
  });

  test("E2E-07 the counts move by exactly what was created, and another Requester's Dashboard stays at zero", async ({ page }, info) => {
    const author = await createReadyUser(info, "author", "REQUESTER", "E2E Lab4 Author");
    const bystander = await createReadyUser(info, "bystander", "REQUESTER", "E2E Lab4 Bystander");

    // A brand-new Requester: every card 0, and an invitation to create a first ticket.
    await openDashboard(page, bystander.email, bystander.password);
    for (const label of ["Open requests", "Waiting for you", "Resolved", "Closed"]) expect(await valueOf(page, label), label).toBe(0);
    await expect(page.getByRole("region", { name: "Getting started" }).getByRole("link", { name: "Create Ticket" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "a brand-new Requester's Dashboard");
    await shot4(page, info, "requester-dashboard", "requester-empty");
    await logOut(page);

    // --- IT Staff: read the numbers, create known data, read them again.
    await openDashboard(page, ACCOUNTS.staff.email);
    const before = {
      unassigned: await valueOf(page, "Unassigned"),
      mine: await valueOf(page, "My tickets"),
      planned: await valueOf(page, "My planned actions"),
      createdToday: await valueOf(page, "Created today"),
      newTickets: await stripValue(page, "By status", "New"),
      inProgress: await stripValue(page, "By status", "In progress"),
    };

    const authorApi = await apiAs(author.email, author.password);
    const tickets = [];
    for (const n of [1, 2, 3]) tickets.push(await createTicket(authorApi, `${ticketPrefixFor(info)}${bp(info)} counted ${n}`));
    await authorApi.dispose();
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByRole("status", { name: "Dashboard updates" })).toHaveText("Dashboard updated");
    expect(await valueOf(page, "Unassigned"), "three unclaimed tickets").toBe(before.unassigned + 3);
    expect(await valueOf(page, "Created today")).toBe(before.createdToday + 3);
    expect(await stripValue(page, "By status", "New")).toBe(before.newTickets + 3);
    expect(await valueOf(page, "My tickets"), "none of them is mine yet").toBe(before.mine);

    // Claim one, start it, and plan two actions on it for myself.
    const staff = await apiAs(ACCOUNTS.staff.email);
    const staffId = await claimAndStart(staff, tickets[0].id);
    await addAction(staff, tickets[0].id, { status: "PLANNED", description: "E2E counted action one.", assigneeId: staffId, hoursFromNow: 1 });
    await addAction(staff, tickets[0].id, { status: "PLANNED", description: "E2E counted action two.", assigneeId: staffId, hoursFromNow: 2 });
    await staff.dispose();
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect.poll(() => valueOf(page, "My tickets")).toBe(before.mine + 1);
    expect(await valueOf(page, "Unassigned")).toBe(before.unassigned + 2);
    expect(await valueOf(page, "My planned actions")).toBe(before.planned + 2);
    expect(await stripValue(page, "By status", "New")).toBe(before.newTickets + 2);
    expect(await stripValue(page, "By status", "In progress")).toBe(before.inProgress + 1);
    expect(await valueOf(page, "Created today"), "claiming creates nothing").toBe(before.createdToday + 3);
    await logOut(page);

    // --- The author sees their three; the bystander still sees none.
    await openDashboard(page, author.email, author.password);
    expect(await valueOf(page, "Open requests")).toBe(3);
    expect(await valueOf(page, "Waiting for you")).toBe(0);
    await expect(page.getByRole("region", { name: "Getting started" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Recently updated" }).getByRole("link", { name: /^TCK-/ })).toHaveCount(3);
    await logOut(page);
    await openDashboard(page, bystander.email, bystander.password);
    for (const label of ["Open requests", "Waiting for you", "Resolved", "Closed"]) expect(await valueOf(page, label), `bystander ${label}`).toBe(0);
    await expect(page.getByRole("region", { name: "Getting started" })).toBeVisible();
  });

  // E2E-08 is the watch every Lab 4 test runs under (helpers.ts). This proves the
  // watch can fail: an unexpected error is reported, and so is an unused allowance.
  test("E2E-08 the console and request watch reports an unexpected failure, and an allowance nothing used", async ({ page, expected }) => {
    // This test's own watch is told about the two failures the probe below provokes.
    expected.allow(404, /^\/api\/no-such-route$/, "provoked to test the watch");
    expected.allowConsole(/^a deliberate console error$/, "provoked to test the watch");
    await openDashboard(page, ACCOUNTS.staff.email);
    const probe = new Expected();
    probe.watch(page, "probe");
    probe.allow(409, /^\/api\/never$/, "nothing causes this");
    await page.evaluate(async () => {
      await fetch("/api/no-such-route", { credentials: "include" });
      console.error("a deliberate console error");
    });
    await expect.poll(() => { try { probe.verify(); return "clean"; } catch (error) { return String((error as Error).message); } }).toContain("404 GET /api/no-such-route");
    let message = "";
    try { probe.verify(); } catch (error) { message = (error as Error).message; }
    expect(message).toContain("console.error a deliberate console error");
    expect(message).toContain("never happened");
  });
});
