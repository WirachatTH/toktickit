import { test, expect } from "@playwright/test";
import {
  ACCOUNTS,
  emailPrefixFor,
  INITIAL_PASSWORD,
  apiAs,
  bp,
  createUser,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  logOut,
  openNav,
  runEmail,
  shot,
  signIn,
} from "./helpers.js";
import { removeE2EData } from "./cleanup.js";

// This file's own users go when it ends, so the next file — and its
// screenshots — start from the seeded data (PR #61 review).
test.afterAll(async ({}, info) => {
  await removeE2EData({ emailPrefix: emailPrefixFor(info) });
});

// Lab 3, Issue 10 — sign-in, the forced password change, sign-in failures, and
// the shell for each role (docs/lab-03/tests.md E2E-01 to E2E-03, RESP-04,
// RESP-05). Screenshots: artifacts/lab-03/screenshots/authentication/.

const NEW_PASSWORD = "E2E-changed-2026";

test.describe("authentication", () => {
  test("E2E-01 RESP-04 RESP-05 a Requester signs in, sees their name and role, signs out, and a protected URL then shows Login", async ({ page }, info) => {
    const mobile = bp(info) === "mobile";

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "Login");
    if (mobile) {
      await expectTouchTargets(
        [page.getByLabel(/^Email/), page.getByLabel(/^Password/), page.getByRole("button", { name: "Show password" }), page.getByRole("button", { name: "Sign in" })],
        "Login",
      );
    }
    await shot(page, info, "authentication", "login");

    await signIn(page, ACCOUNTS.requester.email);
    await expect(page).toHaveURL(/\/tickets$/);
    await openNav(page);
    const nav = page.getByRole("navigation", { name: "Primary" });
    const account = nav.getByRole("group", { name: "Account" });
    await expect(account.getByText(ACCOUNTS.requester.name)).toBeVisible();
    await expect(account.getByText("Requester", { exact: true })).toBeVisible();
    // RESP-05: the role's links, the user block, and both actions — inside the
    // hamburger on mobile, in the header elsewhere.
    for (const name of ["My Tickets", "Create Ticket", "Change password"]) await expect(nav.getByRole("link", { name })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Log out" })).toBeVisible();
    if (mobile) {
      await expect(page.getByRole("button", { name: "Toggle navigation menu" })).toHaveAttribute("aria-expanded", "true");
      await expectTouchTargets(
        [nav.getByRole("link", { name: "My Tickets" }), nav.getByRole("link", { name: "Create Ticket" }), nav.getByRole("link", { name: "Change password" }), nav.getByRole("button", { name: "Log out" })],
        "Mobile menu",
      );
    }
    await expectNoHorizontalOverflow(page, "Requester shell");
    await shot(page, info, "authentication", "shell-requester");

    await logOut(page);
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await shot(page, info, "authentication", "logged-out-redirect");

    // The other two shells (ui-spec §2), for the visual checklist.
    for (const [who, badge, links, state] of [
      [ACCOUNTS.staff, "IT Staff", ["Ticket Queue"], "shell-it-staff"],
      [ACCOUNTS.admin, "Administrator", ["User Management", "Ticket Queue"], "shell-administrator"],
    ] as const) {
      await signIn(page, who.email);
      await openNav(page);
      await expect(nav.getByRole("group", { name: "Account" }).getByText(badge, { exact: true })).toBeVisible();
      for (const name of links) await expect(nav.getByRole("link", { name })).toBeVisible();
      await expect(nav.getByRole("link", { name: "My Tickets" })).toHaveCount(0);
      await expectNoHorizontalOverflow(page, `${badge} shell`);
      await shot(page, info, "authentication", state);
      await logOut(page);
    }
  });

  test("E2E-02 RESP-04 a user the Administrator just created must change the password, then lands on their home", async ({ page }, info) => {
    const admin = await apiAs(ACCOUNTS.admin.email);
    const email = runEmail(info, "fresh");
    await createUser(admin, { name: "E2E Fresh User", email });
    await admin.dispose();

    await signIn(page, email, INITIAL_PASSWORD);
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "Change Password");
    if (bp(info) === "mobile") {
      await expectTouchTargets(
        [page.getByLabel(/^Current password/), page.getByLabel(/^New password/), page.getByLabel(/^Confirm new password/), page.getByRole("button", { name: "Save password" })],
        "Change Password",
      );
    }
    await shot(page, info, "authentication", "change-password-forced");

    await page.getByLabel(/^Current password/).fill(INITIAL_PASSWORD);
    await page.getByLabel(/^New password/).fill("short");
    const rules = page.getByRole("list", { name: "Password rules" });
    await expect(rules).toContainText("(not met)");
    await expect(page.getByRole("button", { name: "Save password" })).toBeDisabled();
    await shot(page, info, "authentication", "change-password-rules");

    await page.getByLabel(/^New password/).fill(NEW_PASSWORD);
    await page.getByLabel(/^Confirm new password/).fill(NEW_PASSWORD);
    await expect(rules).not.toContainText("(not met)");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page).toHaveURL(/\/tickets$/);

    // The new password is the one that works now.
    await logOut(page);
    await signIn(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/tickets$/);
  });

  test("E2E-03 a wrong password, an inactive account, and the throttle each show their own message", async ({ page }, info) => {
    const admin = await apiAs(ACCOUNTS.admin.email);
    const active = runEmail(info, "wrongpw");
    const inactive = runEmail(info, "inactive");
    await createUser(admin, { name: "E2E Wrong Password", email: active });
    await createUser(admin, { name: "E2E Inactive", email: inactive, isActive: false });
    await admin.dispose();

    const attempt = async (email: string, password: string) => {
      const response = page.waitForResponse((r) => r.url().endsWith("/api/auth/login"));
      await page.getByLabel(/^Email/).fill(email);
      await page.getByLabel(/^Password/).fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      return (await response).status();
    };

    await page.goto("/login");
    expect(await attempt(active, "Not-the-password-1")).toBe(401);
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await shot(page, info, "authentication", "login-invalid");

    expect(await attempt(inactive, INITIAL_PASSWORD)).toBe(403);
    await expect(page.getByText("This account is inactive. Contact your IT administrator.")).toBeVisible();
    await expect(page.getByText("Email or password is incorrect.")).toHaveCount(0);
    await shot(page, info, "authentication", "login-inactive");

    // Four more failures make five (BR-14); the sixth attempt is throttled, even
    // with the right password.
    for (let i = 0; i < 4; i++) expect(await attempt(active, `Not-the-password-${i + 2}`)).toBe(401);
    expect(await attempt(active, INITIAL_PASSWORD)).toBe(429);
    await expect(page.getByRole("alert").filter({ hasText: /Too many sign-in attempts\. Try again in \d+ minutes?\./ })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await shot(page, info, "authentication", "login-throttled");
  });

  test("RESP-04 Login shows a busy state while signing in, and a safe message when the server fails", async ({ page }, info) => {
    // Hold the sign-in request so the busy state can be seen, then let it through.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/auth/login", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/login");
    await page.getByLabel(/^Email/).fill(ACCOUNTS.requester.email);
    await page.getByLabel(/^Password/).fill("TokTickIT-dev-2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    const busy = page.getByRole("button", { name: "Signing in…" });
    await expect(busy).toBeVisible();
    await expect(busy).toBeDisabled();
    await expect(busy).toHaveAttribute("aria-busy", "true");
    await shot(page, info, "authentication", "login-submitting");
    release();
    await expect(page).toHaveURL(/\/tickets$/);
    await page.unroute("**/api/auth/login");
    await logOut(page);

    // A server failure, stubbed in the browser (the real server can't be made to
    // fail on demand). The body is deliberately revealing, so the check proves
    // the screen shows its own plain message and never echoes what came back.
    const leak = 'relation "User" does not exist at prisma/client.ts:42';
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: leak } }) }),
    );
    await page.getByLabel(/^Email/).fill(ACCOUNTS.requester.email);
    await page.getByLabel(/^Password/).fill("TokTickIT-dev-2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Something went wrong. Please try again." })).toBeVisible();
    await expect(page.getByText(leak)).toHaveCount(0);
    await expect(page.getByText(/prisma|relation "User"/)).toHaveCount(0);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
    await expectNoHorizontalOverflow(page, "Login failure");
    await shot(page, info, "authentication", "login-failure");
  });
});
