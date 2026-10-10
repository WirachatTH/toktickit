import type { Locator, Page, TestInfo } from "@playwright/test";
import {
  ACCOUNTS,
  addAction,
  apiAs,
  bp,
  claimAndStart,
  createTicket,
  expect,
  expectNoHorizontalOverflow,
  logOut,
  shot4,
  signIn,
  test,
  ticketPrefixFor,
} from "./helpers.js";
import { removeE2EData } from "../lab-03/cleanup.js";

// Lab 4, Issue 8 — the resolution gate and the ticket lifecycle in the UI
// (docs/lab-04/tests.md E2E-04, E2E-05; specification.md BR-05, BR-28 to BR-32).
// Screenshot: artifacts/lab-04/screenshots/actions-taken/<breakpoint>-gate-passed-resolved.png.

// These journeys are long: several sign-ins and many steps in one test.
test.describe.configure({ timeout: 150_000 });

test.afterAll(async ({}, info) => {
  await removeE2EData({ ticketPrefix: ticketPrefixFor(info) });
});

const controlsOf = (page: Page) => page.getByRole("region", { name: "Ticket controls" });
const area = (page: Page) => page.getByRole("region", { name: /^Actions taken/ });
const cardOf = (page: Page, text: string) => page.getByRole("article").filter({ hasText: text });
const notice = (page: Page) => page.getByRole("status", { name: "Why Resolved is unavailable" });
const statusOptions = async (controls: Locator) => (await controls.getByLabel("New status").locator("option").allInnerTexts()).filter((o) => o !== "Choose…");
const summaryOf = (info: TestInfo, label: string) => `${ticketPrefixFor(info)}${bp(info)} ${label}`;

/** Moves the ticket with the status control, through the confirmation dialog when there is one. */
async function moveTo(page: Page, status: string, shown: string, confirm?: { title: string; button: string; label?: string; text?: string }) {
  const controls = controlsOf(page);
  await controls.getByLabel("New status").selectOption(status);
  await controls.getByRole("button", { name: "Update status" }).click();
  if (confirm) {
    const dialog = page.getByRole("dialog", { name: confirm.title });
    if (confirm.label) await dialog.getByLabel(confirm.label).fill(confirm.text!);
    await dialog.getByRole("button", { name: confirm.button }).click();
    await expect(dialog).toBeHidden();
  }
  // A closed or cancelled ticket has no status control; its badge is in the page header.
  const terminal = status === "CLOSED" || status === "CANCELLED";
  await expect((terminal ? page.locator("main") : controls).getByText(shown, { exact: true }).first()).toBeVisible();
  if (terminal) await expect(controls.getByLabel("New status")).toHaveCount(0);
}

