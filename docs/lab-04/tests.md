# Lab 4 Test Plan and Results

## 1. Test Strategy

Tests are planned here before implementation (Test DD). Each issue then writes its rows' tests
first, in their own commit, confirms they fail for the expected reason, and only then implements
(TDD). Every row traces to an Acceptance Criterion or a numbered rule in
`docs/lab-04/specification.md` (numbering restarts for Lab 4), and §3 shows every `AC-##` has at
least one test.

Coverage spans every type labsheet §10 names:
- unit;
- API/integration (Actions Taken and dashboards);
- authorization;
- **workflow** (the transition matrix, the resolution gate, and its race);
- migration and regression;
- **performance smoke**;
- UI component and UI style;
- responsive;
- end-to-end.

Three techniques carry the riskiest rules:
- **Matrix sweep** (SEC-01): drives all 37 routes with no session, each denied role, and each
  granted role.
- **Independent counts** (DASH-02, DASH-04, DASH-07): every dashboard value is compared with a
  separate SQL count written in the test. This is the evidence that the counts match the database.
- **Race tests** (API-16, WF-06): fire two requests at once, repeated, to show the ticket-row lock
  serialises action writes and the resolution gate.

**Test isolation.** The Lab 3 rules (Lab 3 D-22) still apply:
- Each test creates its own users and tickets under a unique prefix and removes them.
- Tests that need an exact database state run on a throwaway PostgreSQL schema that they create
  and drop: migration, seed, exact dashboard counts, the empty dashboard, and the Bangkok-midnight
  boundary.
- Dashboard tests that use the shared database compare against SQL counts taken in the same test,
  never against fixed numbers.

**Lessons carried forward.**
- A guard's test is trusted only after the guarding line is removed or inverted and the test goes
  red (the mutation pass in each PR).
- jsdom checks are backed by the Playwright desktop, tablet, and mobile projects.

File paths follow labsheet §12 (D-16), with extra files where §12 has no home: units, migration and
seed, regression, performance, navigation, drill-down, and hardening. The "Final" column reads
Planned until the issue that owns the row runs it green.

## 2. Planned Tests

### 2.1 Unit

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| UNIT-01 | AC-03, BR-06 | Unit | Action Taken text rules at their boundaries: description 0/1/2000/2001, result, follow-up note 0/1/1000/1001, attachment notes 1000/1001, cancel reason 9/10/1000/1001, all after trimming | Boundary values accepted, one past rejected with the field's message; whitespace-only counts as empty | `server/tests/lab-04/action-rules.test.ts` | Planned |
| UNIT-02 | AC-03, BR-07 | Unit | `actionAt` window: no offset, before the ticket's creation, Planned at now+365d and +366d, Completed at now+5min and +5min+1s | No-offset and pre-creation rejected; +365d Planned and +5min Completed accepted; one step past each rejected | `server/tests/lab-04/action-rules.test.ts` | Planned |
| UNIT-03 | AC-03, BR-04 | Unit | Follow-up normalisation: flag true without note, flag false with a note, flag turned off on edit | Missing note rejected; a note sent with the flag off is stored as `null`; turning the flag off clears the stored note | `server/tests/lab-04/action-rules.test.ts` | Planned |
| UNIT-04 | AC-06, BR-10, BR-13 | Unit | Action status transitions: every (from, to) pair of the 3×3 grid, and edit permission per status | Only `PLANNED → COMPLETED` and `PLANNED → CANCELLED` permitted; edit allowed only while `PLANNED` | `server/tests/lab-04/action-rules.test.ts` | Planned |
| UNIT-05 | AC-14, BR-28, BR-14 | Unit | Gate function over action sets: none; only planned; completed + planned; completed with an unhandled follow-up; follow-up handled by a completed action; follow-up whose only follow-up action was cancelled; only cancelled | Passes only for ≥1 completed, 0 planned, 0 open follow-ups; reports the three counts exactly | `server/tests/lab-04/resolution-gate.test.ts` | Planned |
| UNIT-06 | AC-21, BR-33 | Unit | Bangkok day boundaries for instants at 16:59:59.999Z, 17:00:00.000Z, and across a month and year end; the 7-day window start | "Today" starts at 17:00Z of the previous UTC day; 16:59:59.999Z belongs to the earlier Bangkok day; the 7-day window starts at 00:00 Bangkok six days back | `server/tests/lab-04/dashboard-time.test.ts` | Planned |
| UNIT-07 | AC-23, BR-38, D-13 | Unit | Status-filter parsing for My Tickets and the queue: `UNRESOLVED`, each status, unknown values | `UNRESOLVED` maps to the five BR-35 statuses; unknown values fall back to `ALL` (My Tickets) or `ACTIVE` (queue), never `400` | `server/tests/lab-04/regression.api.test.ts` | Planned |

