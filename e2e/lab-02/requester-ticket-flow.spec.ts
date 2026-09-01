import { test, expect, Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Issue 9 — the full Requester journey (issues.md Issue 9 "To build";
// api-spec.md end to end): select Requester → create a ticket with an
// attachment → find it in My Tickets → open Ticket Detail → download the
// attachment → soft-remove it → switch Requester → confirm the first
// Requester's ticket is gone from the list and inaccessible directly
// (E2E-01, AC-01, AC-10). One project per breakpoint (playwright.config.ts)
// runs this whole journey three times — desktop, tablet, mobile — so the
// screenshots taken along the way double as RESP-02's evidence without a
// second, separate capture pass.
//
// Assumes the target environment is already migrated and seeded (BR-06's
// Category/RelatedSystem/Requester reference data) — this spec reads
// whatever Requesters/Categories/Systems actually exist rather than
// hardcoding ids, the same reason the Vitest suites fetch fixtures
// dynamically instead of assuming specific database ids.

const FIXTURE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/sample.png");

const SCREENSHOT_DIRS = {
  createTicket: path.join(path.dirname(fileURLToPath(import.meta.url)), "../../artifacts/lab-02/screenshots/create-ticket"),
  myTickets: path.join(path.dirname(fileURLToPath(import.meta.url)), "../../artifacts/lab-02/screenshots/my-tickets"),
  ticketDetail: path.join(path.dirname(fileURLToPath(import.meta.url)), "../../artifacts/lab-02/screenshots/ticket-detail"),
};

// AppShell collapses "My Tickets" / "Create Ticket" / "Change Requester"
// behind a "Menu" toggle below 768px (ui-spec.md §6.1) — real bug found on
// the very first mobile run of this spec: clicking a nav link/button
// directly timed out because it's hidden until Menu is tapped.
//
// Checking the *target* control's own visibility, not the toggle button's,
// is deliberate: the toggle is always visible on mobile regardless of
// open/closed state (that's its whole job), and AppShell stays mounted
// across client-side navigation within this journey, so `mobileNavOpen`
// persists once opened. Checking the toggle's visibility would re-click
// (and thus re-close) an already-open menu on the journey's later nav
// clicks — checking whether the target is visible yet is the one signal
// that's correct whether the menu is open, closed, or doesn't exist at all
// (desktop/tablet, where every nav control is always visible).
async function clickNavControl(page: Page, role: "link" | "button", name: string): Promise<void> {
  const target = page.getByRole(role, { name });
  if (!(await target.isVisible())) {
    await page.getByRole("button", { name: "Toggle navigation menu" }).click();
  }
  await target.click();
}

// My Tickets renders two search inputs sharing the identical "Search"
// label — one per toolbar (desktop `#mt-search`, mobile `#mt-search-mobile`,
// MyTickets.tsx) — only one visible at a time via CSS. Found on the mobile
// run: `getByLabel("Search").first()` deterministically picks whichever
// comes first in DOM order (the desktop one), which is `display: none` on
// mobile and never becomes fillable — Playwright's `.first()` follows DOM
// order, not visibility. Selecting by breakpoint instead of DOM position
// is the reliable fix.
function searchInput(page: Page, breakpoint: string) {
  return page.locator(breakpoint === "mobile" ? "#mt-search-mobile" : "#mt-search");
}

// Same duplicate-representation issue as searchInput() above, one level
// deeper: My Tickets renders every row in *both* the desktop table and the
// mobile card list at once (by design — RESP-01), so a bare
// `getByText(ticketNumber).first()` resolves to the desktop `<td>`, which
// is hidden on mobile. Scoping into the correct container by its
// `data-testid` (MyTickets.tsx: `my-tickets-table` / `my-tickets-cards`)
// picks the one that's actually rendered for this breakpoint.
function ticketRowLocator(page: Page, breakpoint: string, ticketNumber: string) {
  const container =
    breakpoint === "mobile" ? page.getByTestId("my-tickets-cards") : page.getByTestId("my-tickets-table");
  return container.getByText(ticketNumber, { exact: true });
}

async function selectRequester(page: Page, index: number): Promise<string> {
  await page.goto("/select-requester");
  const select = page.getByLabel("Development Requester");
  await expect(select).toBeVisible();

  const optionValues = await select.locator("option[value]:not([value=''])").all();
  expect(optionValues.length).toBeGreaterThan(index);
  const name = (await optionValues[index].textContent())!.trim();

  await select.selectOption({ label: name });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/tickets$/);
  return name;
}

async function changeRequester(page: Page): Promise<void> {
  await clickNavControl(page, "button", "Change Requester");
  await expect(page).toHaveURL(/\/select-requester$/);
}

test.describe("Full Requester journey (E2E-01, RESP-02)", () => {
  test("create → find in My Tickets → view detail → download → soft-remove → switch Requester → isolation", async ({
    page,
  }, testInfo) => {
    const breakpoint = testInfo.project.name; // "desktop" | "tablet" | "mobile"

    // --- Select Requester A ---
    const requesterAName = await selectRequester(page, 0);

    // --- Create a ticket with an attachment ---
    await clickNavControl(page, "link", "Create Ticket");
    await expect(page).toHaveURL(/\/tickets\/new$/);

    const categorySelect = page.getByLabel("Category");
    const categoryOptions = await categorySelect.locator("option[value]:not([value=''])").all();
    expect(categoryOptions.length).toBeGreaterThan(0);
    const categoryValue = await categoryOptions[0].getAttribute("value");
    await categorySelect.selectOption(categoryValue!);

    const systemSelect = page.getByLabel("Related System");
    const systemOptions = await systemSelect.locator("option[value]:not([value=''])").all();
    expect(systemOptions.length).toBeGreaterThan(0);
    const systemValue = await systemOptions[0].getAttribute("value");
    await systemSelect.selectOption(systemValue!);

    await page.getByLabel("Requested Priority").selectOption("HIGH");

    const summary = `E2E flow ticket ${Date.now()}`;
    await page.getByLabel("Ticket Summary").fill(summary);
    await page
      .getByLabel("Description")
      .fill("Created by the Issue 9 end-to-end journey test — covers create, list, detail, download, and soft-remove.");
    await page.getByLabel("Attachments").setInputFiles(FIXTURE_FILE);

    await page.screenshot({ path: path.join(SCREENSHOT_DIRS.createTicket, `${breakpoint}-e2e-filled-form.png`) });

    await page.getByRole("button", { name: "Submit Ticket" }).click();

    const ticketNumberEl = page.getByTestId("created-ticket-number");
    await expect(ticketNumberEl).toBeVisible();
    const ticketNumber = (await ticketNumberEl.textContent())!.trim();
    expect(ticketNumber).toMatch(/^TCK-\d{6}$/); // BR-01

    await page.screenshot({ path: path.join(SCREENSHOT_DIRS.createTicket, `${breakpoint}-e2e-success.png`) });

    // --- Find it in My Tickets ---
    await clickNavControl(page, "link", "My Tickets");
    await expect(page).toHaveURL(/\/tickets$/);

    await searchInput(page, breakpoint).fill(ticketNumber);
    const ticketRow = ticketRowLocator(page, breakpoint, ticketNumber);
    await expect(ticketRow).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIRS.myTickets, `${breakpoint}-e2e-found.png`) });

    // --- Open Ticket Detail ---
    await ticketRow.click();
    await expect(page.getByText(ticketNumber, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("sample.png")).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIRS.ticketDetail, `${breakpoint}-e2e-view.png`) });

    // --- Download the attachment ---
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("sample.png");

    // --- Soft-remove it ---
    await page.getByRole("button", { name: "Remove" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Reason for removal").fill("Removed by the Issue 9 end-to-end journey test.");
    await page.screenshot({ path: path.join(SCREENSHOT_DIRS.ticketDetail, `${breakpoint}-e2e-remove-confirm.png`) });
    await dialog.getByRole("button", { name: "Remove Attachment" }).click();
    await expect(dialog).not.toBeVisible();

    // BR-36 — removed, but the metadata (and the removal reason) stays.
    await expect(page.getByText("sample.png")).toBeVisible();
    await expect(page.getByText("Removed by the Issue 9 end-to-end journey test.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download" })).not.toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIRS.ticketDetail, `${breakpoint}-e2e-removed-state.png`) });

    const ownedTicketUrl = page.url();

    // --- Switch Requester (AC-10) ---
    await changeRequester(page);
    const requesterBName = await selectRequester(page, 1);
    expect(requesterBName).not.toBe(requesterAName);

    // Requester A's ticket must not appear in Requester B's list.
    await searchInput(page, breakpoint).fill(ticketNumber);
    await expect(page.getByText("You haven't created any tickets yet.").or(page.getByText("No tickets match your filters."))).toBeVisible();
    await expect(page.getByText(ticketNumber)).not.toBeVisible();

    // Nor is it reachable by direct URL (BR-45, Decision D-2).
    await page.goto(ownedTicketUrl);
    await expect(page.getByText("This ticket could not be found.")).toBeVisible();
    await expect(page.getByText(ticketNumber)).not.toBeVisible();
  });
});
