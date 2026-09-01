# Lab 2 Sprint Engineering Specification — Tok TickIT Requester Ticketing MVP

**Sprint:** Lab 2 · **Status:** Draft for review (Issue 1, `feature/1-doc-prep`)
**Owner:** WirachatTH

---

## 1. Sprint Goal

Deliver a working, testable Requester-facing ticketing experience: a Requester picks
a temporary Development identity, creates an IT support ticket with optional
attachments, and can find, open, and manage that ticket afterward — with the backend
guaranteeing that no Requester can see or touch another Requester's data. The Zen
Green visual and component conventions established here become the foundation every
later sprint reuses.

## 2. Stakeholder Request Interpretation

The IT department wants a real intake channel before they will accept live support
requests. Concretely, a Requester must be able to: describe a problem with enough
structure (category, related system, priority, summary, description) for staff to
triage it later; attach evidence (screenshots, error PDFs); get a ticket number they
can reference; and come back later to search their own history and inspect what they
submitted. Because real login isn't built until Lab 3, we simulate "who is using the
app" with a Development Requester Selector — explicitly presented as a test harness,
not a security boundary. The one hard security-shaped requirement we *do* own this
sprint is data isolation: Requester A must never be able to read or modify Requester
B's tickets or attachments, even though "authentication" itself doesn't exist yet.

## 3. Scope

### Included
- Development Requester Selection screen (testing mechanism) and Change Requester flow.
- Create Ticket: full form, validation, attachment selection, submission, Ticket Number generation.
- My Tickets: Requester-owned, paginated, searchable, filterable, sortable ticket list.
- Requester Ticket Detail: read-only ticket view plus attachment management (add, download, soft-remove).
- Attachment lifecycle: upload, metadata retrieval, download, soft removal.
- Ownership protection at the API layer for every Ticket/Attachment operation.
- Zen Green Theme: shared tokens and reusable form/list/badge/validation/loading/empty/error components.
- Reference data endpoints (Categories, Related Systems, active Requesters) backing the above.

### Explicitly excluded
- Authentication and security: login, logout, passwords, hashing, sessions, tokens, real role-based authorization. The Selector is a testing convenience, not an auth boundary, and must never be described or implemented as one.
- IT Staff workflow: staff dashboard/queue, claiming/reassigning tickets, IT Priority, any ticket-owner-only function.
- Ticket collaboration/work tracking: Public Comments, Internal Notes, Actions Taken.
- Ticket lifecycle beyond creation: every ticket stays in `NEW` status this sprint; no resolve/close/reopen/cancel.
- Administration: management of Requesters, roles, or reference data (Categories/Related Systems are seeded, not admin-editable this sprint).

## 4. Functional Requirements

| ID | Requirement |
| :--- | :--- |
| FR-01 | The system provides a Development Requester Selection screen listing only active Requesters, from which the Requester chooses their testing identity before any ticket screen is usable. |
| FR-02 | The application shell displays the currently selected Requester's name and offers a Change Requester action from every screen. |
| FR-03 | The system provides a Create Ticket screen that captures Category, Related System, Summary, Requested Priority, Description, and 0–5 Attachments, and displays the system-generated Ticket Number, Ticket Date, and Requester as read-only. |
| FR-04 | On valid submission, the backend creates exactly one Ticket record, assigns a unique backend-generated Ticket Number, defaults Current Status to `NEW`, and returns the created Ticket including its number. |
| FR-05 | The system validates all Create Ticket input on both the frontend (immediate feedback) and the backend (source of truth), rejecting invalid submissions without creating a Ticket. |
| FR-06 | The system provides a My Tickets screen listing only the selected Requester's own Tickets, with search, filtering, sorting, and pagination. |
| FR-07 | The system provides a Requester Ticket Detail screen showing one Ticket's full read-only information and its Attachments, reachable only by the Ticket's owner. |
| FR-08 | The system allows the Requester to add a permitted Attachment to an existing, owned Ticket, subject to the same type/size/count rules as Create Ticket. |
| FR-09 | The system allows the Requester to soft-remove an Attachment they own, with a required reason, after which the file is no longer downloadable or previewable but its metadata remains visible. |
| FR-10 | The system allows the Requester to download any of their own Tickets' active (non-removed) Attachments. |
| FR-11 | Every Ticket- and Attachment-scoped API endpoint enforces ownership server-side, independent of what the UI does or doesn't show. |
| FR-12 | The system exposes read-only reference-data endpoints for active Categories, active Related Systems, and active Development Requesters, consumed by the Create Ticket and Selector screens. |
| FR-13 | The system presents consistent loading, empty, no-results, and error states across the Selector, Create Ticket, My Tickets, and Ticket Detail screens. |
| FR-14 | The system remains usable and visually correct at desktop (≥992px), tablet (768–991px), and mobile (<768px) viewport widths on all four screens. |