### 2.2 API — Actions Taken

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| API-01 | AC-09, BR-24 | API | `GET /api/tickets/:id/actions-taken` on a ticket with several actions at equal and different `actionAt` | `200`, ordered `actionAt` asc then `id` asc; every §1.1 field present; identical order on three reads | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-02 | AC-07, BR-24 | API | Edit one action's `actionAt` to before the others, then list | The edited action moves to its new place; every other relative order unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-03 | AC-01, BR-03 | API | IT Staff create a valid `PLANNED` action assigned to a colleague | `201` under the correct Ticket; `createdBy` = caller, `assignee` = colleague, `performedBy` `null`, `version` 1; one `CREATED` event; ticket `updatedAt` advanced | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-04 | AC-01, BR-11 | API | IT Staff create an action directly as `COMPLETED` with a result | `201`; `performedBy` = caller, `completedAt` set; one `CREATED` event | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-05 | AC-02, BR-17 | API | Administrator creates, edits, completes, and cancels actions | Each succeeds exactly as for IT Staff | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-06 | AC-03 | API | Create with each invalid field: missing description, `COMPLETED` without result, flag without note, over-length texts, `actionAt` out of window or before the ticket's creation, unknown `status` | `400 VALIDATION_ERROR` with the matching `fields` key; no action or event stored | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-07 | AC-04, BR-08 | API | Create and edit with an inactive IT Staff assignee, a Requester, a missing id, and an inactive Administrator | Each `400` on `fields.assigneeId`; nothing stored or changed | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-08 | AC-04, BR-08 | API | An assignee is deactivated after the action is created; list it | The action keeps the assignee, shown with `isActive: false` | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-09 | AC-05, BR-22 | API | Edit a planned action's description and assignee | `200`; version 2; one `UPDATED` event whose `changes` hold exactly those two fields with old and new values | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-10 | AC-05, BR-23 | API | Edit sending the current values only | `200`; version unchanged; no new event; ticket `updatedAt` unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-11 | AC-06, BR-11 | API | Complete a planned action with a result; completing without a stored or sent result | `200` `COMPLETED`, `performedBy` = completer (not the assignee), `completedAt` set, one `COMPLETED` event; without result → `400` on `result` | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-12 | AC-06, BR-12 | API | Cancel a planned action with a 10-character reason; with a 9-character reason | `200` `CANCELLED`, `cancelledBy`, `cancelledAt`, `cancelReason` stored, one `CANCELLED` event; 9 characters → `400` on `reason` | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-13 | AC-06, BR-13 | API | Edit, complete, and cancel a `COMPLETED` action and a `CANCELLED` action | Each `409 ACTION_NOT_PLANNED`; rows and events unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-14 | AC-07, BR-22 | API | History of an action created, edited twice, then completed; then try `PUT`, `DELETE`, and `PATCH` on the history and `DELETE` on the action | History has 4 events oldest first with correct types and actors; every write attempt `404` | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-15 | AC-08, BR-25 | API | Edit with `expectedVersion` one behind; status change with a stale version; missing `expectedVersion` | Stale → `409 STALE_STATE`, row and events unchanged; missing → `400` | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-16 | AC-08, BR-25, BR-26 | API | Two edits of one action sent at once from the same version (run 10 times) | Exactly one `200` and one `409 STALE_STATE` each time; version rose by exactly 1; one `UPDATED` event | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-17 | AC-10, BR-20 | API | Create, edit, complete, and cancel on `RESOLVED`, `CLOSED`, and `CANCELLED` tickets; then list them | Writes → `409 TICKET_RESOLVED` / `TICKET_CLOSED`, nothing changed; listing `200` | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-18 | AC-11, BR-09 | API | Bodies carrying `createdById`, `performedById`, `version`, `completedAt`, `ticketId`, `status` (on edit) | Ignored: server values stand; the action stays on its ticket | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-19 | AC-12, BR-43 | API | Create twice with the same `clientRequestId`; then twice at once; then the same id from a different user | Same user: one row, first `201`, repeat `200` with the same body, one `CREATED` event; different user: a separate action | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-20 | BR-14 | API | Create with `followUpOfId` pointing to: an eligible action, a planned action, a completed action without follow-up, another ticket's action | Only the eligible one accepted; others `400` on `followUpOfId`; once the follow-up completes, `followUpHandled` is true on the original | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-21 | AC-09, BR-19 | API | Requester lists Actions Taken on their own ticket | `200` with every §1.1 field, including assignee, follow-up note, attachment notes | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-22 | BR-21 | API | Each Action Taken write, then read the ticket | Ticket `updatedAt` advanced by every create, effective edit, complete, and cancel | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |

