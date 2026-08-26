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
| UNIT-01 | BR-01 | Unit | Ticket Number derivation from DB identity | Returns `TCK-######`, unique under concurrent inserts | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-01 | AC-01, FR-04 | API | `POST /api/tickets` with fully valid body | `201`, one Ticket persisted, `ticketNumber` in response matches DB | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-02 | AC-04, BR-20 | API | `POST /api/tickets` missing/blank Summary | `400 VALIDATION_ERROR`, no row created | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-03 | AC-04, BR-21 | API | `POST /api/tickets` Description over 2000 chars | `400 VALIDATION_ERROR`, no row created | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-04 | BR-20, BR-21 | API | Summary/Description at exactly the length limit vs. limit+1 | Exactly-at-limit accepted, limit+1 rejected | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-05 | BR-20 | API | Summary containing only whitespace | Rejected as empty after trimming | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-06 | BR-10 | API | `POST /api/tickets` with invalid/inactive `X-Dev-Requester-Id` | `401 UNAUTHENTICATED`, no row created | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-07 | BR-25 | API/Security | `<script>` payload in Description | Stored safely, escaped on render, never executes | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-08 | BR-26 | API/Security | `requestedPriority` set to a value outside the enum via direct API call | `400 VALIDATION_ERROR`, not coerced or stored | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-09 | AC-15, BR-01 | API | Concurrency: many simultaneous `POST /api/tickets` (burst) | Every `ticketNumber` returned is unique, no collisions | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| UI-01 | AC-04 | UI | Submit with an empty required field | Inline message near the field; no network request fires | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-02 | AC-15, BR-24 | UI | Rapid repeated clicks on Submit | Exactly one request reaches the server | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-03 | AC-01 | UI | Successful submit | Success view shows the generated Ticket Number and next action | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-04 | AC-05, BR-27, BR-28 | UI | Simulated backend failure during submit | Safe error state shown; all field values and attachments preserved | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-05 | AC-06, BR-30, BR-31 | UI | Select an oversized or disallowed-type file | Rejected client-side with a clear inline reason, never uploaded | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-06 | AC-07, BR-32 | UI | Attempt to select a 6th attachment | Rejected client-side before submission | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| STYLE-01 | UI Spec §3 | UI Style | Read-only fields (Ticket Number/Date/Requester) vs editable fields | Distinct `zg-field--readonly` styling applied | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| API-10 | AC-10, BR-12 | API | `GET /api/tickets` as Requester A vs Requester B | Each sees only their own Tickets | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-11 | BR-12 | API/Security | Attempt to widen scope via query manipulation | Server ignores it — always scoped to the header identity | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-12 | AC-11, BR-14 | API | Search matching a known Summary substring | Matching Ticket(s) returned, case-insensitive | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-13 | BR-15 | API | Category/Related System/Priority filters, individually and combined with search | Results narrow correctly in each case | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-14 | BR-16, BR-17 | API | Sort by each documented field, both directions; no sort specified | Correct order each time; default `createdAt desc` when unspecified | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-15 | AC-12, BR-18 | API | Pagination across page 1, a middle page, and the final partial page | Correct page size/slice and accurate `pagination` metadata | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-16 | BR-19 | API | Invalid query params (`page=-1`, `page=abc`, unknown `sort`) | Clamped to safe defaults, never `400`/crash | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-17 | BR-14 | API/Security | Search string with SQL-meaningful characters (`' OR '1'='1`) | Treated as a literal term (parameterized query), no injection | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-18 | BR-18 | API | Client requests an oversized `pageSize` | Clamped to the documented maximum (50) | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| UI-07 | AC-13, BR-43 | UI | Requester with zero Tickets ever | Distinct empty state with Create Ticket CTA | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-08 | AC-13, BR-44 | UI | Search/filter matches zero of the Requester's existing Tickets | Distinct no-results state, Clear Filters offered | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-09 | AC-10, BR-09 | UI | Switch selected Requester A → B while on My Tickets | List reloads to B's Tickets; no stale A data | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| RESP-01 | UI Spec §6.4, §8 | Responsive | My Tickets at desktop/tablet/mobile widths | Table → reduced table → card view; no horizontal scroll | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| API-19 | AC-03, BR-45 | API | `GET /api/tickets/:id` as the owning Requester vs. a different Requester | Owner gets `200` + full data; non-owner gets `404`, no data leaked | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-20 | BR-45 | API | `GET /api/tickets/:id` for a nonexistent ID | Safe `404`, no internal detail leaked | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-21 | AC-03 | API/Security | `:id` supplied malformed (`"abc"`, injection-shaped string) | Safe `400`/`404`, no server error | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| UI-10 | BR-46 | UI | Render Ticket Detail for any Ticket | No comment box, internal note field, or status-change control present | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pending |
| UI-11 | AC-03 | UI | Deep-link directly to a Ticket Detail URL not owned by the current Requester | Safe not-found state, no data rendered | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pending |
| API-22 | BR-30 | API | Upload one file of each allowed type (JPG/JPEG/PNG/WEBP/PDF) | `201`, metadata returned for each | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-23 | BR-31 | API | File at exactly 5 MB vs. 5 MB + 1 byte | Exactly-5MB accepted, +1 byte rejected `413` | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-24 | AC-06, BR-30 | API | Disallowed type, including a spoofed extension | `415`, rejected by real content inspection not filename | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-25 | AC-07, BR-32 | API | 6th active attachment on a Ticket that already has 5 | `409 CONFLICT` | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-26 | BR-32 | API | 5 concurrent uploads to a Ticket with 0 active attachments | Exactly 5 succeed even under a race | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-27 | AC-08, BR-34 | API | Soft-remove without a reason vs. with a valid reason | Without: `400`; with: `200`, `isRemoved=true`, reason stored | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-28 | AC-09, BR-37 | API | Download a soft-removed Attachment | `404`, no bytes returned | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-29 | BR-36 | API | Metadata retrieval for a removed Attachment | Filename/size/date/reason still visible | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-30 | AC-03 | API/Security | Download/remove an Attachment belonging to another Requester's Ticket | `404` for every operation, not just read | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-31 | BR-34 | API | Soft-remove an already-removed Attachment | `409 CONFLICT`, idempotent — no double removal record | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-32 | BR-33 | API/Security | Filename with path-traversal characters (`../../etc/passwd`) | Stored safely under a generated safe filename; filesystem unaffected outside the upload directory | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-33 | BR-38 | API | Simulated disk failure after the Ticket row is committed, during creation | Whole creation rolls back — no orphaned Ticket/Attachment/file | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-34 | BR-39 | API | Attachment added later via Ticket Detail fails | Only that upload fails; Ticket itself is unaffected | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| UI-12 | AC-08 | UI | Click soft-remove on an attachment | Requires entering a reason + explicit confirmation before it takes effect | `client/tests/lab-02/AttachmentSection.test.tsx` | Pending |
| UI-13 | BR-36 | UI | View a removed attachment | Shown as metadata only, no download/preview control | `client/tests/lab-02/AttachmentSection.test.tsx` | Pending |
| UI-14 | UI Spec §6.5 | UI | Ticket with 5 active attachments | "Add Attachment" disabled with a tooltip explaining why | `client/tests/lab-02/AttachmentSection.test.tsx` | Pending |
| API-35 | BR-06 | API | `GET /api/requesters` | Returns only `isActive=true` rows | `server/tests/lab-02/requesters.api.test.ts` | Pending |
| UI-15 | AC-14, BR-06 | UI | Selector dropdown vs. seed data | Inactive seeded Requester never appears as an option | `client/tests/lab-02/RequesterSelector.test.tsx` | Pending |
| UI-16 | UI Spec §6.2 | UI | Selector with mocked empty/failure API responses | Distinct empty state and safe failure state rendered | `client/tests/lab-02/RequesterSelector.test.tsx` | Pending |
| UI-17 | AC-02, BR-08 | UI | Navigate to My Tickets/Create Ticket/Detail with no Requester selected | Redirected to the Selector | `client/tests/lab-02/RequesterSelector.test.tsx` | Pending |
| STYLE-02 | UI Spec §3, §4 | UI Style | Busy/disabled button states across the shared component library | Busy shows spinner+disabled; disabled is inert and visually distinct | `client/tests/lab-02/AppShell.test.tsx` | Pending |
| UI-18 | UI Spec §7 | Accessibility | Tab through Selector, Create Ticket, My Tickets, Ticket Detail | Every interactive control reachable with a visible focus indicator | `client/tests/lab-02/AppShell.test.tsx` | Pending |
| E2E-01 | AC-01, AC-10 | E2E | Full journey: select Requester → create ticket w/ attachment → find in My Tickets → open Detail → download → soft-remove → switch Requester → confirm isolation | Every step succeeds in order on a clean seeded DB | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| RESP-02 | UI Spec §8, §9 | Responsive | Create Ticket, My Tickets, Ticket Detail screenshot capture | Desktop/tablet/mobile screenshots show no clipping/overlap/horizontal scroll | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
| :--- | :--- |
| AC-01 | API-01, UI-03, E2E-01 |
| AC-02 | UI-17 |
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
| AC-14 | UI-15 |
| AC-15 | API-09, UI-02 |