## 5. Business Rules

### Ticket defaults and system-generated values
| ID | Rule |
| :--- | :--- |
| BR-01 | The official Ticket Number is generated by the backend after the database assigns the Ticket's internal identity, formatted `TCK-######` (zero-padded 6-digit sequence), and is guaranteed unique because it derives from a database identity column rather than an application-level counter. |
| BR-02 | A new Ticket begins with Current Status `NEW`, and Current Status is not client-settable at creation. |
| BR-03 | Lab 2 uses a Development Requester selector instead of login. The selected identity is for testing only and is not authentication; it must never be presented to the user as a login screen. |
| BR-04 | Ticket Date is the server's `createdAt` timestamp at the moment of successful creation, stored in UTC and localized only for display. |
| BR-05 | Requested Priority defaults to `MEDIUM` when the Requester does not change it, and must be one of `LOW`, `MEDIUM`, `HIGH`. |

### Requester selection and switching
| ID | Rule |
| :--- | :--- |
| BR-06 | Only Requesters with `isActive = true` appear in the Development Requester Selector. |
| BR-07 | The selected Requester's ID is persisted in the browser (`localStorage`) and sent as the `X-Dev-Requester-Id` header on every Requester-scoped API request; this header is a Lab 2 testing convenience only and carries no cryptographic guarantee. |
| BR-08 | Selecting "Change Requester" clears the stored selection and returns the user to the Selector; no Requester-scoped screen may be entered without a current selection. |
| BR-09 | Changing the selected Requester immediately invalidates and reloads all Requester-scoped data (My Tickets, any open Ticket Detail) — no data from the previous Requester remains visible. |
| BR-10 | If the `X-Dev-Requester-Id` header references a Requester that no longer exists or has `isActive = false`, every Requester-scoped endpoint rejects the request (`401`) rather than silently proceeding. |

### Ticket ownership
| ID | Rule |
| :--- | :--- |
| BR-11 | A Ticket belongs to exactly one Requester, set at creation from the current Development Requester selection and immutable afterward. |
| BR-12 | A Requester may only retrieve, list, or modify Tickets and Attachments they own. |
| BR-13 | An ownership failure on a Ticket or Attachment endpoint returns `404`, identical to a nonexistent resource, so a non-owner cannot distinguish "not yours" from "doesn't exist" (prevents ID enumeration). |

### Search, filtering, sorting, and pagination
| ID | Rule |
| :--- | :--- |
| BR-14 | My Tickets search matches Ticket Number (prefix, case-insensitive) or Summary (substring, case-insensitive); an empty or whitespace-only search string is treated as no search. |
| BR-15 | My Tickets supports filtering by Category, Related System, and Requested Priority, independently and in combination with search. |
| BR-16 | My Tickets supports sorting by `createdAt`, `updatedAt`, `ticketNumber`, `summary`, or `requestedPriority`, ascending or descending. |
| BR-17 | When no sort is specified, results default to `createdAt` descending (newest first), with `id` descending as a stable secondary tiebreaker. |
| BR-18 | Pagination defaults to page 1 of 10 items per page; the client may request a page size up to a maximum of 50. |
| BR-19 | Invalid or out-of-range pagination/sort parameters are clamped to the nearest valid value (e.g. negative page → 1, oversized page size → 50, unknown sort field → default) rather than producing an error — a list endpoint always returns a best-effort valid page. |