### 2.3 Workflow

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| WF-01 | AC-13, BR-27 | Workflow | Every (from, to) pair of the 8×8 grid through `PATCH /api/staff/tickets/:id/status`, with an owner and the gate satisfied | Exactly the BR-27 pairs `200`; every other pair `409 INVALID_TRANSITION`, nothing changed | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-02 | AC-14, BR-28 | Workflow | Resolve a ticket with no actions; with only cancelled actions | `409 RESOLUTION_BLOCKED`, `details.completedCount` 0; status unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-03 | AC-14, BR-28 | Workflow | Resolve with one completed and one planned action; then complete the planned one and resolve again | First `409 RESOLUTION_BLOCKED` (`plannedCount` 1); second `200 RESOLVED` with `resolvedAt` set | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-04 | AC-14, BR-28, BR-14 | Workflow | Resolve with a completed action needing follow-up; add a completed follow-up linked to it; resolve again | First `409` (`openFollowUpCount` 1); after the follow-up, `200` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-05 | AC-14, BR-28 | Workflow | Gate order: a stale `expectedStatus` and a forbidden source status on a ticket that would also fail the gate | `STALE_STATE` and `INVALID_TRANSITION` win over `RESOLUTION_BLOCKED` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-06 | AC-15, BR-26 | Workflow | Race: a ticket with one planned action; send "complete it" and "resolve the ticket" at once (20 runs); also "add planned action" against "resolve" | Never `RESOLVED` with a `PLANNED` action: either resolve is `409` or it runs after the completion; same for the add/resolve pair | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-07 | AC-16, BR-30 | Workflow | `GET /api/staff/tickets/:id` with the gate failing, then passing; as an Administrator | `permittedTransitions` lacks `RESOLVED` while failing and includes it once passing; `resolutionGate` counts exact; Administrator sees an empty list and the gate | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-08 | BR-31 | Workflow | `resolvedAt` through RESOLVED → REOPENED → (gate) RESOLVED → CLOSED | Set on RESOLVED, cleared on REOPENED, set again, kept on CLOSED | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-09 | AC-17, BR-05 | Workflow | Requester marks "appears resolved" on a ticket with no completed actions, then IT Staff try to resolve | Status unchanged by the mark; resolve still `409 RESOLUTION_BLOCKED` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-10 | BR-32 | Workflow | Reopen a resolved ticket and resolve it again without new actions | `200`: earlier completed actions still satisfy the gate (D-14) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| WF-11 | BR-18, BR-17 | Workflow | Administrator and Requester try `PATCH …/status` | Both `403`; Lab 3 BR-39 still holds | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |

### 2.4 API — Dashboards

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| DASH-01 | AC-18, BR-36, BR-40 | API | Two Requesters with tickets in every status; each calls `GET /api/dashboard/requester`, also with `?requesterId=<other>` | Each sees only their own counts and items; the query parameter changes nothing; no `itPriority` anywhere in the body | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| DASH-02 | AC-19, BR-40 | API | Requester metrics against independent SQL counts for each BR-40 definition | Every `value` equals its SQL count; `href`s match BR-40 | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| DASH-03 | AC-19, BR-40, BR-37 | API | Requester lists: content, order, and limit with 7 matching tickets each | At most 5 items each, in BR-40 order; `recentlyResolved` only within the 7-day window | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| DASH-04 | AC-19, BR-39 | API | IT Staff metrics, `byStatus`, and `byItPriority` against independent SQL counts on a throwaway schema with known data | Every value equals its SQL count; `href`s match BR-39 | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-05 | AC-19, BR-39, D-18 | API | "My planned actions": mine vs a colleague's; on a cancelled ticket; completed and cancelled actions | Counts and lists only my `PLANNED` actions on non-terminal tickets; ordered `actionAt`, `id`; ≤5 | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-06 | AC-19, BR-39 | API | `urgent` and `recentlyUpdated` lists with 7 candidates each | ≤5 items in BR-39 order; `urgent` only Unresolved `HIGH` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-07 | AC-20, BR-41 | API | Administrator dashboard | Contains the BR-39 metrics for the Administrator and user counts equal to SQL counts per role and inactive | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-08 | AC-21, BR-33 | API | Tickets created and resolved at 16:59:59Z and 17:00:01Z around a Bangkok midnight (throwaway schema, clock fixed) | `createdToday` and `resolvedToday` count only the post-midnight ticket; the 7-day window includes and excludes at the right instants | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-09 | AC-22, BR-37 | API | All three dashboards on an empty throwaway schema, and a Requester with no tickets | `200`; every `value` 0; every list `[]`; no field missing or `null` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-10 | AC-24, BR-15 | API | Each dashboard endpoint called by the two other roles and with no session | `403 FORBIDDEN` with no metrics; `401` without a session | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| DASH-11 | AC-23, BR-38 | API | For each metric, ticket and user alike, follow its `href` query against the queue, My Tickets, or user-list API | Exact metrics, every user count included: the list's size equals the metric and it holds exactly the counted ids; the two "today" supersets: the list includes every counted ticket and is sorted by recency | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| DASH-12 | BR-42, BR-34 | API | Legacy-shaped tickets (no actions, backfilled `resolvedAt`) in the counts | Counted like any ticket; no `500`; values still equal SQL counts | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |

