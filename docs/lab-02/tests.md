# Lab 2 Test Plan and Results

## 1. Test Strategy

Tests are planned before implementation (Test DD) and, where practical, written
before the corresponding feature code (TDD) — see `plan.md`'s per-issue workflow.
Every row below traces to at least one Acceptance Criterion in
`docs/lab-02/specification.md` §9 and to the concrete rule (`BR-##`/`FR-##`) it
enforces. Coverage spans six levels: unit, API/integration, UI component, UI style,
responsive, and E2E, matching the labsheet's minimum (§9.2). Full file paths follow
the minimum repository structure required by labsheet §12; a few extra files are
added where the minimum list didn't have an obvious home for a needed area
(reference data, requester selection, shared component library) — additive, not a
replacement for the required ones.

Detailed reasoning for every test, including additional real-world scenarios beyond
what's below, lives in the gitignored working file `test.md` at the repo root; this
document is the curated, graded planned-test table plus traceability required by
§9.1 and §14 Part 3.

## 2. Planned Tests

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| UNIT-01 | BR-01 | Unit | Ticket Number derivation from DB identity | Returns `TCK-######`, unique under concurrent inserts | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-01 | AC-01, FR-04 | API | `POST /api/tickets` with fully valid body | `201`, one Ticket persisted, `ticketNumber` in response matches DB | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-02 | AC-04, BR-20 | API | `POST /api/tickets` missing/blank Summary | `400 VALIDATION_ERROR`, no row created | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-03 | AC-04, BR-21 | API | `POST /api/tickets` Description over 2000 chars | `400 VALIDATION_ERROR`, no row created | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-04 | BR-20, BR-21 | API | Summary/Description at exactly the length limit vs. limit+1 | Exactly-at-limit accepted, limit+1 rejected | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-05 | BR-20 | API | Summary containing only whitespace | Rejected as empty after trimming | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-06 | BR-10 | API | `POST /api/tickets` with invalid/inactive `X-Dev-Requester-Id` | `401 UNAUTHENTICATED`, no row created | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-07 | BR-25 | API/Security | `<script>` payload in Description | Stored safely, escaped on render, never executes | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-08 | BR-26 | API/Security | `requestedPriority` set to a value outside the enum via direct API call | `400 VALIDATION_ERROR`, not coerced or stored | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-09 | AC-15, BR-01 | API | Concurrency: many simultaneous `POST /api/tickets` (burst) | Every `ticketNumber` returned is unique, no collisions | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| UI-01 | AC-04 | UI | Submit with an empty required field | Inline message near the field; no network request fires | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-02 | AC-15, BR-24 | UI | Rapid repeated clicks on Submit | Exactly one request reaches the server | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-03 | AC-01 | UI | Successful submit | Success view shows the generated Ticket Number and next action | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-04 | AC-05, BR-27, BR-28 | UI | Simulated backend failure during submit | Safe error state shown; all field values and attachments preserved | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-05 | AC-06, BR-30, BR-31 | UI | Select an oversized or disallowed-type file | Rejected client-side with a clear inline reason, never uploaded | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-06 | AC-07, BR-32 | UI | Attempt to select a 6th attachment | Rejected client-side before submission | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| STYLE-01 | UI Spec §3 | UI Style | Read-only fields (Ticket Number/Date/Requester) vs editable fields | Distinct `zg-field--readonly` styling applied | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| API-10 | AC-10, BR-12 | API | `GET /api/tickets` as Requester A vs Requester B | Each sees only their own Tickets | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-11 | BR-12 | API/Security | Attempt to widen scope via query manipulation | Server ignores it — always scoped to the header identity | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-12 | AC-11, BR-14 | API | Search matching a known Summary substring | Matching Ticket(s) returned, case-insensitive | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-13 | BR-15 | API | Category/Related System/Priority filters, individually and combined with search | Results narrow correctly in each case | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-14 | BR-16, BR-17 | API | Sort by each documented field, both directions; no sort specified | Correct order each time; default `createdAt desc` when unspecified | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-15 | AC-12, BR-18 | API | Pagination across page 1, a middle page, and the final partial page | Correct page size/slice and accurate `pagination` metadata | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-16 | BR-19 | API | Invalid query params (`page=-1`, `page=abc`, unknown `sort`) | Clamped to safe defaults, never `400`/crash | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-17 | BR-14 | API/Security | Search string with SQL-meaningful characters (`' OR '1'='1`) | Treated as a literal term (parameterized query), no injection | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-18 | BR-18 | API | Client requests an oversized `pageSize` | Clamped to the documented maximum (50) | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| UI-07 | AC-13, BR-43 | UI | Requester with zero Tickets ever | Distinct empty state with Create Ticket CTA | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-08 | AC-13, BR-44 | UI | Search/filter matches zero of the Requester's existing Tickets | Distinct no-results state, Clear Filters offered | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-09 | AC-10, BR-09 | UI | Switch selected Requester A → B while on My Tickets | List reloads to B's Tickets; no stale A data | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| RESP-01 | UI Spec §6.4, §8 | Responsive | My Tickets at desktop/tablet/mobile widths | Table → reduced table → card view; no horizontal scroll | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| API-19 | AC-03, BR-45 | API | `GET /api/tickets/:id` as the owning Requester vs. a different Requester | Owner gets `200` + full data; non-owner gets `404`, no data leaked | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| API-20 | BR-45 | API | `GET /api/tickets/:id` for a nonexistent ID | Safe `404`, no internal detail leaked | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| API-21 | AC-03 | API/Security | `:id` supplied malformed (`"abc"`, injection-shaped string) | Safe `400`/`404`, no server error | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| UI-10 | BR-46 | UI | Render Ticket Detail for any Ticket | No comment box, internal note field, or status-change control present | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pass |
| UI-11 | AC-03 | UI | Deep-link directly to a Ticket Detail URL not owned by the current Requester | Safe not-found state, no data rendered | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pass |
| API-22 | BR-30 | API | Upload one file of each allowed type (JPG/JPEG/PNG/WEBP/PDF) at ticket creation | `201`, metadata returned for each | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-23 | BR-31 | API | File at exactly 5 MB vs. 5 MB + 1 byte, at ticket creation | Exactly-5MB accepted, +1 byte rejected `413` | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-24 | AC-06, BR-30 | API | Disallowed type, including a spoofed extension, at ticket creation | `415`, rejected by real content inspection not filename | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-25 | AC-07, BR-32 | API | 6th attachment submitted with a new Ticket | `400`, rejected before creation | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-26 | BR-32 | API | 5 concurrent add-to-existing uploads on a Ticket with 0 active attachments | Exactly 5 succeed even under a race | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-27 | AC-08, BR-34 | API | Soft-remove without a reason vs. with a valid reason | Without: `400`; with: `200`, `isRemoved=true`, reason stored | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-28 | AC-09, BR-37 | API | Download a soft-removed Attachment | `404`, no bytes returned | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-29 | BR-36 | API | Metadata retrieval for a removed Attachment | Filename/size/date/reason still visible | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-30 | AC-03 | API/Security | Download/remove an Attachment belonging to another Requester's Ticket | `404` for every operation, not just read | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-31 | BR-34 | API | Soft-remove an already-removed Attachment | `409 CONFLICT`, idempotent — no double removal record | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-32 | BR-33 | API/Security | Filename with path-traversal characters (`../../etc/passwd`), at ticket creation | Stored safely under a generated safe filename; filesystem unaffected outside the upload directory | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-33 | BR-38 | API | Simulated disk failure after the Ticket row is committed, during creation | Whole creation rolls back — no orphaned Ticket/Attachment/file | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-34 | BR-39 | API | Attachment added later via Ticket Detail's add-attachment endpoint fails | Only that upload fails; Ticket itself is unaffected | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| UI-12 | AC-08 | UI | Click soft-remove on an attachment | Requires entering a reason + explicit confirmation before it takes effect | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-13 | BR-36 | UI | View a removed attachment | Shown as metadata only, no download/preview control | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-14 | UI Spec §6.5 | UI | Ticket with 5 active attachments | "Add Attachment" disabled with a tooltip explaining why | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| API-35 | AC-14, BR-06 | API | `GET /api/requesters` | Returns only `isActive=true` rows; deleting the filter fails this test (mutation-verified) | `server/tests/lab-02/requesters.api.test.ts` | Pass |
| API-36 | BR-06 | API | `GET /api/systems` against a genuinely inactive Related System (self-cleaning fixture, not just seed data) | Never included; deleting the filter fails this test (mutation-verified) | `server/tests/lab-02/requesters.api.test.ts` | Pass |
| UI-15 | AC-14, BR-06 | UI | Selector dropdown vs. a mocked active-Requester list | Dropdown renders exactly what the API returned | `client/tests/lab-02/RequesterSelector.test.tsx` | Pass |
| UI-16 | UI Spec §6.2 | UI | Selector with mocked empty/failure API responses | Distinct empty state and safe failure state rendered | `client/tests/lab-02/RequesterSelector.test.tsx` | Pass |
| UI-17 | AC-02, BR-08 | UI | Navigate to My Tickets/Create Ticket/Ticket Detail with no Requester selected, rendering the *real* route table (not a synthetic one) | Redirected to the Selector for all three routes; deleting `<RequireRequester>` from `AppRoutes.tsx`'s routes fails this test (mutation-verified) | `client/tests/lab-02/AppRoutes.test.tsx` | Pass |
| STYLE-3.7 | UI Spec §6.1 | UI Style | AppShell's mobile nav element carries no Bootstrap `!important` display utility class | No `d-flex`/`d-inline-flex`/`d-block`/`d-inline` class present — the exact regression that once defeated the mobile media query | `client/tests/lab-02/AppShell.test.tsx` | Pass |
| STYLE-02 | UI Spec §3, §4 | UI Style | Busy/disabled button states across the shared component library | Busy shows spinner+disabled; disabled is inert and visually distinct | `client/tests/lab-02/components.test.tsx` | Pass |
| UI-18 | UI Spec §7 | Accessibility | Tab through Selector, Create Ticket, My Tickets, Ticket Detail | Every interactive control reachable with a visible focus indicator | `client/tests/lab-02/AppShell.test.tsx` | Pending |
| E2E-01 | AC-01, AC-10 | E2E | Full journey: select Requester → create ticket w/ attachment → find in My Tickets → open Detail → download → soft-remove → switch Requester → confirm isolation | Every step succeeds in order on a clean seeded DB | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |
| RESP-02 | UI Spec §8, §9 | Responsive | Create Ticket, My Tickets, Ticket Detail screenshot capture | Desktop/tablet/mobile screenshots show no clipping/overlap/horizontal scroll | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
| :--- | :--- |
| AC-01 | API-01, UI-03, E2E-01 |
| AC-02 | UI-17 (real route table, not synthetic) |
| AC-03 | API-19, API-20, API-21, API-30, UI-11 |
| AC-04 | API-02, API-03, UI-01 |
| AC-05 | UI-04 |
| AC-06 | API-24, UI-05 |
| AC-07 | API-25, UI-06 |
| AC-08 | API-27, UI-12 |
| AC-09 | API-28 |
| AC-10 | API-10, UI-09, E2E-01 |
| AC-11 | API-12 |
| AC-12 | API-15 |
| AC-13 | UI-07, UI-08 |
| AC-14 | API-35 (authoritative), API-36, UI-15 (renders mocked data) |
| AC-15 | API-09, UI-02 |