### Validation and duplicate-submission prevention
| ID | Rule |
| :--- | :--- |
| BR-20 | Summary is required, trimmed of leading/trailing whitespace, and must be 5–120 characters after trimming. |
| BR-21 | Description is required, trimmed, and must be 20–2000 characters after trimming. |
| BR-22 | Category and Related System are required and must reference an existing row; Related System must additionally be `isActive = true` at submission time. |
| BR-23 | All Create Ticket validation enforced on the frontend is re-enforced on the backend; the backend is the source of truth and never trusts client-side validation alone. |
| BR-24 | The Submit button is disabled for the duration of an in-flight submission, guaranteeing at most one `POST /api/tickets` request per click sequence. |
| BR-25 | Text fields are stored and re-rendered safely (HTML-escaped) so that submitted content can never execute as script in any later view of the Ticket. |
| BR-26 | `requestedPriority` and any other enum-typed field is validated against its fixed allowed-value list server-side; a value outside that list is rejected with `400` even if it could not have come from the UI's own controls. |

### Failure behavior and data retained after errors
| ID | Rule |
| :--- | :--- |
| BR-27 | If ticket creation fails for any reason (validation, network, or server error), all values the Requester had typed or selected — including already-chosen valid attachments — remain present in the form afterward. |
| BR-28 | If the backend is unreachable or returns an unexpected error, the UI shows a safe, generic failure message and never exposes internal error detail (stack traces, SQL, file paths). |
| BR-29 | A failed submission never creates a partial Ticket: creation is all-or-nothing across the Ticket row and any attachments submitted with it (see BR-38). |

### Attachment upload, download, and soft removal
| ID | Rule |
| :--- | :--- |
| BR-30 | Allowed Attachment types are JPG, JPEG, PNG, WEBP, and PDF, verified server-side by inspecting file content/signature, not merely the filename extension or client-declared MIME type. |
| BR-31 | Maximum Attachment size is 5 MB (5 × 1024 × 1024 bytes) per file; a file of exactly 5 MB is accepted, and 5 MB + 1 byte is rejected. |
| BR-32 | A Ticket may have at most 5 *active* (non-removed) Attachments at any time; this limit is enforced against concurrent uploads, not just sequential ones. |
| BR-33 | Each Attachment stores its original filename as display metadata, but is written to disk under a generated, collision-proof, path-traversal-safe filename unrelated to the original. |
| BR-34 | Soft removal requires a non-empty removal reason (3–200 characters, trimmed) and an explicit confirmation step in the UI; a single click can never remove an Attachment. |
| BR-35 | A soft-removed Attachment sets `isRemoved = true`, records `removedAt` and `removedReason`, and is never physically deleted from storage during Lab 2. |
| BR-36 | A soft-removed Attachment's metadata (filename, size, upload date, removal reason) remains visible on the owning Ticket; its download/preview action is unavailable. |
| BR-37 | Attempting to download a soft-removed Attachment, or one belonging to a Ticket the current Requester does not own, returns `404`. |
| BR-38 | Attachments submitted together with a new Ticket are transactional with that Ticket: the Ticket's database row and its initial Attachments' database rows commit together, and any file that fails to write to disk during creation causes the whole creation to roll back (no Ticket, no partial Attachments, no orphaned files) — the Requester sees a failure state under BR-27/BR-28 and may retry. |
| BR-39 | An Attachment added later via Ticket Detail (after the Ticket already exists) uses the same upload endpoint and validation as Create Ticket, but its failure only fails that single upload — the Ticket itself is never affected. |
| BR-40 | A Ticket may be created with zero Attachments; Attachments are optional. |

### Inactive Requesters
| ID | Rule |
| :--- | :--- |
| BR-41 | An inactive Requester (`isActive = false`) never appears in the Development Requester Selector. |
| BR-42 | Deactivating a Requester does not alter, hide, or delete any Ticket or Attachment they already own; only their eligibility to be newly *selected* changes. |

### Empty and no-results states
| ID | Rule |
| :--- | :--- |
| BR-43 | If the selected Requester owns zero Tickets, My Tickets shows a distinct empty state (with a Create Ticket call to action), not a blank list or a "0 results" phrased identically to a filtered search. |
| BR-44 | If a search/filter combination matches zero of the Requester's existing Tickets, My Tickets shows a no-results state distinct in wording from the empty state, and offers a way to clear filters. |

### Ticket Detail access
| ID | Rule |
| :--- | :--- |
| BR-45 | Ticket Detail is reachable only for a Ticket the current Requester owns; any other Ticket ID (nonexistent or owned by someone else) returns `404` and the UI shows a safe not-found state. |
| BR-46 | Ticket Detail never renders Public Comments, Internal Notes, Actions Taken, or any status-change control, regardless of the Ticket's data — those features do not exist in Lab 2's data model or UI. |