Every AC-## in `specification.md` §9 has at least one row above; none are
uncovered. This matches DoD Part 1's "every acceptance criterion is linked to
appropriate test evidence."

## 4. Responsive and Visual Checklist

Executed and recorded once Issue 9 (`feature/9-responsive-e2e-qa`) lands — see the
checklist template already defined in `ui-spec.md` §9. Screenshot evidence path:
`artifacts/lab-02/screenshots/{create-ticket,my-tickets,ticket-detail}/`.

## 5. Test Commands

```bash
# Backend (Vitest + Supertest)
docker-compose exec server npm test

# Frontend (Vitest + Testing Library)
docker-compose exec client npm test

# E2E (Playwright — added in Issue 9)
docker-compose exec client npx playwright test ../e2e/lab-02/requester-ticket-flow.spec.ts
```

## 6. Final Results

Filled in once the corresponding issue's PR merges into `lab2-staging`, and
re-verified with a full run on `main` before submission (labsheet §14 Part 3).
Placeholder until then — no row in §2 may be marked Pass without a linked test
run's output.

## 7. Known Limitations or Deferred Tests

- Load/perf tests beyond the concurrency checks above (API-09, API-26) are
  exploratory only for this MVP scale and are not part of the graded suite.
- Cross-browser testing is limited to what Playwright's default Chromium project
  covers; no manual Safari/Firefox pass is planned for Lab 2.