Every AC-## in `specification.md` §9 has at least one row above; none are
uncovered. This matches DoD Part 1's "every acceptance criterion is linked to
appropriate test evidence."

## 4. Responsive and Visual Checklist

Executed against `ui-spec.md` §9's checklist template, as part of implementing
Issue 9. Screenshot evidence path:
`artifacts/lab-02/screenshots/{create-ticket,my-tickets,ticket-detail}/`, plus
the E2E spec's own per-breakpoint captures (`e2e-*.png` in each folder),
produced by `E2E-01`/`RESP-02`'s three project runs (desktop/tablet/mobile;
`docker compose exec client npx playwright test`, 3 passed).

- [x] **Zen Green tokens used consistently** — `grep`-checked every component
  `.tsx`/`.ts` file for ad hoc hex colors outside `zen-green.css`: zero hits.
- [x] **Editable vs read-only fields visually distinct** — confirmed on Create
  Ticket at mobile width: Ticket Number/Date/Requester render with the tan
  `--zg-readonly-bg` fill against the editable fields' plain white.
- [x] **Validation messages sit directly below their field** — confirmed live
  on Create Ticket (mobile): submitting empty shows both the top-level
  summary banner *and* a message directly under each invalid field
  (`Category is required.`, `Related System is required.`), not the banner
  alone.