### 2.5 Security and authorization

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| SEC-01 | AC-36, BR-15 | Security | Matrix sweep over all 37 routes (api-spec §5): no session; each denied role; each granted role | `401`; `403` with no resource data; granted roles never `401`/`403` | `server/tests/lab-04/authorization.api.test.ts` | Planned |
| SEC-02 | AC-09, BR-18 | Security | Requester calls every Action Taken write and history route on an own ticket, another's ticket, and a missing id | All `403` with identical bodies, before any lookup | `server/tests/lab-04/authorization.api.test.ts` | Planned |
| SEC-03 | AC-09, BR-18 | Security | Requester lists Actions Taken on another Requester's ticket | `404`, identical to a missing ticket | `server/tests/lab-04/authorization.api.test.ts` | Planned |
| SEC-04 | AC-36 | Security | Each new state-changing route with a foreign `Origin` and with `Origin: null` | `403 FORBIDDEN_ORIGIN`; nothing changed | `server/tests/lab-04/authorization.api.test.ts` | Planned |
| SEC-05 | AC-36 | Security | Every route in the route-policy table has a row in api-spec §5 and the reverse; an unknown method on an action route | Tables match; unknown method `404` | `server/tests/lab-04/authorization.api.test.ts` | Planned |
| SEC-06 | AC-02, BR-17 | Security | Administrator calls owner, IT Priority, status, comment, and note routes after Lab 4 | Still `403` (Lab 3 BR-21 kept) | `server/tests/lab-04/authorization.api.test.ts` | Planned |
| SEC-07 | AC-36, BR-36 | Security | Scan every JSON response the Lab 4 suites produce | No `passwordHash`, token, `clientRequestId`, Internal Note content, or (in Requester responses) `itPriority` | `server/tests/lab-04/authorization.api.test.ts` | Planned |

### 2.6 Migration and seed

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| MIG-01 | AC-31, BR-47 | Migration | Throwaway schema with Lab 3-shaped data (every status, comments, notes, attachments); apply the Lab 4 migration | Every Lab 1–3 row and column value identical except `resolvedAt`; legacy tickets have 0 actions | `server/tests/lab-04/migration-seed.test.ts` | Planned |
| MIG-02 | AC-31, BR-47 | Migration | `resolvedAt` backfill | Equals `updatedAt` for `RESOLVED`/`CLOSED` tickets, `null` for all others; `updatedAt` itself unchanged | `server/tests/lab-04/migration-seed.test.ts` | Planned |
| MIG-03 | AC-31 | Migration | `prisma migrate diff` from the migrated throwaway schema to `schema.prisma` | No drift (`--exit-code` 0) | `server/tests/lab-04/migration-seed.test.ts` | Planned |
| MIG-04 | AC-31 | Migration | Apply up, the documented down-script, then up again | After down: the exact Lab 3 schema and data; after the second up: same as the first | `server/tests/lab-04/migration-seed.test.ts` | Planned |
| MIG-05 | BR-04, BR-11, BR-12 | Migration | Database `CHECK` constraints: a raw insert of a completed action without result, a follow-up flag without note, version 0 | Each rejected by PostgreSQL | `server/tests/lab-04/migration-seed.test.ts` | Planned |
| MIG-06 | AC-32, BR-48 | Migration | Run the seed twice on a throwaway schema | Second run creates nothing; action and event counts identical; no existing action changed | `server/tests/lab-04/migration-seed.test.ts` | Planned |
| MIG-07 | AC-32, BR-49 | Migration | Seed content | Tickets with 0, 1, and ≥4 actions; every action and ticket status; a handled and an open follow-up; every `RESOLVED`/`CLOSED` ticket passes the gate; an IT Staff with zero and one with non-zero dashboard metrics | `server/tests/lab-04/migration-seed.test.ts` | Planned |

