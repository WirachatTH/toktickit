import type { APIRequestContext, Locator, Page, TestInfo } from "@playwright/test";
import {
  ACCOUNTS,
  addAction,
  apiAs,
  bp,
  claimAndStart,
  createTicket,
  expect,
  expectFocusVisible,
  expectNoHorizontalOverflow,
  expectNothingClipped,
  focused,
  logOut,
  shot4,
  signIn,
  test,
  ticketPrefixFor,
} from "./helpers.js";
import { removeE2EData } from "../lab-03/cleanup.js";

// Lab 4, Issue 8 — Actions Taken from planning to history, as IT Staff, a
// colleague, an Administrator, and the Requester (docs/lab-04/tests.md E2E-01 to
// E2E-03, RESP-02, RESP-03). Every test also runs the E2E-08 watch (helpers.ts):
// no console error and no failed request, except the one a step says it causes.
// Screenshots: artifacts/lab-04/screenshots/actions-taken/.

const COLLEAGUE = { email: "pimchanok.srisuk@kmutt.ac.th", name: "Pimchanok Srisuk" };
const SEEDED = {
  several: "VPN disconnects while uploading large files", // 4 actions, one planned: the gate is blocked
  closed: "New kiosk tablet cannot join staff Wi-Fi",
};

// These journeys are long: several sign-ins and many steps in one test.
test.describe.configure({ timeout: 150_000 });

test.afterAll(async ({}, info) => {
  await removeE2EData({ ticketPrefix: ticketPrefixFor(info) });
});

const area = (page: Page) => page.getByRole("region", { name: /^Actions taken/ });
const cardOf = (page: Page, text: string) => page.getByRole("article").filter({ hasText: text });
const statusOf = (card: Locator) => card.locator(".zg-badge").first();

/** A ticket of the seeded Requester, claimed by the seeded IT Staff member and in progress. */
async function startedTicket(info: TestInfo, label: string): Promise<{ id: number; staff: APIRequestContext; staffId: number }> {
  const requester = await apiAs(ACCOUNTS.requester.email);
  const ticket = await createTicket(requester, `${ticketPrefixFor(info)}${bp(info)} ${label}`);
  await requester.dispose();
  const staff = await apiAs(ACCOUNTS.staff.email);
  const staffId = await claimAndStart(staff, ticket.id);
  return { id: ticket.id, staff, staffId };
}

async function seededTicketId(api: APIRequestContext, summary: string): Promise<number> {
  const res = await api.get(`/api/staff/tickets?status=ALL&search=${encodeURIComponent(summary)}`);
  const found = (await res.json()).data as { id: number; summary: string }[];
  expect(found.map((t) => t.summary), "the seeded ticket is there (run the seed, or `prisma migrate reset`)").toContain(summary);
  return found.find((t) => t.summary === summary)!.id;
}

// RESP-02: the panel is a 440px column on the right at desktop and a full-screen sheet below it.
async function expectPanelLayout(page: Page, info: TestInfo, panel: Locator) {
  const box = (await panel.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.round(box.y), "the panel starts at the top of the screen").toBe(0);
  const footer = (await panel.locator(".zg-side-panel__footer").boundingBox())!;
  expect(Math.round(footer.y + footer.height), "its buttons are fully on screen").toBeLessThanOrEqual(viewport.height);
  if (bp(info) === "desktop") {
    expect(Math.round(box.width), "side panel width").toBe(440);
    expect(Math.round(box.x + box.width), "side panel sits at the right edge").toBe(viewport.width);
  } else {
    expect(Math.round(box.width), "the sheet is as wide as the screen").toBe(viewport.width);
    expect(Math.round(box.height), "the sheet is as tall as the screen").toBe(viewport.height);
  }
  await expectNoHorizontalOverflow(page, "the action panel");
}