- [ ] **Button hierarchy matches §4 everywhere** — **found a real
  discrepancy, not fixed yet.** `ui-spec.md` §4's own table gives "View
  Ticket" as the **tertiary** example, but §6.3's screen-specific text says
  Create Ticket's success panel is "'View Ticket' primary + 'Create Another'
  tertiary" — the two parts of the spec disagree with each other on this
  button. The actual implementation (`CreateTicket.tsx`) matches neither
  exactly: `View Ticket` is primary (agrees with §6.3, not §4) and
  `Create Another` is **secondary** (matches neither passage, both of which
  call for tertiary). Left as a flagged, unresolved finding — picking a
  fix means picking which spec passage is authoritative, which isn't
  this issue's call to make unilaterally.
- [x] **No clipping/overlap/unintended horizontal scroll, all three
  screens** — `scrollWidth === clientWidth` confirmed at 375px for My
  Tickets, Ticket Detail, and (newly checked this issue) Create Ticket;
  Create Ticket's Submit/Cancel correctly render full-width stacked with
  Submit on top at mobile, matching §6.3 exactly.
- [x] **Badge color/label pairs identical across all three screens** — true
  by construction: My Tickets and Ticket Detail both import and render the
  one shared `Badge` component (`components/Badge.tsx`) rather than each
  rolling its own; Create Ticket's success panel doesn't render a badge at
  all (not required by its own §6.3 spec), so there's nothing there to
  diverge.