### 2.7 Regression (Labs 1–3) and hardening

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| REG-01 | AC-33, BR-46 | Regression | Lab 1, Lab 2, and Lab 3 server suites on the Lab 4 build | Pass; only the BR-46 tests changed, each named in its PR | `server/tests/lab-04/regression.api.test.ts` | Planned |
| REG-02 | AC-33, BR-46 | Regression | Lab 1–3 client suites and the Lab 2–3 Playwright suites on the Lab 4 build | Pass; home-route and navigation expectations updated to `/dashboard` (named in the Issue 6 PR) | `client/tests/lab-04/Navigation.test.tsx` | Planned |
| REG-03 | BR-45, D-13 | Regression | `GET /api/tickets`, the queue, and `GET /api/admin/users`, each without `status` | Byte-identical to Lab 3 responses for the same data (defaults `ALL`, `ACTIVE`, and every user) | `server/tests/lab-04/regression.api.test.ts` | Planned |
| REG-04 | AC-23, D-13 | Regression | `GET /api/tickets?status=UNRESOLVED` and `?status=WAITING_FOR_REQUESTER`; the queue with `status=UNRESOLVED`; `GET /api/admin/users` with `status=active`, `status=inactive`, combined with `role`, and with an unknown value | Only matching own tickets, matching tickets, or matching users; pagination metadata correct; an unknown user `status` returns every user, as in Lab 3 | `server/tests/lab-04/regression.api.test.ts` | Planned |
| REG-05 | FR-20 | Regression | `apiCredentials.test.ts` coverage check with the new API functions | Every new client API function is listed and sends credentials | `client/tests/lab-04/apiCredentials.lab4.test.ts` | Planned |
| REG-06 | AC-34, FR-17 | Regression | Double submit on Create Ticket, Post comment, Add internal note, Create user (UI busy state) | One request per click burst; one row created | `client/tests/lab-04/Hardening.test.tsx` | Planned |
| REG-07 | AC-34, FR-18 | Regression | Recoverable failure on Create Ticket, comment, note, user panels, and Actions Taken | Typed input kept after `400`, `409`, network error, and `500` | `client/tests/lab-04/Hardening.test.tsx` | Planned |
| REG-08 | AC-33 | Regression | Lab 1 feature: health check, the public Categories list, and the System Status page | Pass on the Lab 4 build, changed only as BR-46 allows | `server/tests/lab-01/health.test.ts` | Planned |
| REG-09 | AC-33 | Regression | Lab 2 feature: Create Ticket (validation, numbering, attachments on create) | Pass on the Lab 4 build, changed only as BR-46 allows | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| REG-10 | AC-33 | Regression | Lab 2 feature: My Tickets search, filters, sort, and pagination | Pass on the Lab 4 build, changed only as BR-46 allows | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| REG-11 | AC-33 | Regression | Lab 2 feature: Requester Ticket Detail and the attachment lifecycle | Pass on the Lab 4 build, changed only as BR-46 allows (Lab 2 REG-14 rewritten, BR-46) | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| REG-12 | AC-33 | Regression | Lab 3 feature: sign-in, sessions, password change, and the login throttle | Pass on the Lab 4 build, changed only as BR-46 allows | `server/tests/lab-03/auth.api.test.ts` | Planned |
| REG-13 | AC-33 | Regression | Lab 3 feature: the authorization matrix, Origin guard, and safe errors | Pass on the Lab 4 build, changed only as BR-46 allows | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| REG-14 | AC-33 | Regression | Lab 3 feature: Public Comments, Internal Notes, and "appears resolved" | Pass on the Lab 4 build, changed only as BR-46 allows | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| REG-15 | AC-33 | Regression | Lab 3 feature: the IT Staff Ticket Queue | Pass on the Lab 4 build, changed only as BR-46 allows | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| REG-16 | AC-33 | Regression | Lab 3 feature: IT Staff Ticket Detail, ownership, IT Priority, and the status workflow | Pass on the Lab 4 build, changed only as BR-46 allows (Lab 3 API-42 and gate setup, BR-46) | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| REG-17 | AC-33 | Regression | Lab 3 feature: Administrator User Management and its safety rules | Pass on the Lab 4 build, changed only as BR-46 allows | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| REG-18 | AC-33 | Regression | Lab 2 and Lab 3 browser journeys: Requester ticket flow, authentication, IT Staff ticket flow, user administration | Pass at desktop, tablet, and mobile, changed only as BR-46 allows | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |

### 2.8 Performance smoke

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| PERF-01 | AC-25, D-17 | Performance | Each dashboard endpoint 20 times sequentially on the seeded data | 95th percentile < 500 ms; every list ≤ 5 items | `server/tests/lab-04/dashboard-performance.test.ts` | Planned |
| PERF-02 | AC-25, D-17 | Performance | Query count per dashboard request before and after adding 50 tickets with actions | Identical query count (no N+1) | `server/tests/lab-04/dashboard-performance.test.ts` | Planned |
| PERF-03 | AC-25 | Performance | Actions Taken list for a ticket with 30 actions | One request, < 500 ms, query count independent of the number of actions | `server/tests/lab-04/dashboard-performance.test.ts` | Planned |