### Transition to real authentication (Lab 3)
| ID | Rule |
| :--- | :--- |
| BR-47 | The `RequesterUser` model and the `X-Dev-Requester-Id` mechanism are designed to be replaced, not extended, by Lab 3: Lab 3 introduces real sessions/tokens that supply the authenticated identity, and the header-based mechanism is removed rather than layered underneath real auth. |
| BR-48 | No password, credential, or session field exists on `RequesterUser` in Lab 2; adding one prematurely is out of scope and must not be done "for later convenience." |

## 6. UI Specification Summary

Full detail lives in `docs/lab-02/ui-spec.md`; this section summarizes what it must cover.

- **Application shell**: TokTickIT identity/header in Primary Green, My Tickets and Create Ticket navigation, current Requester name display, Change Requester action, responsive nav that collapses below 768px, and a visible active-page indicator.
- **Development Requester Selection**: title, "testing only" explanatory copy (§8.1 suggested text), dropdown of active Requesters, Continue button, loading/empty/failure states, fully keyboard operable.
- **Create Ticket**: system-generated fields (Ticket Number, Ticket Date, Requester) shown read-only near the top in soft gray-green/ivory shading; classification fields (Category, Related System, Requested Priority) grouped together; Summary and Description given generous width; Attachments below the main fields with per-file validation feedback; primary (Submit) and secondary (Cancel/Reset) actions at the bottom; Submit shows a busy state and disables while in flight; success view shows the generated Ticket Number and a "View Ticket" / "Create Another" next action.
- **My Tickets**: search box, Category/Related System/Priority filters, sort control, pagination, Create Ticket call-to-action, desktop table (Ticket Number, Summary, Category, Requested Priority, Current Status, Last Updated) and mobile card equivalent, loading/empty/no-results/failure states.
- **Ticket Detail**: read-only header fields grouped separately from an Attachment section; attachment list distinguishes active (download + soft-remove controls) from removed (metadata only); Add Attachment control; badges for Requested Priority and Current Status.
- **Shared component rules**: labels above controls; red asterisk plus adjacent inline message for required fields, never asterisk alone; one consistent control height, with Description tall and resizable only within the layout's limits; every icon-only control has an accessible label and tooltip; disabled controls are visually distinct and inert; focus indicators are always visible; badges use consistent color/label pairs for the same value everywhere.
- **Responsive rules**: desktop ≥992px multi-column, centered with a sensible max-width; tablet 768–991px two-column where practical; mobile <768px fields stack vertically with touch-friendly buttons; no horizontal scroll and no clipped/overlapping content at any size.

## 7. Data Changes

All models live in `server/prisma/schema.prisma`. `Category` already exists from Lab 1
and is extended only by its new relation to `Ticket`.

| Model | Key Fields | Notes |
| :--- | :--- | :--- |
| `RequesterUser` | `id` (PK), `name`, `email` (unique), `isActive` (bool, default `true`), `createdAt` | New. Testing-only identity; see BR-47/48. |
| `RelatedSystem` | `id` (PK), `name` (unique), `isActive` (bool, default `true`), `createdAt` | New. Seed only inserts active rows. |
| `Category` | `id` (PK), `name` (unique), `createdAt` | From Lab 1. No admin deactivation in Lab 2 (see §11 Decision D-1); `GET /api/categories` returns all rows. |
| `Ticket` | `id` (PK), `ticketNumber` (unique, derived from `id` per BR-01), `requesterId` (FK → RequesterUser), `categoryId` (FK → Category), `relatedSystemId` (FK → RelatedSystem), `summary`, `description`, `requestedPriority` (enum `LOW`/`MEDIUM`/`HIGH`, default `MEDIUM`), `currentStatus` (enum, default `NEW`; only `NEW` reachable in Lab 2), `createdAt`, `updatedAt` | New. |
| `Attachment` | `id` (PK), `ticketId` (FK → Ticket), `originalFilename`, `storedFilename` (unique), `mimeType`, `sizeBytes`, `uploadedAt`, `isRemoved` (bool, default `false`), `removedAt` (nullable), `removedReason` (nullable) | New. Soft-removal fields per BR-35/36. |