test.describe("Actions Taken", () => {
  test("RESP-02 the seeded tickets at each width: several actions, the blocked gate, the Administrator, the Requester, a closed ticket", async ({ page }, info) => {
    const staffApi = await apiAs(ACCOUNTS.staff.email);
    const several = await seededTicketId(staffApi, SEEDED.several);
    const closed = await seededTicketId(staffApi, SEEDED.closed);
    await staffApi.dispose();

    await signIn(page, ACCOUNTS.staff.email);
    await page.goto(`/staff/tickets/${several}`);
    await expect(page.getByRole("heading", { name: "Actions taken (4)" })).toBeVisible();
    await expect(area(page).getByText("Visible to the Requester")).toBeVisible();
    // Every action status is on show, each as text.
    for (const status of ["Completed", "Cancelled", "Planned"]) await expect(area(page).getByText(status, { exact: true }).first()).toBeVisible();
    await expect(area(page).getByText("Follow-up handled")).toBeVisible();
    await expectNoHorizontalOverflow(page, "Actions Taken, several actions");
    await expectNothingClipped(page, "section[aria-labelledby='actions-heading']", "Actions Taken, several actions");
    // On mobile each action's buttons take a row of their own, full width (ui-spec §10).
    if (bp(info) === "mobile") {
      const planned = cardOf(page, "Confirm with the Requester after a week of normal use.");
      const card = (await planned.boundingBox())!;
      for (const name of ["Edit", "Complete", "Cancel action"]) {
        const button = (await planned.getByRole("button", { name, exact: true }).boundingBox())!;
        expect(button.width, `${name} is full width`).toBeGreaterThan(card.width * 0.8);
        expect(button.height, `${name} is a 44px target`).toBeGreaterThanOrEqual(44);
      }
    }
    await shot4(page, info, "actions-taken", "list-several");

    // The gate: Resolved is not offered, and the notice says why in words.
    const controls = page.getByRole("region", { name: "Ticket controls" });
    await expect(controls.getByLabel("New status").locator("option")).not.toContainText(["Resolved"]);
    const notice = page.getByRole("status", { name: "Why Resolved is unavailable" });
    await expect(notice).toContainText("no action is still planned (1 planned)");
    await notice.scrollIntoViewIfNeeded();
    await shot4(page, info, "actions-taken", "gate-blocked");

    await page.goto(`/staff/tickets/${closed}`);
    await expect(area(page).getByText("This ticket is closed.")).toBeVisible();
    await expect(area(page).getByRole("button", { name: "Add action" })).toHaveCount(0);
    await expect(area(page).getByRole("button", { name: /^(Edit|Complete|Cancel action)$/ })).toHaveCount(0);
    await expectNoHorizontalOverflow(page, "Actions Taken, closed ticket");
    await shot4(page, info, "actions-taken", "closed-ticket");
    await logOut(page);

    // The Administrator manages actions; the Lab 3 ticket controls stay read-only (BR-17).
    await signIn(page, ACCOUNTS.admin.email);
    await page.goto(`/staff/tickets/${several}`);
    await expect(area(page).getByRole("button", { name: "Add action" })).toBeVisible();
    await expect(cardOf(page, "Confirm with the Requester after a week of normal use.").getByRole("button", { name: "Complete" })).toBeVisible();
    await expect(controls.getByRole("combobox")).toHaveCount(0);
    await expectNoHorizontalOverflow(page, "Actions Taken, Administrator");
    await shot4(page, info, "actions-taken", "admin-view");
    await logOut(page);

    // The Requester reads the same actions, with nothing to press (BR-18, AC-29).
    await signIn(page, ACCOUNTS.requester.email);
    await page.goto(`/tickets/${several}`);
    const work = page.getByRole("region", { name: /^Work on your request/ });
    await expect(page.getByRole("heading", { name: "Work on your request (4)" })).toBeVisible();
    await expect(work.getByText("Lowered the VPN gateway MTU to 1400 and retested large uploads.")).toBeVisible();
    await expect(work.getByText("Not needed: the fault is on our VPN gateway, not the home router.")).toBeVisible();
    await expect(work.getByRole("button")).toHaveCount(0);
    await expectNoHorizontalOverflow(page, "Work on your request");
    await expectNothingClipped(page, "main", "Work on your request");
    await shot4(page, info, "actions-taken", "requester-view");
  });

  test("E2E-01 E2E-02 RESP-02 IT Staff plan three actions, assign one to a colleague, edit, complete, cancel, and read the history; the Requester then reads them", async ({ page }, info) => {
    const { id, staff } = await startedTicket(info, "flow");
    await staff.dispose();
    const first = "Check the charger and the battery health report.";
    const firstEdited = "Check the charger, the cable, and the battery health report.";
    const second = "Order a replacement battery from the supplier.";
    const third = "Updated the laptop firmware to the latest release.";

    await signIn(page, ACCOUNTS.staff.email);
    await page.goto(`/staff/tickets/${id}`);
    await expect(page.getByRole("heading", { name: "Actions taken (0)" })).toBeVisible();
    await expect(area(page).getByText("No actions yet. Add the first action to plan or record work on this ticket.")).toBeVisible();

    // --- Plan the first action. Nothing typed: the messages sit under their fields.
    await area(page).getByRole("button", { name: "Add action" }).click();
    const panel = page.getByRole("dialog", { name: "Add action" });
    await expectPanelLayout(page, info, panel);
    await panel.getByRole("button", { name: "Save action" }).click();
    const descriptionError = panel.getByText("Enter a description.");
    await expect(descriptionError).toBeVisible();
    const field = (await panel.getByLabel(/^Action description/).boundingBox())!;
    const message = (await descriptionError.boundingBox())!;
    expect(message.y, "the message is directly below its field").toBeGreaterThanOrEqual(field.y + field.height - 1);
    expect(message.y - (field.y + field.height), "with nothing between them").toBeLessThan(12);
    await shot4(page, info, "actions-taken", "create-validation");

    await panel.getByLabel(/^Action description/).fill(first);
    await expect(panel.getByLabel(/^Assigned to/).locator("option:checked")).toHaveText(new RegExp(ACCOUNTS.staff.name));
    await shot4(page, info, "actions-taken", "create-planned");
    await panel.getByRole("button", { name: "Save action" }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByText("Action added")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Actions taken (1)" })).toBeVisible();
    await expect(statusOf(cardOf(page, first))).toHaveText("Planned");

    // --- Plan the second for a colleague.
    await area(page).getByRole("button", { name: "Add action" }).click();
    await panel.getByLabel(/^Action description/).fill(second);
    await panel.getByLabel(/^Assigned to/).selectOption({ label: COLLEAGUE.name });
    await panel.getByRole("button", { name: "Save action" }).click();
    await expect(panel).toBeHidden();
    await expect(cardOf(page, second)).toContainText(`Assigned to ${COLLEAGUE.name}`);

    // --- Record work already done: a result is required.
    await area(page).getByRole("button", { name: "Add action" }).click();
    await panel.getByRole("radio", { name: "Record work already done" }).check();
    await panel.getByLabel(/^Action description/).fill(third);
    await panel.getByRole("button", { name: "Save action" }).click();
    await expect(panel.getByText("Enter the result.")).toBeVisible();
    await panel.getByLabel(/^Result/).fill("The firmware is current; the battery still drains.");
    await panel.getByRole("checkbox", { name: "Follow-up required?" }).check();
    await panel.getByLabel(/^Follow-up note/).fill("Recheck the drain after the new battery arrives.");
    await expectNoHorizontalOverflow(page, "Add action, recorded work");
    await shot4(page, info, "actions-taken", "create-completed");
    await panel.getByRole("button", { name: "Save action" }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByRole("heading", { name: "Actions taken (3)" })).toBeVisible();
    await expect(statusOf(cardOf(page, third))).toHaveText("Completed");
    await expect(cardOf(page, third).getByText("Follow-up needed")).toBeVisible();

    // --- Edit the first.
    await cardOf(page, first).getByRole("button", { name: "Edit", exact: true }).click();
    const editPanel = page.getByRole("dialog", { name: "Edit action" });
    await expect(editPanel.getByLabel(/^Action description/)).toHaveValue(first);
    await editPanel.getByLabel(/^Action description/).fill(firstEdited);
    await expectPanelLayout(page, info, editPanel);
    await shot4(page, info, "actions-taken", "edit");
    await editPanel.getByRole("button", { name: "Save changes" }).click();
    await expect(editPanel).toBeHidden();
    await expect(page.getByText("Action updated")).toBeVisible();
    await expect(cardOf(page, firstEdited)).toBeVisible();

    // --- Complete it: a dialog asks for the result.
    await cardOf(page, firstEdited).getByRole("button", { name: "Complete", exact: true }).click();
    const complete = page.getByRole("dialog", { name: "Complete this action?" });
    await complete.getByRole("button", { name: "Mark as completed" }).click();
    await expect(complete.getByText("Enter the result.")).toBeVisible();
    await complete.getByLabel(/^Result/).fill("The charger is fine; the battery is at 41% health.");
    await expectNoHorizontalOverflow(page, "Complete dialog");
    await shot4(page, info, "actions-taken", "complete-confirm");
    await complete.getByRole("button", { name: "Mark as completed" }).click();
    await expect(complete).toBeHidden();
    await expect(page.getByText("Action completed")).toBeVisible();
    await expect(statusOf(cardOf(page, firstEdited))).toHaveText("Completed");
    await expect(cardOf(page, firstEdited)).toContainText("The charger is fine; the battery is at 41% health.");
    await expect(cardOf(page, firstEdited).getByRole("button", { name: /^(Edit|Complete|Cancel action)$/ })).toHaveCount(0);

    // --- Cancel the colleague's: a reason of at least 10 characters.
    await cardOf(page, second).getByRole("button", { name: "Cancel action" }).click();
    const cancel = page.getByRole("dialog", { name: "Cancel this action?" });
    await cancel.getByLabel(/^Reason/).fill("Too short");
    await cancel.getByRole("button", { name: "Cancel action" }).click();
    await expect(cancel.getByText("Give a reason of 10 to 1000 characters.")).toBeVisible();
    await cancel.getByLabel(/^Reason/).fill("The supplier has the battery in stock locally.");
    await expectNoHorizontalOverflow(page, "Cancel dialog");
    await shot4(page, info, "actions-taken", "cancel-confirm");
    await cancel.getByRole("button", { name: "Cancel action" }).click();
    await expect(cancel).toBeHidden();
    await expect(page.getByText("Action cancelled")).toBeVisible();
    await expect(statusOf(cardOf(page, second))).toHaveText("Cancelled");
    await expect(cardOf(page, second)).toContainText("The supplier has the battery in stock locally.");

    // --- The list after every step: three actions, each with its final status.
    await expect(page.getByRole("heading", { name: "Actions taken (3)" })).toBeVisible();
    await expect(area(page).getByRole("article")).toHaveCount(3);

    // --- History: created, edited (with the change), completed, oldest first.
    const history = cardOf(page, firstEdited).getByRole("button", { name: "History" });
    await expect(history).toHaveAttribute("aria-expanded", "false");
    await history.click();
    await expect(history).toHaveAttribute("aria-expanded", "true");
    const events = cardOf(page, firstEdited).locator(".zg-action-history li");
    await expect(events).toHaveCount(3);
    await expect(events.nth(0)).toContainText(`${ACCOUNTS.staff.name}`);
    await expect(events.nth(0)).toContainText("Created");
    await expect(events.nth(1)).toContainText("Edited");
    await expect(events.nth(1)).toContainText(`${first} → ${firstEdited}`);
    await expect(events.nth(2)).toContainText("Completed");
    await expectNoHorizontalOverflow(page, "Actions Taken with history open");
    await expectNothingClipped(page, "section[aria-labelledby='actions-heading']", "Actions Taken with history open");
    await cardOf(page, firstEdited).scrollIntoViewIfNeeded();
    await shot4(page, info, "actions-taken", "history");
    await logOut(page);

    // --- E2E-02: the Requester sees every action and field, and no control.
    await signIn(page, ACCOUNTS.requester.email);
    await page.goto(`/tickets/${id}`);
    const work = page.getByRole("region", { name: /^Work on your request/ });
    await expect(page.getByRole("heading", { name: "Work on your request (3)" })).toBeVisible();
    for (const text of [
      firstEdited,
      "The charger is fine; the battery is at 41% health.",
      second,
      "The supplier has the battery in stock locally.",
      third,
      "The firmware is current; the battery still drains.",
      "Recheck the drain after the new battery arrives.",
    ]) {
      await expect(work.getByText(text)).toBeVisible();
    }
    for (const status of ["Completed", "Cancelled"]) await expect(work.getByText(status, { exact: true }).first()).toBeVisible();
    await expect(work.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Add action|History/ })).toHaveCount(0);
    await expectNoHorizontalOverflow(page, "Work on your request after the flow");
  });

  test("E2E-03 two people edit the same action: the second save is refused, says so, and keeps its text", async ({ page, browser, expected }, info) => {
    const { id, staff, staffId } = await startedTicket(info, "stale");
    await addAction(staff, id, { status: "PLANNED", description: "Run the hardware diagnostics.", assigneeId: staffId });
    await staff.dispose();

    // The first editor opens the action and starts typing.
    await signIn(page, ACCOUNTS.staff.email);
    await page.goto(`/staff/tickets/${id}`);
    await cardOf(page, "Run the hardware diagnostics.").getByRole("button", { name: "Edit", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Edit action" });
    await panel.getByLabel(/^Action description/).fill("Run the hardware diagnostics twice, on battery and on mains.");

    // Meanwhile a colleague, in their own browser, saves a change to the same action.
    const other = await browser.newContext({ viewport: page.viewportSize()! });
    const colleague = await other.newPage();
    expected.watch(colleague, "colleague");
    await signIn(colleague, COLLEAGUE.email);
    await colleague.goto(`/staff/tickets/${id}`);
    await cardOf(colleague, "Run the hardware diagnostics.").getByRole("button", { name: "Edit", exact: true }).click();
    const theirs = colleague.getByRole("dialog", { name: "Edit action" });
    await theirs.getByLabel(/^Action description/).fill("Run the extended hardware diagnostics.");
    await theirs.getByRole("button", { name: "Save changes" }).click();
    await expect(theirs).toBeHidden();
    await expect(cardOf(colleague, "Run the extended hardware diagnostics.")).toBeVisible();
    await other.close();

    // The first editor saves: 409 STALE_STATE, which this step causes on purpose.
    expected.allow(409, /^\/api\/tickets\/\d+\/actions-taken\/\d+$/, "the stale save this test is about");
    await panel.getByRole("button", { name: "Save changes" }).click();
    await expect(panel.getByRole("alert").filter({ hasText: "This action was changed by someone else. It has been reloaded." })).toBeVisible();
    // The reloaded value is in the field; what they typed is kept beside it (BR-44).
    await expect(panel.getByLabel(/^Action description/)).toHaveValue("Run the extended hardware diagnostics.");
    await expect(panel.getByText("Your unsaved text")).toBeVisible();
    await expect(panel.locator(".zg-unsaved")).toContainText("Run the hardware diagnostics twice, on battery and on mains.");
    await expectNoHorizontalOverflow(page, "the stale conflict");
    await shot4(page, info, "actions-taken", "stale-conflict");

    // Nothing of theirs was overwritten, and a second save on the fresh version goes through.
    await panel.getByLabel(/^Action description/).fill("Run the extended hardware diagnostics, on battery and on mains.");
    await panel.getByRole("button", { name: "Save changes" }).click();
    await expect(panel).toBeHidden();
    await expect(cardOf(page, "Run the extended hardware diagnostics, on battery and on mains.")).toBeVisible();
  });

  test("RESP-03 keyboard only: the dashboard's links, an action card, the panel, the dialogs, and the history", async ({ page }, info) => {
    const { id, staff, staffId } = await startedTicket(info, "keyboard");
    const planned = await addAction(staff, id, { status: "PLANNED", description: "Reseat the memory modules.", assigneeId: staffId });
    await staff.dispose();

    await signIn(page, ACCOUNTS.staff.email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("group", { name: "Unassigned" })).toBeVisible();

    // The Dashboard: every card link and strip link takes focus, visibly.
    for (const link of [
      page.getByRole("group", { name: "Unassigned" }).getByRole("link"),
      page.getByRole("list", { name: "By status" }).getByRole("link").first(),
      page.getByRole("list", { name: "Unresolved by IT Priority" }).getByRole("link").first(),
      page.getByRole("region", { name: "Recently updated" }).getByRole("link", { name: "View all recently updated tickets" }),
    ]) {
      await link.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab"); // arrive by keyboard, so :focus-visible applies
      await expect(link).toBeFocused();
      await expectFocusVisible(page, "Dashboard");
    }

    // `#action-<id>` moves focus to that card (ui-spec §7, §9).
    await page.goto(`/staff/tickets/${id}#action-${planned.id}`);
    await expect(page.locator(`#action-${planned.id}`)).toBeFocused();
    await expectFocusVisible(page, "the action card reached by its anchor");

    // History is a disclosure the keyboard opens and closes.
    const card = cardOf(page, "Reseat the memory modules.");
    const history = card.getByRole("button", { name: "History" });
    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe("button:History");
    await expectFocusVisible(page, "History");
    await page.keyboard.press("Enter");
    await expect(history).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`#${await history.getAttribute("aria-controls")}`)).toContainText("Created");
    await page.keyboard.press("Enter");
    await expect(history).toHaveAttribute("aria-expanded", "false");

    // Edit: the panel takes focus, Tab stays inside it, Escape returns to the opener.
    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe("button:Edit");
    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog", { name: "Edit action" });
    await expect(panel).toBeVisible();
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      expect(await panel.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1} stays in the panel`).toBe(true);
      await expectFocusVisible(page, "Edit action panel");
    }
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(card.getByRole("button", { name: "Edit", exact: true })).toBeFocused();

    // Complete and Cancel: each dialog returns focus to its own button.
    for (const [button, title] of [["Complete", "Complete this action?"], ["Cancel action", "Cancel this action?"]] as const) {
      await page.keyboard.press("Tab");
      expect(await focused(page)).toBe(`button:${button}`);
      await expectFocusVisible(page, button);
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: title });
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `${title} takes focus`).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(card.getByRole("button", { name: button, exact: true })).toBeFocused();
    }

    // Add action, by keyboard from start to finish.
    await area(page).getByRole("button", { name: "Add action" }).focus();
    await page.keyboard.press("Enter");
    const add = page.getByRole("dialog", { name: "Add action" });
    await expect(add).toBeVisible();
    await add.getByLabel(/^Action description/).focus();
    await page.keyboard.type("Swap the keyboard cable.");
    await add.getByRole("button", { name: "Save action" }).focus();
    await page.keyboard.press("Enter");
    await expect(add).toBeHidden();
    // Focus goes to the new card once it is listed (ui-spec §4.6).
    await expect(cardOf(page, "Swap the keyboard cable.")).toBeFocused();
  });
});