### 2.9 UI component

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| UI-01 | AC-28, FR-01 | UI | Actions Taken list mode: several cards in API order, every field labelled, "—" for empty values, empty state | Cards in order with labels; empty message when none | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-02 | AC-28, BR-04 | UI | Create panel: follow-up note appears and is required only while the checkbox is ticked; Result required for "Record work already done" | Note hidden until ticked; untick clears its error; submit without required values shows errors below fields and sends nothing | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-03 | AC-28, BR-08 | UI | Assignee select options | Only the active IT Staff and Administrators from the assignable-users API; defaults to the caller | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-04 | AC-28, BR-13 | UI | Planned vs completed vs cancelled cards | Edit, Complete, Cancel only on planned; completed shows Performed by; cancelled shows reason and badge | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-05 | AC-28 | UI | Complete and cancel dialogs: required result and reason; Escape; focus return | Errors below fields; Escape closes; focus returns to the opening button | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-06 | AC-28, FR-05 | UI | History disclosure | `aria-expanded` toggles; events oldest first with names resolved | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-07 | AC-30, BR-44 | UI | `409 STALE_STATE` on save | Banner shown; list reloaded; unsaved text kept in the panel | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-08 | AC-30, BR-43 | UI | Double click Save action; retry after a network failure | One request in flight; the retry reuses the same `clientRequestId`; input kept after failure | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-09 | AC-29, BR-19 | UI | Requester Ticket Detail "Work on your request" | Every field shown read-only; no Add, Edit, Complete, Cancel, or History control | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-10 | AC-02, BR-17 | UI | Administrator on IT Staff Ticket Detail | Actions Taken controls present; owner, priority, status, and composers still read-only | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-11 | AC-10, BR-20 | UI | Resolved, closed, and cancelled tickets | Add action replaced by the reopen or closed message; no Edit, Complete, or Cancel buttons | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-12 | AC-16, FR-08 | UI | Status select with the gate failing and passing | Resolved absent while failing; gate notice lists only the unmet conditions with counts; Resolved present once passing | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-13 | AC-16, FR-09 | UI | Successful status change and successful action completion | Header badge, controls, gate notice, and actions list refresh from the responses with no full reload | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-14 | AC-14, FR-08 | UI | `409 RESOLUTION_BLOCKED` returned on submit | Message under the status select; ticket and actions reloaded | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-15 | AC-27, BR-34 | UI | IT Staff Dashboard renders the API's metrics, strips, and lists | Each card shows label and exact value; links go to each `href`; nothing computed client-side (values differ from list lengths in the fixture) | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-16 | AC-27, FR-15 | UI | IT Staff Dashboard loading, empty lists, failure with Retry, refresh | Skeleton with `aria-busy`; per-list empty sentences; error banner; Retry refetches; refresh keeps values visible | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-17 | AC-27, BR-41 | UI | Administrator Dashboard | Read-only pill; ticket metrics; User accounts card with role-filtered links | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-18 | AC-27, AC-18 | UI | Requester Dashboard renders metrics and lists | Exact values; "Waiting for you" emphasised with text when above 0; no IT Priority shown | `client/tests/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-19 | AC-27, FR-15 | UI | Requester Dashboard empty (brand-new Requester), failure, Retry | Zeros plus the Create Ticket empty state; error banner; Retry refetches | `client/tests/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-20 | AC-26, FR-10 | UI | Navigation for each role and the post-login landing | Dashboard first with `aria-current` on `/dashboard`; landing `/dashboard`; forbidden callout shown there | `client/tests/lab-04/Navigation.test.tsx` | Planned |
| UI-21 | AC-23, D-13 | UI | Drill-down targets: My Tickets `?status=`, queue `status=UNRESOLVED`, User Management `?role=` with `?status=active` and `?status=inactive` | Each screen opens with the filter applied and requests it from the API; User Management shows the removable activation chip, and removing it drops the parameter | `client/tests/lab-04/DrillDownFilters.test.tsx` | Planned |
| UI-22 | AC-34, FR-16 | UI | Feedback consistency sweep: each screen's not-found, forbidden, and failure states use the shared components | Shared `EmptyState`/`ErrorState`/callout rendered with the screen's message | `client/tests/lab-04/Hardening.test.tsx` | Planned |

### 2.10 UI style

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| STYLE-01 | AC-35 | Style | Action status badges and follow-up pills: classes and contrast computed from the CSS | Each pair ≥ 4.5:1 and matches ui-spec §1 | `client/tests/lab-04/ZenGreenLab4.test.tsx` | Planned |
| STYLE-02 | AC-35 | Style | No ad hoc hex values in Lab 4 component styles | Only `--zg-*` tokens outside `:root` | `client/tests/lab-04/ZenGreenLab4.test.tsx` | Planned |
| STYLE-03 | AC-35, BR-19 | Style | Actions Taken caption vs Internal region | Actions Taken uses the public caption, never the Internal region class | `client/tests/lab-04/ZenGreenLab4.test.tsx` | Planned |

