import { test, expect, type Page, type TestInfo } from "@playwright/test";
import {
  ACCOUNTS,
  ORIGIN,
  apiAs,
  bp,
  createUser,
  expectFocusVisible,
  expectNoHorizontalOverflow,
  expectTableFits,
  focused,
  runEmail,
  shot,
  signIn,
} from "./helpers.js";

// Lab 3, Issue 10 — User Management end to end (docs/lab-03/tests.md E2E-09 to
// E2E-11, RESP-03) and the keyboard-only pass (RESP-06). Screenshots:
// artifacts/lab-03/screenshots/user-management/.

const isMobile = (info: TestInfo) => bp(info) === "mobile";
const list = (page: Page, info: TestInfo) => page.getByTestId(isMobile(info) ? "users-cards" : "users-table");

// RESP-03: table at desktop and tablet, cards on mobile; no page overflow.
async function expectListLayout(page: Page, info: TestInfo) {
  if (isMobile(info)) {
    await expect(page.getByTestId("users-cards")).toBeVisible();
    await expect(page.getByTestId("users-table")).toBeHidden();
    // No email is cut off: each card shows the whole address.
    const clipped = await page.getByTestId("users-cards").evaluate((cards) =>
      Array.from(cards.querySelectorAll<HTMLElement>(".zg-user-card__email"))
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent),
    );
    expect(clipped, "emails cut off in the cards").toEqual([]);
  } else {
    await expect(page.getByTestId("users-table")).toBeVisible();
    await expect(page.getByTestId("users-cards")).toBeHidden();
    await expectTableFits(page, "users-table", "User Management");
  }
  await expectNoHorizontalOverflow(page, "User Management");
}

// RESP-03: a 440px panel on the right at desktop (the list still visible); a
// full-screen sheet at tablet and mobile.
async function expectPanelLayout(page: Page, info: TestInfo, name: string) {
  const panel = (await page.getByRole("dialog", { name }).boundingBox())!;
  const viewport = page.viewportSize()!;
  if (bp(info) === "desktop") {
    expect(Math.round(panel.width)).toBe(440);
    expect(Math.round(panel.x + panel.width)).toBe(viewport.width);
  } else {
    expect(Math.round(panel.width)).toBe(viewport.width);
    expect(Math.round(panel.x)).toBe(0);
  }
  expect(Math.round(panel.height)).toBe(viewport.height);
  await expectNoHorizontalOverflow(page, `${name} panel`);
}

async function editButton(page: Page, info: TestInfo, name: string) {
  return list(page, info).getByRole("button", { name: `Edit ${name}` });
}