test.describe("ticket resolution", () => {
  test("E2E-04 the gate in the UI: Resolved is offered only once work is completed, nothing is planned, and every follow-up is handled", async ({ page }, info) => {
    const requester = await apiAs(ACCOUNTS.requester.email);
    const ticket = await createTicket(requester, summaryOf(info, "gate"));
    await requester.dispose();
    const staff = await apiAs(ACCOUNTS.staff.email);
    const staffId = await claimAndStart(staff, ticket.id);

    await signIn(page, ACCOUNTS.staff.email);
    await page.goto(`/staff/tickets/${ticket.id}`);
    const controls = controlsOf(page);

    // No work yet: Resolved is not offered, and the notice says what is missing.
    await expect(controls.getByText("IN PROGRESS", { exact: true })).toBeVisible();
    expect(await statusOptions(controls)).toEqual(["Waiting for requester", "Cancelled"]);
    await expect(notice(page)).toContainText("at least one action is completed (0 completed)");

    // Work recorded with a follow-up, and more work planned (set up through the API).
    const done = await addAction(staff, ticket.id, {
      status: "COMPLETED", description: "Replaced the network cable.", result: "The link is stable at 1 Gbps.", assigneeId: staffId,
      followUpRequired: true, followUpNote: "Check the switch port for errors after a day.",
    });
    await addAction(staff, ticket.id, { status: "PLANNED", description: "Check the switch port error counters.", assigneeId: staffId });
    await staff.dispose();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Actions taken (2)" })).toBeVisible();
    await expect(notice(page)).toContainText("no action is still planned (1 planned)");
    await expect(notice(page)).toContainText("every follow-up is handled (1 open)");
    await expect(notice(page)).not.toContainText("at least one action is completed");
    expect(await statusOptions(controls)).not.toContain("Resolved");
    await expectNoHorizontalOverflow(page, "the gate notice");

    // Complete the planned action in the UI: one reason goes, the follow-up stays.
    await cardOf(page, "Check the switch port error counters.").getByRole("button", { name: "Complete", exact: true }).click();
    const complete = page.getByRole("dialog", { name: "Complete this action?" });
    await complete.getByLabel(/^Result/).fill("No errors on the port in 24 hours.");
    await complete.getByRole("button", { name: "Mark as completed" }).click();
    await expect(complete).toBeHidden();
    await expect(notice(page)).toContainText("every follow-up is handled (1 open)");
    await expect(notice(page)).not.toContainText("no action is still planned");
    expect(await statusOptions(controls)).not.toContain("Resolved");

    // Record the follow-up work against the action that asked for it.
    await area(page).getByRole("button", { name: "Add action" }).click();
    const panel = page.getByRole("dialog", { name: "Add action" });
    await panel.getByRole("radio", { name: "Record work already done" }).check();
    await panel.getByLabel(/^Action description/).fill("Rechecked the switch port a day later.");
    await panel.getByLabel(/^Result/).fill("Still no errors; the fault is fixed.");
    await panel.getByLabel(/^Follow-up of/).selectOption(String(done.id));
    await panel.getByRole("button", { name: "Save action" }).click();
    await expect(panel).toBeHidden();
    await expect(cardOf(page, "Replaced the network cable.").getByText("Follow-up handled")).toBeVisible();

    // The gate passes: the notice goes and Resolved is offered.
    await expect(notice(page)).toHaveCount(0);
    expect(await statusOptions(controls)).toEqual(["Waiting for requester", "Resolved", "Cancelled"]);
    await moveTo(page, "RESOLVED", "RESOLVED", {
      title: "Resolve this ticket?", button: "Resolve ticket", label: "Resolution summary", text: "Replaced a damaged network cable; the port has been clean since.",
    });

    // Resolved: the actions stay readable, and Add action gives way to the reason.
    await expect(area(page).getByText("Reopen the ticket to add or change actions.")).toBeVisible();
    await expect(area(page).getByRole("button", { name: "Add action" })).toHaveCount(0);
    await expect(area(page).getByRole("button", { name: /^(Edit|Complete|Cancel action)$/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Actions taken (3)" })).toBeVisible();
    expect(await statusOptions(controls)).toEqual(["Closed", "Reopened"]);
    await expectNoHorizontalOverflow(page, "a resolved ticket");
    await shot4(page, info, "actions-taken", "gate-passed-resolved");
  });

  test("E2E-05 the Requester's signal never moves the ticket, and IT Staff take it through every status to Closed; an unclaimed ticket is cancelled", async ({ page }, info) => {
    const requester = await apiAs(ACCOUNTS.requester.email);
    const ticket = await createTicket(requester, summaryOf(info, "lifecycle"));
    const unclaimed = await createTicket(requester, summaryOf(info, "cancel"));
    await requester.dispose();
    const staff = await apiAs(ACCOUNTS.staff.email);
    const staffId = await claimAndStart(staff, ticket.id);
    await addAction(staff, ticket.id, { status: "COMPLETED", description: "Reset the user's mailbox rules.", result: "Mail is delivered again.", assigneeId: staffId });
    await addAction(staff, ticket.id, { status: "PLANNED", description: "Confirm delivery with the Requester.", assigneeId: staffId });
    await staff.dispose();

    // --- The Requester says the problem appears resolved: advisory only (BR-05).
    await signIn(page, ACCOUNTS.requester.email);
    await page.goto(`/tickets/${ticket.id}`);
    await page.getByRole("button", { name: "Problem appears resolved" }).click();
    const mark = page.getByRole("dialog", { name: "Problem appears resolved" });
    await mark.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Requester: appears resolved")).toBeVisible();
    await expect(page.getByText("IN PROGRESS", { exact: true }).first()).toBeVisible();
    await logOut(page);

    // --- IT Staff see the signal; the status is unchanged and the gate is still shut.
    await signIn(page, ACCOUNTS.staff.email);
    await page.goto(`/staff/tickets/${ticket.id}`);
    const controls = controlsOf(page);
    await expect(controls.getByText("IN PROGRESS", { exact: true })).toBeVisible();
    await expect(page.getByText("Requester: appears resolved").first()).toBeVisible();
    await expect(notice(page)).toContainText("no action is still planned (1 planned)");
    expect(await statusOptions(controls)).not.toContain("Resolved");

    // --- Every status, through the control and its dialogs.
    await moveTo(page, "WAITING_FOR_REQUESTER", "WAITING FOR REQUESTER");
    await moveTo(page, "IN_PROGRESS", "IN PROGRESS");

    // Cancelling the planned action opens the gate: the completed work remains.
    await cardOf(page, "Confirm delivery with the Requester.").getByRole("button", { name: "Cancel action" }).click();
    const cancel = page.getByRole("dialog", { name: "Cancel this action?" });
    await cancel.getByLabel(/^Reason/).fill("The Requester already confirmed in person.");
    await cancel.getByRole("button", { name: "Cancel action" }).click();
    await expect(cancel).toBeHidden();
    await expect(notice(page)).toHaveCount(0);

    await moveTo(page, "RESOLVED", "RESOLVED", { title: "Resolve this ticket?", button: "Resolve ticket", label: "Resolution summary", text: "Removed a mailbox rule that was deleting incoming mail." });
    await moveTo(page, "REOPENED", "REOPENED", { title: "Reopen this ticket?", button: "Reopen ticket", label: "Reason", text: "The Requester reports that mail is missing again." });
    // After a reopen the earlier completed work still counts (D-14), and actions can be added again.
    await expect(area(page).getByRole("button", { name: "Add action" })).toBeVisible();
    await expect(notice(page)).toHaveCount(0);
    expect(await statusOptions(controls)).toEqual(["In progress", "Waiting for requester", "Resolved", "Cancelled"]);
    await moveTo(page, "IN_PROGRESS", "IN PROGRESS");
    await moveTo(page, "RESOLVED", "RESOLVED", { title: "Resolve this ticket?", button: "Resolve ticket", label: "Resolution summary", text: "Removed a second rule created by a mail client add-in." });
    await moveTo(page, "CLOSED", "CLOSED", { title: "Close this ticket?", button: "Close ticket" });
    await expect(area(page).getByText("This ticket is closed.")).toBeVisible();
    expect(await statusOptions(controls)).toEqual([]);
    await expectNoHorizontalOverflow(page, "a closed ticket");
    await logOut(page);

    // The Requester sees Closed, the last resolution, and the public reopen reason.
    await signIn(page, ACCOUNTS.requester.email);
    await page.goto(`/tickets/${ticket.id}`);
    await expect(page.getByText("CLOSED", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Resolution" })).toContainText("Removed a second rule created by a mail client add-in.");
    await expect(page.getByText("The Requester reports that mail is missing again.")).toBeVisible();
    await logOut(page);

    // --- A ticket nobody has claimed can only be cancelled, with a reason.
    await signIn(page, ACCOUNTS.staff.email);
    await page.goto(`/staff/tickets/${unclaimed.id}`);
    await expect(controls.getByText("NEW", { exact: true })).toBeVisible();
    expect(await statusOptions(controls)).toEqual(["Cancelled"]);
    await moveTo(page, "CANCELLED", "CANCELLED", { title: "Cancel this ticket?", button: "Cancel ticket", label: "Reason", text: "Raised twice by mistake; the other ticket is being handled." });
    await expect(area(page).getByRole("button", { name: "Add action" })).toHaveCount(0);
    expect(await statusOptions(controls)).toEqual([]);
  });
});