### 2.11 Responsive and accessibility

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| RESP-01 | AC-35 | Responsive | Dashboards (three roles) at 1280, 834, 375px | 4/2/1 card columns; no horizontal overflow; strips wrap | `e2e/lab-04/dashboards.spec.ts` | Planned |
| RESP-02 | AC-35 | Responsive | Actions Taken area, side panel, and dialogs at the three widths | No overflow or clipping; panel full-screen below desktop; buttons wrap on mobile | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| RESP-03 | AC-35 | Responsive | Keyboard pass: dashboard links, action cards, panel, dialogs, history disclosure | Visible focus everywhere; focus returns to openers; `#action-<id>` focuses the card | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |

### 2.12 End-to-end

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| E2E-01 | AC-01, AC-06, AC-07 | E2E | IT Staff plan three actions on one ticket, assign one to a colleague, edit one, complete one, cancel one, open history | List order and statuses correct after each step; history shows every change | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-02 | AC-29 | E2E | The Requester opens the same ticket | Every action and field visible read-only; no controls | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-03 | AC-08, AC-30 | E2E | Two browser contexts edit the same action | The second save shows the stale banner and keeps its text | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-04 | AC-14, AC-16 | E2E | Resolution gate in the UI: Resolved missing with a planned action, notice shown; complete it; Resolved offered; resolve | Status becomes Resolved; Add action replaced by the reopen message | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-05 | AC-17, AC-13 | E2E | Requester marks appears resolved, IT Staff reopen and close tickets through the full lifecycle | Advisory signal never changes status; every permitted transition works in the UI | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-06 | AC-26, AC-27 | E2E | Each role signs in and lands on its Dashboard; follow every metric link | Correct filtered list opens for each; back returns to the Dashboard | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-07 | AC-19, AC-18 | E2E | Counts on the UI after creating known tickets and actions | Values change by exactly the created amounts; a second Requester's dashboard unchanged | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-08 | AC-34, FR-19 | E2E | Console errors and broken links across all three specs | No `console.error` and no failed same-origin request during any journey | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-09 | AC-33 | E2E | Lab 2 and Lab 3 Playwright suites in the same run | Pass, changed only per BR-46 | `e2e/lab-04/dashboards.spec.ts` | Planned |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
| :--- | :--- |
| AC-01 | API-03, API-04, E2E-01 |
| AC-02 | API-05, SEC-06, UI-10 |
| AC-03 | UNIT-01, UNIT-02, UNIT-03, API-06 |
| AC-04 | API-07, API-08 |
| AC-05 | API-09, API-10 |
| AC-06 | UNIT-04, API-11, API-12, API-13, E2E-01 |
| AC-07 | API-02, API-14, E2E-01 |
| AC-08 | API-15, API-16, E2E-03 |
| AC-09 | API-01, API-21, SEC-02, SEC-03 |
| AC-10 | API-17, UI-11 |
| AC-11 | API-18 |
| AC-12 | API-19 |
| AC-13 | WF-01, E2E-05 |
| AC-14 | UNIT-05, WF-02, WF-03, WF-04, WF-05, UI-14, E2E-04 |
| AC-15 | WF-06 |
| AC-16 | WF-07, UI-12, UI-13, E2E-04 |
| AC-17 | WF-09, E2E-05 |
| AC-18 | DASH-01, UI-18, E2E-07 |
| AC-19 | DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, E2E-07 |
| AC-20 | DASH-07 |
| AC-21 | UNIT-06, DASH-08 |
| AC-22 | DASH-09 |
| AC-23 | UNIT-07, DASH-11, REG-04, UI-21 |
| AC-24 | DASH-10 |
| AC-25 | PERF-01, PERF-02, PERF-03 |
| AC-26 | UI-20, E2E-06 |
| AC-27 | UI-15, UI-16, UI-17, UI-18, UI-19, E2E-06 |
| AC-28 | UI-01, UI-02, UI-03, UI-04, UI-05, UI-06 |
| AC-29 | UI-09, E2E-02 |
| AC-30 | UI-07, UI-08, E2E-03 |
| AC-31 | MIG-01, MIG-02, MIG-03, MIG-04 |
| AC-32 | MIG-06, MIG-07 |
| AC-33 | REG-01, REG-02, REG-08, REG-09, REG-10, REG-11, REG-12, REG-13, REG-14, REG-15, REG-16, REG-17, REG-18, E2E-09 |
| AC-34 | REG-06, REG-07, UI-22, E2E-08 |
| AC-35 | STYLE-01, STYLE-02, STYLE-03, RESP-01, RESP-02, RESP-03 |
| AC-36 | SEC-01, SEC-04, SEC-05, SEC-07 |

All 36 acceptance criteria in `specification.md` §9 have at least one planned test;
none is uncovered. Rows that cite only a rule (`BR-##`, `FR-##`, `D-##`) cover behaviour below the
level of an acceptance criterion and are traced to that rule in §2.

### 3.1 Planned tests by issue