### 7.1 Relationships
- `RequesterUser` 1—N `Ticket` (`Ticket.requesterId`, required, restrict on delete).
- `Category` 1—N `Ticket` (`Ticket.categoryId`, required, restrict on delete).
- `RelatedSystem` 1—N `Ticket` (`Ticket.relatedSystemId`, required, restrict on delete).
- `Ticket` 1—N `Attachment` (`Attachment.ticketId`, required, cascade on delete — Lab 2 never deletes a Ticket, so this only guards test/dev cleanup).

### 7.2 Indexes and constraints
- Unique: `RequesterUser.email`, `RelatedSystem.name`, `Ticket.ticketNumber`, `Attachment.storedFilename`.
- Indexes: `Ticket(requesterId)` (every list/detail query filters on it first), `Ticket(requesterId, createdAt)` composite (supports the default sort within the ownership scope), `RequesterUser(isActive)` and `RelatedSystem(isActive)` (Selector/reference-data queries filter on these), `Attachment(ticketId, isRemoved)` composite (Detail screen's active/removed split).
- Foreign keys use `onDelete: Restrict` for `Ticket`'s three parent relations — a real IT department must never lose ticket history because a reference row was removed; deletion of in-use reference data is deliberately blocked rather than silently cascading.

### 7.3 Justified design decision
**Decision:** `Ticket.ticketNumber` is derived from the database identity column
(`TCK-######`) rather than generated by a separate counter table or a random string.
**Justification:** Postgres identity columns are inherently race-safe under concurrent
inserts (see BR-01, tested by API-5.9/API-5.10 in `tests.md`), which a hand-rolled
"count existing tickets + 1" scheme is not. It also keeps the number monotonically
informative (roughly chronological) without needing a second unique-generation
mechanism to maintain and test separately.

## 8. API Contract

Full request/response shapes, status codes, and error cases are documented in
`docs/lab-02/api-spec.md`. This section lists the 9 required capabilities and their
routes.

| Capability | Route |
| :--- | :--- |
| Retrieve active Categories | `GET /api/categories` |
| Retrieve active Related Systems | `GET /api/systems` |
| Retrieve active Development Requesters | `GET /api/requesters` |
| Create a Ticket (with optional attachments) | `POST /api/tickets` |
| Retrieve the selected Requester's Tickets | `GET /api/tickets` |
| Retrieve one owned Ticket | `GET /api/tickets/:id` |
| Upload an Attachment to an owned Ticket | `POST /api/tickets/:id/attachments` |
| Retrieve Attachment metadata | `GET /api/tickets/:ticketId/attachments/:attachmentId` |
| Download an active Attachment | `GET /api/tickets/:ticketId/attachments/:attachmentId/download` |
| Soft-remove an Attachment | `PATCH /api/tickets/:ticketId/attachments/:attachmentId/remove` |

Every route above except the three reference-data `GET`s requires the
`X-Dev-Requester-Id` header (BR-07); its absence or invalidity is a `401`.

## 9. Acceptance Criteria

| ID | Criterion |
| :--- | :--- |
| AC-01 | Given valid Ticket data, when the Requester submits Create Ticket, then exactly one Ticket is saved and the official Ticket Number is displayed. |
| AC-02 | Given no Development Requester is selected, when the user attempts to open My Tickets, Create Ticket, or a Ticket Detail URL, then the Requester Selection screen is shown instead. |
| AC-03 | Given Requester B is selected, when a Ticket or Attachment belonging to Requester A is requested directly by ID, then no data is returned and the response is `404`. |
| AC-04 | Given the Summary or Description is missing or outside its length limit, when the Requester submits, then the ticket is not created, `POST /api/tickets` is not called from the UI for an empty required field, and an inline message appears next to the offending field. |
| AC-05 | Given the backend is unreachable during submission, when the Requester submits Create Ticket, then a safe failure message is shown and every previously entered field/attachment remains in the form. |
| AC-06 | Given a file larger than 5 MB or of a disallowed type, when the Requester selects it as an attachment, then it is rejected with a clear message and never uploaded. |
| AC-07 | Given a Ticket already has 5 active Attachments, when the Requester attempts to add a 6th, then the addition is rejected. |
| AC-08 | Given an active Attachment on an owned Ticket, when the Requester soft-removes it with a reason, then it becomes non-downloadable, its metadata remains visible, and its removal reason is stored. |
| AC-09 | Given a soft-removed Attachment, when anyone attempts to download it directly, then the request is rejected. |
| AC-10 | Given Requester A has Tickets and Requester B is then selected, when My Tickets loads, then only Requester B's Tickets (zero, if none) are shown — Requester A's Tickets never appear. |
| AC-11 | Given a search term matching an existing Ticket's Summary, when the Requester searches My Tickets, then only matching Tickets are returned, case-insensitively. |
| AC-12 | Given more Tickets than one page size, when the Requester paginates, then each page returns the correct, non-overlapping slice with accurate pagination metadata. |
| AC-13 | Given the selected Requester owns zero Tickets, when My Tickets loads, then a distinct empty state is shown; given a search/filter matches zero of their existing Tickets, then a distinct no-results state is shown instead. |
| AC-14 | Given only active Development Requesters exist in the dropdown, when the Selector loads, then the seeded inactive Requester never appears as an option. |
| AC-15 | Given the Requester rapidly clicks Submit multiple times, when Create Ticket processes the click, then exactly one Ticket is created. |

## 10. Definition of Done

**Part 1 — Product completion**
- [ ] All planned tests in `docs/lab-02/tests.md` pass from the documented commands, on the final `main` branch. *(Pending Issue 10's release — currently verified green on `lab2-staging`, not yet `main`.)*
- [x] Every AC-## above has at least one passing, traceable automated test.
- [x] No planned test is skipped, disabled, or commented out.
- [x] Every implemented screen and endpoint matches this specification, `api-spec.md`, and `ui-spec.md` — any deviation is reflected back into these docs, not left undocumented.
- [x] README setup/run/test instructions are current and were verified on a clean checkout.

**Part 2 — Course delivery**
- [ ] All Lab 2 work happened on feature branches merged via peer-reviewed PRs into `lab2-staging`, then one release PR into `main`. *(Feature branches/PRs done; the `lab2-staging → main` release PR is Issue 10's own remaining step.)*
- [x] Peer review comments and responses are recorded in `docs/lab-02/reviewer.md`.
- [x] `docs/lab-02/specification.md`, `tests.md`, `ui-spec.md`, `api-spec.md`, `reviewer.md`, `ai-use.md` all exist and are current.
- [ ] The GitHub Project board shows every Lab 2 Issue in Done. *(Issues 1–9 are Done; Issue 10 itself is still Started.)*
- [ ] The required PDF evidence (Answer Part 1–9) is assembled and submitted.

## 11. Assumptions and Decisions

| ID | Decision | Rationale |
| :--- | :--- | :--- |
| D-1 | `Category` gains no `isActive` field in Lab 2; `GET /api/categories` returns all 4 seeded rows, treated as "active" by definition. | Administration (which would let staff deactivate a Category) is explicitly out of scope this sprint, and the 4 categories are fixed by the labsheet. Adding a field with no way to ever set it to `false` would be speculative complexity with no behavior behind it. |
| D-2 | Ownership failures (`AC-03`) and removed-attachment downloads both return `404`, never `403`. | Returning `403` on a mismatched owner confirms the resource exists, which is itself a data leak between Requesters. `404` for "not found" and "not yours" are made indistinguishable on purpose. |
| D-3 | The selected Requester is transmitted as an `X-Dev-Requester-Id` request header rather than a route/query parameter. | Keeps every Requester-scoped endpoint's URL shape clean and identical regardless of who's asking, and makes the eventual Lab 3 swap (header → derived-from-session) a one-line change in one place (middleware) instead of a signature change across every route. |
| D-4 | Ticket creation and its initial attachments are one atomic operation (BR-38); attachments added later are independent per-file operations (BR-39). | Matches how a real user experiences the two flows differently: "submit my ticket" should not partially succeed, while "add one more file to an existing ticket" naturally is a single, independent action. |
| D-5 | List-endpoint query parameters are clamped to safe defaults rather than rejected with `400` (BR-19), while body-payload validation on create/upload endpoints does return `400`. | A mistyped or stale bookmarked list URL should still show *something* useful; a malformed create/upload payload should fail loudly so the Requester knows their data wasn't saved. |
