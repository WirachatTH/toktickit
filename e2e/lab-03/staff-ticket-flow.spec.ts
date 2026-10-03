import { test, expect, type Page, type TestInfo } from "@playwright/test";
import {
  ACCOUNTS,
  E2E_TICKET_PREFIX,
  FIXTURE_FILE,
  apiAs,
  bp,
  expectNoHorizontalOverflow,
  expectTableFits,
  logOut,
  openNav,
  shot,
  signIn,
} from "./helpers.js";

// Lab 3, Issue 10 — one ticket from creation to resolution, through the
// Requester, IT Staff, and Administrator screens (docs/lab-03/tests.md E2E-04 to
// E2E-08, RESP-01, RESP-02), plus the queue's states for the visual checklist.
// Screenshots: artifacts/lab-03/screenshots/{requester-regression,staff-queue,
// staff-ticket-detail}/.

async function clickNav(page: Page, name: string) {
  await openNav(page);
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name }).click();
}

// The queue renders a table at tablet and up and cards below 768px; only one is
// on screen, and each has its own copy of the toolbar's search and filters.
const isMobile = (info: TestInfo) => bp(info) === "mobile";
async function queueFilter(page: Page, info: TestInfo, name: "owner" | "status" | "priority" | "sort", value: string) {
  if (isMobile(info)) {
    const toggle = page.getByRole("button", { name: "Filters" });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await page.locator(`#queue-mobile-${name}`).selectOption(value);
  } else {
    await page.locator(`#queue-${name}`).selectOption(value);
  }
}
const queueSearch = (page: Page, info: TestInfo) => page.locator(isMobile(info) ? "#queue-search-mobile" : "#queue-search");
const queueRows = (page: Page, info: TestInfo) => page.getByTestId(isMobile(info) ? "queue-cards" : "queue-table");

// RESP-01: 7 columns at desktop, 6 at tablet (Category folds into Summary), cards on mobile.
async function expectQueueLayout(page: Page, info: TestInfo) {
  if (isMobile(info)) {
    await expect(page.getByTestId("queue-cards")).toBeVisible();
    await expect(page.getByTestId("queue-table")).toBeHidden();
  } else {
    const headers = page.getByTestId("queue-table").locator("thead th");
    await expect(page.getByTestId("queue-table")).toBeVisible();
    const visible = await headers.evaluateAll((ths) => ths.filter((th) => (th as HTMLElement).offsetParent !== null).map((th) => th.textContent!.trim()));
    expect(visible).toEqual(bp(info) === "desktop" ? ["Ticket", "Summary", "Category", "Priority", "Status", "Owner", "Updated"] : ["Ticket", "Summary", "Priority", "Status", "Owner", "Updated"]);
    await expectTableFits(page, "queue-table", "Ticket Queue");
  }
  await expectNoHorizontalOverflow(page, "Ticket Queue");
}

// RESP-02: Ticket controls beside the main column on desktop, above it otherwise.
async function expectDetailLayout(page: Page, info: TestInfo) {
  const controls = (await page.getByRole("region", { name: "Ticket controls" }).boundingBox())!;
  const main = (await page.getByRole("region", { name: "Ticket information" }).boundingBox())!;
  if (bp(info) === "desktop") {
    expect(controls.x, "controls sit to the right of the main column").toBeGreaterThanOrEqual(main.x + main.width - 1);
  } else {
    expect(controls.y + controls.height, "controls sit above the main column").toBeLessThanOrEqual(main.y + 1);
  }
  await expectNoHorizontalOverflow(page, "IT Staff Ticket Detail");
}