| Issue | Tests | Count |
| :--- | :--- | :--- |
| 1 — Sprint 4 Specification & Test Plan | none — documentation only | 0 |
| 2 — Actions Taken Model, Migration, Seed & API | UNIT-01, UNIT-02, UNIT-03, UNIT-04, API-01, API-02, API-03, API-04, API-05, API-06, API-07, API-08, API-09, API-10, API-11, API-12, API-13, API-14, API-15, API-16, API-17, API-18, API-19, API-20, API-21, API-22, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06, MIG-07, PERF-03 | 40 |
| 3 — Actions Taken UI | REG-05, UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, UI-09, UI-10, UI-11, STYLE-01, STYLE-03 | 14 |
| 4 — Ticket Workflow & Resolution Gate | UNIT-05, WF-01, WF-02, WF-03, WF-04, WF-05, WF-06, WF-07, WF-08, WF-09, WF-10, WF-11, UI-12, UI-13, UI-14 | 15 |
| 5 — Dashboard APIs | UNIT-06, UNIT-07, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09, DASH-10, DASH-11, DASH-12, SEC-07, REG-03, REG-04, PERF-01, PERF-02 | 19 |
| 6 — Dashboard UI & Navigation | REG-02, UI-15, UI-16, UI-17, UI-18, UI-19, UI-20, UI-21, STYLE-02 | 9 |
| 7 — Final Hardening & Full Regression | REG-01, REG-06, REG-07, REG-08, REG-09, REG-10, REG-11, REG-12, REG-13, REG-14, REG-15, REG-16, REG-17, REG-18, UI-22 | 15 |
| 8 — Responsive & Accessibility QA, Visual Checklist & E2E | RESP-01, RESP-02, RESP-03, E2E-01, E2E-02, E2E-03, E2E-04, E2E-05, E2E-06, E2E-07, E2E-08, E2E-09 | 12 |
| 9 — Integration & Release to Main | full regression of every row above on `lab4-staging`, then on `main` | — |

**Totals:** UNIT 7, API 22, WF 11, DASH 12, SEC 7, MIG 7, REG 18, PERF 3, UI 22, STYLE 3, RESP 3, E2E 9: **124 planned tests**.

## 4. Responsive and Visual Checklist

Filled in by Issue 8 against `ui-spec.md` §11, with evidence under `artifacts/lab-04/screenshots/`
(`ui-spec.md` §12).

| Check | Dashboards | Actions Taken (staff) | Requester view | Ticket controls / gate | Lab 1–3 screens |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Only `--zg-*` tokens and badge classes used | Planned | Planned | Planned | Planned | Planned |
| Dashboard first in navigation, active page marked | Planned | Planned | Planned | Planned | Planned |
| Metric cards: label, value, accessible drill-down | Planned | Planned | Planned | Planned | Planned |
| Action badges and follow-up pills consistent | Planned | Planned | Planned | Planned | Planned |
| Editable vs read-only distinct | Planned | Planned | Planned | Planned | Planned |
| Validation below fields; conflicts beside their control | Planned | Planned | Planned | Planned | Planned |
| Focus visible; focus returns to openers | Planned | Planned | Planned | Planned | Planned |
| No clipping / overlap / horizontal overflow — desktop | Planned | Planned | Planned | Planned | Planned |
| No clipping / overlap / horizontal overflow — tablet | Planned | Planned | Planned | Planned | Planned |
| No clipping / overlap / horizontal overflow — mobile | Planned | Planned | Planned | Planned | Planned |

## 5. Test Commands

```bash
# Backend (Vitest + Supertest): server/tests/lab-01..04
docker-compose exec server npm test

# Frontend (Vitest + Testing Library): client/tests/lab-01..04
docker-compose exec client npm test

# E2E + responsive (Playwright, desktop/tablet/mobile projects): e2e/lab-02..04
docker-compose exec client npx playwright test
```

## 6. Final Results

Pending. A row is marked Pass only after its test passes in a full local run on the issue's
branch, before its PR opens. The complete suite is re-run on `main` after the release PR, and
that output is the Part 3 evidence (labsheet §14).

## 7. Known Limitations or Deferred Tests

- **Race tests use small bursts.** API-16 and WF-06 fire two requests at once, repeated 10–20 times.
  They prove the locks serialise the pair; they do not measure behaviour under load.
- **The performance smoke is not a load test.** PERF-01 measures one client on the seeded data
  with a generous budget (D-17). PERF-02's fixed query count is the regression guard that does not
  depend on machine speed.
- **`resolvedAt` for Lab 3 tickets is approximate** (D-04). MIG-02 checks the backfill rule, not
  the true historical resolution time, which Lab 3 never stored.
- **The Bangkok-midnight tests fix the clock** (DASH-08, UNIT-06) rather than waiting for a real
  midnight.
- **Cross-browser coverage** stays at Playwright's Chromium projects, as in Labs 2 and 3.