test.describe("user administration", () => {
  test("E2E-09 RESP-03 an Administrator searches, filters by role, creates a user, and a duplicate email is refused on the Email field", async ({ page }, info) => {
    const email = runEmail(info, "created");
    const name = `E2E Created ${bp(info)}`;

    await signIn(page, ACCOUNTS.admin.email);
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(list(page, info).getByText(ACCOUNTS.admin.name)).toBeVisible();
    await expectListLayout(page, info);
    await shot(page, info, "user-management", "list");

    await page.getByLabel("Search").fill("pimchanok");
    await expect(list(page, info).getByText("Pimchanok Srisuk")).toBeVisible();
    await expect(list(page, info).getByText(ACCOUNTS.admin.name)).toHaveCount(0);
    await shot(page, info, "user-management", "search");

    // A very long address must show whole and must not widen the table: set up
    // through the API, since it's the data under test, not the create flow.
    const admin = await apiAs(ACCOUNTS.admin.email);
    const long = runEmail(info, "averylongmailboxnamewithoutanynaturalbreakpointsatall");
    await createUser(admin, { name: `E2E Long Email ${bp(info)}`, email: long });
    await admin.dispose();
    await page.getByLabel("Search").fill(long);
    await expect(list(page, info).getByText(`E2E Long Email ${bp(info)}`)).toBeVisible();
    await expectListLayout(page, info);

    await page.getByLabel("Search").fill("");
    await page.getByLabel("Role", { exact: true }).selectOption("IT_STAFF");
    await expect(list(page, info).getByText(ACCOUNTS.staff.name)).toBeVisible();
    await expect(list(page, info).getByText(ACCOUNTS.admin.name)).toHaveCount(0);
    await expect(list(page, info).getByText("Requester", { exact: true })).toHaveCount(0);
    await shot(page, info, "user-management", "role-filter");
    await page.getByLabel("Role", { exact: true }).selectOption("");

    await page.getByRole("button", { name: "Create user" }).click();
    const panel = page.getByRole("dialog", { name: "Create user" });
    await expectPanelLayout(page, info, "Create user");
    await shot(page, info, "user-management", "create");

    await panel.getByRole("button", { name: "Create user" }).click();
    await expect(panel.getByText("Enter a name of 2 to 100 characters.")).toBeVisible();
    await expect(panel.getByText("Enter a valid email address.")).toBeVisible();
    await expect(panel.getByText("The initial password doesn't meet the rules.")).toBeVisible();
    await shot(page, info, "user-management", "create-validation");

    await panel.getByLabel(/^Full name/).fill(name);
    await panel.getByLabel(/^Email/).fill(email);
    await panel.getByLabel(/^Role/).selectOption("IT_STAFF");
    await panel.getByRole("button", { name: "Generate" }).click();
    await panel.getByRole("button", { name: "Create user" }).click();
    await expect(page.getByRole("status").filter({ hasText: "User created" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByLabel("Search").fill(email);
    await expect(list(page, info).getByText(name)).toBeVisible();

    // The same address in capitals is still the same address (BR-09, AC-36).
    await page.getByRole("button", { name: "Create user" }).click();
    await panel.getByLabel(/^Full name/).fill("E2E Duplicate");
    await panel.getByLabel(/^Email/).fill(email.toUpperCase());
    await panel.getByRole("button", { name: "Generate" }).click();
    await panel.getByRole("button", { name: "Create user" }).click();
    const emailField = panel.getByLabel(/^Email/);
    await expect(emailField).toHaveAttribute("aria-invalid", "true");
    await expect(panel.getByText("Another user already has this email.")).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(emailField).toHaveValue(email.toUpperCase());
    await shot(page, info, "user-management", "duplicate-email");
  });

  test("E2E-10 RESP-03 an Administrator deactivates one user, sets another's initial password, and can't change their own role or status", async ({ page, browser }, info) => {
    const admin = await apiAs(ACCOUNTS.admin.email);
    const leaving = await createUser(admin, { name: `E2E Leaving ${bp(info)}`, email: runEmail(info, "leaving") });
    const reset = await createUser(admin, { name: `E2E Reset ${bp(info)}`, email: runEmail(info, "reset") });
    await admin.dispose();

    await signIn(page, ACCOUNTS.admin.email);
    await page.getByLabel("Search").fill(`E2E`);
    await (await editButton(page, info, leaving.name)).click();
    const edit = page.getByRole("dialog", { name: `Edit ${leaving.name}` });
    await expectPanelLayout(page, info, `Edit ${leaving.name}`);
    await edit.getByRole("switch", { name: "Active" }).click();
    await expect(edit.getByRole("switch", { name: "Active" })).toHaveAttribute("aria-checked", "false");
    await shot(page, info, "user-management", "edit");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Changes saved" })).toBeVisible();

    await (await editButton(page, info, reset.name)).click();
    const resetPanel = page.getByRole("dialog", { name: `Edit ${reset.name}` });
    await resetPanel.getByRole("button", { name: "Generate" }).click();
    const newPassword = await resetPanel.getByLabel(/^New initial password/).inputValue();
    await resetPanel.getByRole("button", { name: "Set initial password" }).click();
    const confirm = page.getByRole("dialog", { name: "Set a new initial password?" });
    await expect(confirm).toContainText(`${reset.name} will be signed out everywhere and must choose a new password at their next sign-in.`);
    await shot(page, info, "user-management", "set-initial-password");
    await confirm.getByRole("button", { name: "Set initial password" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Initial password set" })).toBeVisible();

    // One's own account: Role and Active disabled, with the reason, and no password reset.
    await page.getByLabel("Search").fill(ACCOUNTS.admin.name);
    await (await editButton(page, info, ACCOUNTS.admin.name)).click();
    const own = page.getByRole("dialog", { name: `Edit ${ACCOUNTS.admin.name}` });
    await expect(own.getByLabel(/^Role/)).toBeDisabled();
    await expect(own.getByRole("switch", { name: "Active" })).toBeDisabled();
    await expect(own.getByText("You can't change your own role or deactivate your own account.")).toBeVisible();
    await expect(own.getByLabel(/^New initial password/)).toHaveCount(0);
    await shot(page, info, "user-management", "self-restriction");
    await own.getByRole("button", { name: "Cancel" }).click();

    // The last-Administrator refusal: the development database always has two
    // active Administrators, so this one answer is stubbed in the browser to
    // show where the message appears. Nothing reaches the server.
    await page.route(/\/api\/admin\/users\/\d+$/, (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { code: "LAST_ADMINISTRATOR", message: "TokTickIT must keep at least one active Administrator." } }) })
        : route.continue(),
    );
    await page.getByLabel("Search").fill(ACCOUNTS.secondAdmin.name);
    await (await editButton(page, info, ACCOUNTS.secondAdmin.name)).click();
    const other = page.getByRole("dialog", { name: `Edit ${ACCOUNTS.secondAdmin.name}` });
    await other.getByRole("switch", { name: "Active" }).click();
    await other.getByRole("button", { name: "Save changes" }).click();
    await expect(other.getByText("TokTickIT must keep at least one active Administrator.")).toBeVisible();
    await expect(other).toBeVisible();
    await shot(page, info, "user-management", "last-administrator");
    await other.getByRole("button", { name: "Cancel" }).click();
    await page.unroute(/\/api\/admin\/users\/\d+$/);

    // The deactivated user can't sign in; the other must change the new password.
    const context = await browser.newContext({ baseURL: ORIGIN, viewport: page.viewportSize() });
    const second = await context.newPage();
    await second.goto("/login");
    await second.getByLabel(/^Email/).fill(leaving.email);
    await second.getByLabel(/^Password/).fill("E2E-initial-2026");
    await second.getByRole("button", { name: "Sign in" }).click();
    await expect(second.getByText("This account is inactive. Contact your IT administrator.")).toBeVisible();
    await signIn(second, reset.email, newPassword);
    await expect(second).toHaveURL(/\/change-password$/);
    await expect(second.getByRole("heading", { name: "Set a new password" })).toBeVisible();
    await context.close();
  });

  test("E2E-11 a Requester is turned away from User Management, and the admin API refuses their session", async ({ page }, info) => {
    await signIn(page, ACCOUNTS.requester.email);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/tickets$/);
    await expect(page.getByRole("alert").filter({ hasText: "You don't have access to that page." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "User Management" })).toHaveCount(0);
    await shot(page, info, "user-management", "forbidden");

    // The same browser session, straight at the API (its cookie, its origin).
    const res = await page.request.get("/api/admin/users", { headers: { Origin: ORIGIN } });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(JSON.stringify(body)).not.toMatch(/@kmutt\.ac\.th/);
  });

  test("RESP-06 keyboard only: Login, the queue filters, the detail tabs, and the side panel", async ({ page }, info) => {
    // Keyboard order doesn't depend on the width; the queue's filters are a
    // sheet on mobile, so this pass runs once, at desktop.
    test.skip(bp(info) !== "desktop", "keyboard pass runs at desktop");

    // Login: Email → Password → Show password → Sign in, focus always visible.
    await page.goto("/login");
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    const loginOrder: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      loginOrder.push(await focused(page));
      await expectFocusVisible(page, "Login");
    }
    expect(loginOrder).toEqual(["input:Email", "input:Password", "button:Show password", "button:Sign in"]);
    await page.getByLabel(/^Email/).fill(ACCOUNTS.staff.email);
    await page.getByLabel(/^Password/).fill("TokTickIT-dev-2026");
    await page.getByLabel(/^Password/).press("Enter");
    await expect(page).toHaveURL(/\/staff\/queue$/);

    // The queue toolbar, in reading order. With a filter set, so Clear filters
    // is enabled (it is disabled, and skipped by Tab, when there is nothing to clear).
    await page.goto("/staff/queue?status=ALL&itPriority=HIGH");
    await expect(page.getByTestId("queue-table")).toBeVisible();
    await page.locator("#queue-search").focus();
    const toolbar = [await focused(page)];
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("Tab");
      toolbar.push(await focused(page));
      await expectFocusVisible(page, "Queue toolbar");
    }
    expect(toolbar).toEqual(["input:Search", "select:Status", "select:IT Priority", "select:Category", "select:Owner", "input:Requester says resolved", "select:Sort", "button:Clear filters"]);

    // The detail tabs: arrow keys move the selection and the focus (ui-spec §10).
    await page.getByTestId("queue-table").locator("tbody a").first().click();
    const publicTab = page.getByRole("tab", { name: "Public comments" });
    // Focused from code after a mouse click, so the ring is checked after the
    // arrow keys move focus (the browser shows :focus-visible for keyboard moves).
    await publicTab.focus();
    await page.keyboard.press("ArrowRight");
    const internalTab = page.getByRole("tab", { name: "Internal notes" });
    await expect(internalTab).toBeFocused();
    await expect(internalTab).toHaveAttribute("aria-selected", "true");
    await expectFocusVisible(page, "Discussion tabs");
    await page.keyboard.press("ArrowLeft");
    await expect(publicTab).toBeFocused();
    await expect(publicTab).toHaveAttribute("aria-selected", "true");
    await expectFocusVisible(page, "Discussion tabs");

    // The side panel: opened from the keyboard, traps Tab, closes on Escape,
    // and gives focus back to Create user (ui-spec §1.8).
    await signIn(page, ACCOUNTS.admin.email);
    await expect(page).toHaveURL(/\/admin\/users$/);
    const create = page.getByRole("button", { name: "Create user" });
    await create.focus();
    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog", { name: "Create user" });
    await expect(panel).toBeVisible();
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      expect(await panel.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1} stays in the panel`).toBe(true);
      await expectFocusVisible(page, "Create user panel");
    }
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(create).toBeFocused();
  });
});