- [x] **Filters, pagination, attachment controls, and empty/no-results
  states remain usable at every viewport** — already established
  per-issue: My Tickets' mobile filter panel and Prev/Next pagination
  (Issue 7 screenshots), Ticket Detail's mobile Add/Download/Remove
  controls (Issue 8 screenshots, this issue's touch-target fix).
- [ ] **Focus indicator visible when tabbing through all three screens** —
  **could not be verified in this session.** The CSS rule itself
  (`.zg-field:focus-visible { outline: 2px solid var(--zg-secondary); ... }`
  in `zen-green.css`, matching ui-spec.md §7 exactly, and used consistently
  elsewhere — ticket rows/cards have their own equivalent rule) looks
  correct, but `:focus-visible` never activates in the claude-in-chrome
  automation environment used for this audit: `document.hasFocus()`
  reports `false` for the tab regardless of which element has DOM focus,
  since the tool doesn't give the tab real OS-level window focus. This is
  a tooling limitation, not a demonstrated app defect — but it also means
  this item is unverified, not confirmed passing. Needs a human to
  actually tab through in a normal browser session.

Every icon-only control has an accessible label/tooltip: vacuously true —
audited every button across all three screens and found none that are
icon-only. Every control (including "← Back to My Tickets" and "✓ Ticket
created") pairs its decorative character with full visible text, matching
§4's own "text-only buttons are preferred everywhere space allows."

## 5. Test Commands

```bash
# Backend (Vitest + Supertest)
docker-compose exec server npm test

# Frontend (Vitest + Testing Library)
docker-compose exec client npm test

# E2E (Playwright — added in Issue 9)
docker-compose exec client npx playwright test
```

## 6. Final Results

A row is marked Pass once its test(s) actually pass in a full local run —
that's the "linked test run's output" requirement, not a stand-in for one.
In practice that happens while finishing an issue's branch, before its PR
opens, not gated on merge into `lab2-staging`: Issues 5 and 7 both flipped
rows at that point, and Issue 6 (which held rows Pending until merge)
was the outlier, not the rule. Re-verified again with a full run on `main`
before submission (labsheet §14 Part 3). No row in §2 may be marked Pass
without a verified run backing it, regardless of when in the branch's
lifecycle that run happened.

## 7. Known Limitations or Deferred Tests

- Load/perf tests beyond the concurrency checks above (API-09, API-26) are
  exploratory only for this MVP scale and are not part of the graded suite.
- Cross-browser testing is limited to what Playwright's default Chromium project
  covers; no manual Safari/Firefox pass is planned for Lab 2.
- An external peer review of PR #32 (Issue 4) found that API-35's original
  form and UI-17 could both be deleted from the production code without
  failing any test — a passing suite that wasn't actually exercising the
  rule it claimed to. Both were rewritten against a mutation-tested
  fixture (API-35/API-36) and the real route table (UI-17/`AppRoutes.test.tsx`)
  rather than a synthetic one. Where it's cheap, later Lab 2 test files
  should be spot-checked the same way (delete the guard/filter under test,
  confirm the suite goes red) rather than assumed correct because it's green.
- RESP-01's linked test (`MyTickets.test.tsx`) can only assert that the
  desktop table and mobile card markup both exist in the DOM with correct
  content — jsdom never applies CSS, so it cannot see which one a real
  browser actually shows at a given width, and a peer review of PR #35
  confirmed this by stripping every responsive class from the component
  and watching the test suite stay green. The *behavior* itself is real
  (confirmed by manually rendering the page inside fixed-width iframes at
  desktop/tablet/mobile and screenshotting each —
  `artifacts/lab-02/screenshots/my-tickets/{desktop,tablet,mobile}-list.png`),
  but that verification is manual, not automated, and RESP-01's Pass status
  rests on it rather than on the linked test alone. RESP-02 (Issue 9) is
  the eventual automated, Playwright-based version of this same check.
- Ticket Detail's `id asc` attachment-ordering tiebreak (Issue 8) has a real
  limitation its own test can't get around: for freshly-inserted rows, id
  order and insertion order are the same thing, so a black-box test built
  from ordinary creates can't prove the tiebreak clause itself is what's
  producing the result — removing `{ id: "asc" }` and re-running the suite
  still passes (mutation-tested; confirmed). Kept anyway on the merits (an
  `ORDER BY` with no fully-determining key has no defined tie order per the
  SQL standard, whatever one query happens to return today).
  This is *not* a general property of ordering tiebreaks, and an earlier
  version of this note wrongly claimed the ticket list's `id desc` tiebreak
  (Issue 7, BR-17) shared the same limitation "confirmed by mutation-testing
  both" — that second mutation test was never actually run at the time; the
  claim was extrapolated from Issue 8's result rather than checked. It
  doesn't hold: that test asserts **descending** id order against a
  three-way tie, while Postgres's incidental scan order for untouched rows
  is ascending (insertion order) — so removing `{ id: "desc" }` flips the
  observed order away from what the test expects, and the suite genuinely
  catches it (verified directly: reverting the clause fails that one test,
  145/146). The distinguishing factor is direction, not tiebreaks in
  general: a tiebreak asserting the *same* direction as insertion order is
  the untestable case; asserting the opposite direction is a real test.
- The mobile touch-target fix (Issue 8: `min-height: 44px` on every button,
  `.zg-actions-stack` for full-width primary-action rows, both scoped
  inside `@media (max-width: 767.98px)`) is another CSS claim no automated
  test can reach — jsdom never computes a real box height, so nothing in
  `AttachmentSection.test.tsx` or elsewhere references `44` or
  `zg-actions-stack`. Same resolution as RESP-01: manual evidence, not an
  automated one. `artifacts/lab-02/screenshots/ticket-detail/mobile-view.png`
  and `mobile-remove-confirm.png` show the fix rendered at 375px (Download/
  Remove sized up, the removal modal's Cancel/Remove Attachment stacked
  full-width); measured via `getBoundingClientRect()` at capture time, every
  button was exactly 44px tall, and the modal's stacked buttons were 277px
  wide each — the container's full width. `CreateTicket.tsx` and
  `RequesterSelector.tsx` also gained `.zg-actions-stack` in the same
  change, so their **already-committed** mobile screenshots
  (`artifacts/lab-02/screenshots/create-ticket/`) now predate the fix and
  no longer reflect those two screens' current mobile button layout —
  flagged, not silently re-captured, since re-shooting Issue 5's evidence
  under Issue 8's PR would rewrite another issue's already-reviewed record
  without that issue's own review cycle.
- The E2E-01 journey spec's first real run against the `mobile` project
  surfaced three real bugs in the *spec itself*, not the app: `AppShell`
  collapses nav links behind a "Menu" toggle below 768px, so a bare nav
  click timed out; and `MyTickets.tsx` renders both a desktop `<table>` and
  mobile `<div data-testid="my-tickets-cards">` simultaneously by design
  (RESP-01), so an unscoped `.first()`/`.getByText()` locator resolved to
  the hidden desktop element rather than the visible mobile one, twice
  (the search input and the ticket row). All three were fixed in the spec
  (`clickNavControl`, `searchInput`, `ticketRowLocator` helpers in
  `e2e/lab-02/requester-ticket-flow.spec.ts`), then the full 3-project run
  was repeated to confirm: 3 passed.
- The same first run also surfaced a real gap: E2E-01 creates a genuine
  ticket and uploads a genuine attachment through the actual app each time
  it runs, and had no teardown, so every local run permanently added rows
  to the shared dev database and files to `server/uploads/` — the same
  class of bug PR #36's review caught and fixed in
  `ticket-detail.api.test.ts`'s `afterAll`, just in a new file this
  session hadn't added cleanup to yet. There's no app route to delete a
  ticket through (requesters can only soft-remove an attachment, BR-36),
  so `e2e/lab-02/globalTeardown.ts` connects directly to the same Postgres
  instance instead (`pg`, wired via `playwright.config.ts`'s
  `globalTeardown`) and deletes by the summary this spec always writes,
  once after all three projects finish. Verified two ways: 8 tickets and
  8 files that had accumulated across this session's earlier debugging
  runs were confirmed and removed by hand first, then a fresh 3-project
  run was executed and independently queried afterward (not just trusting
  the teardown's own log line) — 0 tickets, 0 files remained.