test.describe("the staff ticket flow", () => {
  test("E2E-04 to E2E-08 RESP-01 RESP-02 a ticket from the Requester, through IT Staff, to the Administrator's read-only view", async ({ page }, info) => {
    test.setTimeout(180_000);
    const summary = `${E2E_TICKET_PREFIX}${Date.now()} ${bp(info)}`;
    const requesterComment = `Requester comment for ${bp(info)}: the printer is still offline.`;
    const publicComment = `IT Staff public reply for ${bp(info)}: replacing the cable today.`;
    const internalNote = `Internal note for ${bp(info)}: cable stock is low, reorder.`;
    const resolution = `Replaced the network cable and printed a test page (${bp(info)}).`;

    // --- E2E-04: the Requester creates a ticket with an attachment, finds it, comments, marks it appears resolved.
    await signIn(page, ACCOUNTS.requester.email);
    await expect(page).toHaveURL(/\/tickets$/);
    await clickNav(page, "Create Ticket");
    for (const label of ["Category", "Related System"]) {
      const select = page.getByLabel(label);
      await expect(select.locator("option[value]:not([value=''])").first()).toBeAttached();
      await select.selectOption({ index: 1 });
    }
    await page.getByLabel("Requested Priority").selectOption("LOW");
    await page.getByLabel("Ticket Summary").fill(summary);
    await page.getByLabel("Description").fill("Created by the Lab 3 end-to-end flow: the office printer cannot be reached.");
    await page.getByLabel("Attachments").setInputFiles(FIXTURE_FILE);
    await page.getByRole("button", { name: "Submit Ticket" }).click();
    const ticketNumber = (await page.getByTestId("created-ticket-number").textContent())!.trim();
    expect(ticketNumber).toMatch(/^TCK-\d{6}$/);

    await clickNav(page, "My Tickets");
    await page.locator(isMobile(info) ? "#mt-search-mobile" : "#mt-search").fill(ticketNumber);
    await page.getByTestId(isMobile(info) ? "my-tickets-cards" : "my-tickets-table").getByText(ticketNumber, { exact: true }).click();
    await expect(page).toHaveURL(/\/tickets\/\d+$/);
    const ticketId = Number(page.url().match(/\/tickets\/(\d+)$/)![1]);
    await expect(page.getByText("sample.png")).toBeVisible();

    await page.getByLabel("Add a comment").fill(requesterComment);
    await page.getByRole("button", { name: "Post comment" }).click();
    await expect(page.getByTestId("entry-body").filter({ hasText: requesterComment })).toBeVisible();
    await expectNoHorizontalOverflow(page, "Requester Ticket Detail");
    await shot(page, info, "requester-regression", "ticket-detail-comments");

    await page.getByRole("button", { name: "Problem appears resolved" }).click();
    const markDialog = page.getByRole("dialog", { name: "Problem appears resolved" });
    await markDialog.getByLabel(/Comment/).fill("It worked once this morning.");
    await shot(page, info, "requester-regression", "appears-resolved-confirm");
    await markDialog.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Requester: appears resolved")).toBeVisible();
    await shot(page, info, "requester-regression", "appears-resolved-done");
    await logOut(page);

    // --- E2E-05: IT Staff filter the queue to unassigned and claim the NEW ticket.
    await signIn(page, ACCOUNTS.staff.email);
    await expect(page).toHaveURL(/\/staff\/queue$/);
    await expect(queueRows(page, info)).toBeVisible();
    await expectQueueLayout(page, info);
    await queueFilter(page, info, "owner", "unassigned");
    await queueSearch(page, info).fill(ticketNumber);
    const row = queueRows(page, info).getByRole("link", { name: new RegExp(ticketNumber) });
    await expect(row).toBeVisible();
    await expect(queueRows(page, info).getByText("Requester: appears resolved")).toBeVisible();
    await expectQueueLayout(page, info);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/staff/tickets/${ticketId}$`));
    const controls = page.getByRole("region", { name: "Ticket controls" });
    await expect(controls.getByText("NEW", { exact: true })).toBeVisible();
    await expectDetailLayout(page, info);
    await shot(page, info, "staff-ticket-detail", "view");

    await controls.getByRole("button", { name: "Assign to me" }).click();
    await expect(controls.getByText("OPEN", { exact: true })).toBeVisible();
    await expect(controls.getByLabel("Owner").locator("option:checked")).toHaveText(ACCOUNTS.staff.name);
    await shot(page, info, "staff-ticket-detail", "claim");

    // --- E2E-06 (first part): raise IT Priority, move to In Progress.
    await controls.getByLabel("IT Priority").selectOption("HIGH");
    await controls.getByRole("button", { name: "Save priority" }).click();
    await expect(page.getByText("IT Priority updated")).toBeVisible();
    await shot(page, info, "staff-ticket-detail", "priority-changed");
    await controls.getByLabel("New status").selectOption("IN_PROGRESS");
    await controls.getByRole("button", { name: "Update status" }).click();
    await expect(controls.getByText("IN PROGRESS", { exact: true })).toBeVisible();

    // --- E2E-07: an Internal Note and a Public Comment.
    await page.getByRole("tab", { name: "Internal notes" }).click();
    await page.getByLabel("Add an internal note").fill(internalNote);
    await page.getByRole("button", { name: "Add internal note" }).click();
    await expect(page.getByText(internalNote)).toBeVisible();
    await expect(page.getByText("Internal — not visible to the Requester")).toBeVisible();
    await shot(page, info, "staff-ticket-detail", "internal-notes");
    await page.getByRole("tab", { name: "Public comments" }).click();
    await page.getByLabel("Add a public comment").fill(publicComment);
    await page.getByRole("button", { name: "Post public comment" }).click();
    await expect(page.getByText(publicComment)).toBeVisible();
    await shot(page, info, "staff-ticket-detail", "public-comments");

    // A change made elsewhere meanwhile (set up through the API as the same
    // IT Staff member in another session): saving here is refused as stale and
    // the ticket reloads (BR-31).
    const staffApi = await apiAs(ACCOUNTS.staff.email);
    const me = (await (await staffApi.get("/api/auth/me")).json()).user;
    const moved = await staffApi.patch(`/api/staff/tickets/${ticketId}/status`, { data: { status: "WAITING_FOR_REQUESTER", expectedStatus: "IN_PROGRESS", expectedOwnerId: me.id } });
    expect(moved.status()).toBe(200);
    await controls.getByLabel("IT Priority").selectOption("MEDIUM");
    await controls.getByRole("button", { name: "Save priority" }).click();
    await expect(page.getByText("This ticket was changed by someone else. It has been reloaded.")).toBeVisible();
    await expect(controls.getByText("WAITING FOR REQUESTER", { exact: true })).toBeVisible();
    await shot(page, info, "staff-ticket-detail", "stale-conflict");

    // --- E2E-06 (second part): Resolved, with a summary.
    await controls.getByLabel("New status").selectOption("RESOLVED");
    await controls.getByRole("button", { name: "Update status" }).click();
    const resolveDialog = page.getByRole("dialog", { name: "Resolve this ticket?" });
    await expect(resolveDialog.getByRole("button", { name: "Resolve ticket" })).toBeDisabled();
    await resolveDialog.getByLabel("Resolution summary").fill(resolution);
    await expect(resolveDialog.getByRole("button", { name: "Resolve ticket" })).toBeEnabled();
    await shot(page, info, "staff-ticket-detail", "status-confirm");
    await resolveDialog.getByRole("button", { name: "Resolve ticket" }).click();
    await expect(controls.getByText("RESOLVED", { exact: true })).toBeVisible();
    await logOut(page);

    // The Requester sees the status, the summary, and the public comment — never the note.
    await signIn(page, ACCOUNTS.requester.email);
    await page.goto(`/tickets/${ticketId}`);
    await expect(page.getByText("RESOLVED", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Resolution" })).toContainText(resolution);
    await expect(page.getByText(publicComment)).toBeVisible();
    await expect(page.getByText(requesterComment)).toBeVisible();
    await expect(page.getByText(internalNote)).toHaveCount(0);
    await expect(page.getByText(/Internal notes?/i)).toHaveCount(0);
    await logOut(page);

    // --- E2E-08: the Administrator reads the queue and the ticket, with no operational control.
    await signIn(page, ACCOUNTS.admin.email);
    await page.goto(`/staff/queue?status=ALL&search=${ticketNumber}`);
    await expect(page.locator(".zg-pill--readonly")).toHaveText(/Read-only$/);
    await expect(queueRows(page, info).getByRole("link", { name: new RegExp(ticketNumber) })).toBeVisible();
    await expectQueueLayout(page, info);
    await shot(page, info, "staff-queue", "admin-read-only");
    await page.goto(`/staff/tickets/${ticketId}`);
    await expect(page.getByText("Administrators can view tickets but not change them.")).toBeVisible();
    await expect(controls.getByRole("combobox")).toHaveCount(0);
    await expect(controls.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: /Add a public comment|Add an internal note/ })).toHaveCount(0);
    await page.getByRole("tab", { name: "Internal notes" }).click();
    await expect(page.getByText(internalNote)).toBeVisible();
    await expectDetailLayout(page, info);
    await shot(page, info, "staff-ticket-detail", "admin-read-only");
    await logOut(page);

    // A closed ticket, for the Requester's closed-ticket notice (set up through the API).
    const closed = await staffApi.patch(`/api/staff/tickets/${ticketId}/status`, { data: { status: "CLOSED", expectedStatus: "RESOLVED", expectedOwnerId: me.id } });
    expect(closed.status()).toBe(200);
    await staffApi.dispose();
    await signIn(page, ACCOUNTS.requester.email);
    await page.goto(`/tickets/${ticketId}`);
    await expect(page.getByText("CLOSED", { exact: true }).first()).toBeVisible();
    // ui-spec §5: the composer stays, disabled, with the closed note; attachments are frozen (BR-70).
    await expect(page.getByText("This ticket is closed — new comments are not accepted.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Post comment" })).toBeDisabled();
    await expect(page.getByText("Attachments can't be changed on a closed ticket.")).toBeVisible();
    await shot(page, info, "requester-regression", "closed-ticket");
  });

  test("RESP-01 the queue's states at each width: default, filtered, sorted, page 2, unassigned, no results, empty, failure", async ({ page }, info) => {
    await signIn(page, ACCOUNTS.staff.email);
    await expect(page).toHaveURL(/\/staff\/queue$/);
    await expect(queueRows(page, info)).toBeVisible();
    await expectQueueLayout(page, info);
    await shot(page, info, "staff-queue", "default");

    await page.goto("/staff/queue?status=ALL&itPriority=HIGH");
    await expect(queueRows(page, info)).toBeVisible();
    await expectQueueLayout(page, info);
    await shot(page, info, "staff-queue", "filtered");

    await page.goto("/staff/queue?status=ALL&sort=createdAt&order=asc");
    await expect(queueRows(page, info)).toBeVisible();
    await shot(page, info, "staff-queue", "sorted");

    await page.goto("/staff/queue?status=ALL&page=2");
    await expect(queueRows(page, info)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Queue pagination" })).toContainText(/Page 2 of|Showing 11–/);
    await expectQueueLayout(page, info);
    await shot(page, info, "staff-queue", "page-2");

    await page.goto("/staff/queue?owner=unassigned");
    await expect(page).toHaveURL(/owner=unassigned/);
    await shot(page, info, "staff-queue", "unassigned");

    await page.goto("/staff/queue?search=zz-no-such-ticket-e2e");
    await expect(page.getByText("No tickets match your search or filters.")).toBeVisible();
    await expectNoHorizontalOverflow(page, "no results");
    await shot(page, info, "staff-queue", "no-results");

    // The empty queue and a failure can't be produced on the shared database
    // without changing it, so these two answers are stubbed in the browser.
    const empty = {
      data: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
      appliedQuery: { search: "", status: "ACTIVE", itPriority: null, categoryId: null, owner: "any", appearsResolved: false, sort: "itPriority", order: "desc", page: 1, pageSize: 10 },
    };
    await page.route(/\/api\/staff\/tickets(\?|$)/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(empty) }));
    await page.goto("/staff/queue");
    await expect(page.getByText("The queue is clear — there are no active tickets.")).toBeVisible();
    await shot(page, info, "staff-queue", "empty");
    await page.unroute(/\/api\/staff\/tickets(\?|$)/);

    await page.route(/\/api\/staff\/tickets(\?|$)/, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }) }),
    );
    await page.goto("/staff/queue");
    await expect(page.getByText("Unable to load the queue. Please try again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "failure");
    await shot(page, info, "staff-queue", "failure");
  });
});
