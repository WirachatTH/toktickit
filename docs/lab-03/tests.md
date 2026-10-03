# Lab 3 Test Plan and Results

## 1. Test Strategy

Tests are planned here before implementation (Test DD) and, per issue, written before the
feature code they cover (TDD): each Lab 3 issue starts by adding its rows' tests, confirming they
fail for the expected reason, and only then implementing. Every row traces to an Acceptance
Criterion or a numbered rule in `docs/lab-03/specification.md` (numbering restarts for Lab 3), and
§3 proves every `AC-##` has at least one test.

Coverage spans the eight levels labsheet §10 requires: unit, API/integration, security and
authorization, migration and regression, UI component, UI style, responsive, and end-to-end.
Two techniques carry the security level: a **matrix sweep** (SEC-01 to SEC-03) that drives every
route in `api-spec.md` §7 with no session, with each role it is denied, and with each role it is
granted — so a newly added route without a guard fails the suite — and a **response scan**
(SEC-09, API-24) that searches serialized JSON rather than the rendered UI for data that must never
leave the server. The sweep's route table grows with each issue as its endpoints land.

Lessons carried from Lab 2 (`docs/lab-02/tests.md` §7) apply: a guard's test is only trusted after
deleting the guard and watching the test go red, and jsdom-only responsive checks are backed by
the Playwright viewport projects (§2.12). Lab 2's own suites stay in place and are migrated to
session authentication (REG-08) rather than rewritten.

**Test isolation (D-22).** All server tests share one development database with no per-test
sandbox (`server/vitest.config.ts` runs files sequentially). Each test therefore creates its own
users and tickets under a unique prefix and deletes them afterwards, and never modifies a seeded
row. Tests whose effects the seed would not undo — the migration and seed tests (MIG-01 to MIG-11)
and the last-Administrator race (API-70) — create a throwaway PostgreSQL schema, run there, and
drop it, so the README credentials keep working after any number of `npm test` runs. API-70 runs
through the Express app, whose Prisma client is a singleton built from `DATABASE_URL` on first use,
so it lives in its own file (`last-administrator.api.test.ts`) that points `DATABASE_URL` at the
throwaway schema before first importing the app; Vitest isolates modules per file.

**In-memory state.** The login throttle (BR-14) lives in server memory for the whole test file, so
`auth.api.test.ts` calls the exported `resetLoginThrottle()` in `beforeEach`, and every test uses its
own users. No test's failed logins can therefore throttle a later test.

File paths follow labsheet §12 (`server/tests/lab-03/`, `client/tests/lab-03/`, `e2e/lab-03/`,
D-20), with additional files where the minimum list has no home for an area (unit modules, the
Requester regression suite, migration and seed). The "Final" column reads Planned until the issue
that owns the row runs it green.

## 2. Planned Tests

### 2.1 Unit

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| UNIT-01 | BR-06 | Unit | Hash a password, verify it with the right and a wrong password; hash the same password twice; verify against an empty hash | Right → true, wrong → false, empty hash → false; stored as `scrypt$N$r$p$salt$hash`; the two hashes differ (per-user salt) | `server/tests/lab-03/password.test.ts` | Pass |
| UNIT-02 | AC-07, BR-07 | Unit | Password policy boundaries: 9/10/128/129 characters, no digit, no letter, equal to own email in another letter case | 10 and 128 accepted; 9, 129, no-digit, no-letter, and email-equal rejected with the matching rule message | `server/tests/lab-03/password.test.ts` | Pass |
| UNIT-03 | AC-07, BR-08 | Unit | New password identical to the current one | Rejected with the "different from your current password" rule | `server/tests/lab-03/password.test.ts` | Pass |
| UNIT-04 | BR-15 | Unit | Session token generation and storage | Token is 32 random bytes base64url; stored value is its SHA-256 hex and never equals the raw token | `server/tests/lab-03/session.test.ts` | Pass |
| UNIT-05 | AC-08, BR-17 | Unit | Session validity at `expiresAt - 1ms`, `expiresAt`, and later | Valid only before `expiresAt` | `server/tests/lab-03/session.test.ts` | Pass |
| UNIT-06 | AC-05, BR-14, D-12 | Unit | Login throttle store: 5 failures for one email, sliding window, normalised keys, success reset, reservations in flight (a burst of 20), neutral outcomes, the cap, eviction, `resetLoginThrottle()` | A 6th attempt is refused with the right wait; freed as the oldest failure leaves the window; only 5 of 20 simultaneous reservations allowed; neutral outcomes not counted; a throttled email is never evicted; reset empties the store | `server/tests/lab-03/login-throttle.test.ts` | Pass |
| UNIT-07 | AC-31, BR-41 | Unit | Transition table: every (from, to) pair of the 8×8 status grid | Exactly the BR-41 pairs are permitted; same-status and terminal sources never are | `server/tests/lab-03/transitions.test.ts` | Pass |
| UNIT-08 | AC-31, BR-42 | Unit | Owner requirement per target status | Only `CANCELLED` is permitted without an owner | `server/tests/lab-03/transitions.test.ts` | Pass |
| UNIT-09 | AC-31, BR-44, BR-45 | Unit | Required text per target and its bounds (summary 10–2000, reason 10–1000, trimmed) | `RESOLVED` needs a summary, `CANCELLED`/`REOPENED` a reason; boundary values accepted, one past rejected | `server/tests/lab-03/transitions.test.ts` | Pass |
| UNIT-10 | AC-26, BR-62, BR-65, BR-66 | Unit | Queue query normalisation: unknown enums, non-numeric ids, page ≤0, page size 0/51 | Each replaced by its default or clamped; result object equals the echoed `appliedQuery` | `server/tests/lab-03/queue-query.test.ts` | Pass |
| UNIT-11 | AC-25, BR-63, BR-64 | Unit | Queue ordering builder for the default and every `sort`/`order` pair | `itPriority` (either direction) → then `createdAt` asc, `id` asc; every other field → then `id` in the same direction; no `sort` builds exactly the same order as `sort=itPriority&order=desc` | `server/tests/lab-03/queue-query.test.ts` | Pass |

### 2.2 API — authentication

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| API-01 | AC-01, BR-15, BR-16 | API | `POST /api/auth/login` with valid credentials | `200`, safe user payload; `Set-Cookie` has `HttpOnly`, `SameSite=Strict`, `Path=/api`, `Max-Age=28800`; one session row holding the token hash | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-02 | AC-01, FR-02 | API | `GET /api/auth/me` with the login cookie | Same user payload; `lastLoginAt` was set by the login | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-03 | AC-03, BR-12 | API | Wrong password vs. unknown email | Byte-identical `401 INVALID_CREDENTIALS` bodies; no `Set-Cookie`; no session row | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-04 | AC-03, BR-10 | API | Login to a migrated account with no password hash | Same `401 INVALID_CREDENTIALS` as a wrong password | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-05 | AC-04, BR-13 | API | Inactive account with correct password, then with a wrong password | Correct → `403 ACCOUNT_INACTIVE`, no session; wrong → generic `401` | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-06 | AC-05, BR-14 | API | 5 failed logins for one email, then the correct password; same sequence for an unknown email (throttle reset before the test) | 6th request `429 TOO_MANY_ATTEMPTS` with `Retry-After`, even with the right password; identical for the unknown email | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-07 | AC-05, BR-14 | API | 4 failures, a success, then 4 more failures | No throttling — the success cleared the count | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-08 | BR-09 | API | Login with the email in mixed case and surrounded by spaces | Succeeds | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-09 | AC-06, BR-18 | API | Logout, then reuse the old cookie; logout with no session | `204`; session row gone; old cookie → `401` on `/me`; logout without a session still `204` | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-10 | AC-08, BR-17 | API | Request with a session whose `expiresAt` is in the past | `401 UNAUTHENTICATED`; the expired row is deleted | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-11 | AC-02, BR-02 | API | Must-change session: first `GET /api/tickets`, a comment post, and the staff queue; then `/me`; then change-password; then `GET /api/tickets` again; logout last | Blocked routes `403 PASSWORD_CHANGE_REQUIRED` (checked while the flag is still set); `/me` `200`; change-password `200` clears the flag; the route then `200`; logout `204` | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-12 | AC-02 | API | Change password from a must-change session, then call a normal route | Flag cleared; normal route succeeds with the same session | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-13 | AC-07, BR-07, BR-08 | API | Change password with each policy violation and with the current password | `400 VALIDATION_ERROR` on `fields.newPassword`; hash unchanged | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-14 | AC-07 | API | Change password with a wrong current password | `400` on `fields.currentPassword` (not `401`); session still valid | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-15 | AC-09, BR-19 | API | Two sessions for one user; change password in session A | Session B → `401`; session A still works | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-16 | BR-06 | API | Inspect the stored hash and the login, `/me`, and change-password responses | Stored value never equals the plaintext; no response contains `passwordHash` | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-17 | FR-07 | API | `/api/health` without a session; login with missing fields, including six for a real email with the password missing | Health `200`; each login `400 VALIDATION_ERROR` on the missing field, and none is counted — that email still signs in | `server/tests/lab-03/auth.api.test.ts` | Pass |

### 2.3 Security and authorization

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| SEC-01 | AC-10, FR-07 | Security | Every protected route (table-driven from api-spec §7) with no session | `401 UNAUTHENTICATED`; body has no resource data | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| SEC-02 | AC-11, BR-20 | Security | Matrix sweep: every route × every role it is not granted | `403 FORBIDDEN`; body has no resource data | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| SEC-03 | AC-11, BR-20 | Security | Matrix sweep: every route × every role it is granted (including Administrator on assignable users) | Never `401`/`403` — proves the matrix is not over-restrictive | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| SEC-04 | AC-14, BR-25 | Security | Requester `GET` and `POST` Internal Notes on an own ticket, another Requester's ticket, and a missing id | All three `403`, identical bodies, no note content or count | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| SEC-05 | AC-13, BR-24 | Security | Requester requests another Requester's ticket, attachment metadata, download, and comments | `404`, identical to a ticket id that does not exist | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| SEC-06 | AC-16, BR-26, D-11 | Security | `POST`, `PATCH`, and a multipart upload with a foreign `Origin` and with `Origin: null`; the same requests with each default client origin (`:5173`, `:5174`); a `GET` with a foreign origin | Foreign and `null` → `403 FORBIDDEN_ORIGIN`, nothing changed; both default origins and the `GET` succeed | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| SEC-07 | BR-22, BR-23 | Security | Guard order: no session + wrong role; must-change + wrong role | `401` wins over `403`; `PASSWORD_CHANGE_REQUIRED` wins over `FORBIDDEN` | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| SEC-08 | AC-33, BR-21 | Security | Administrator calls owner, IT Priority, status, post-comment, and post-note | Every one `403 FORBIDDEN`; ticket unchanged | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| SEC-09 | BR-06, BR-15 | Security | Scan every JSON response produced by the suite | No `passwordHash`, `tokenHash`, or session token anywhere | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| SEC-10 | FR-13 | Security | `GET /api/requesters` after Lab 3 | `404` — the route no longer exists; the four `/api/requesters` tests in `server/tests/lab-02/requesters.api.test.ts` are retired and named in the PR (its Related Systems tests stay, in `reference-data.api.test.ts`) | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| SEC-11 | AC-41 | Security | Requester and IT Staff call every `/api/admin/users` route | `403 FORBIDDEN`, no user data | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| SEC-12 | FR-08, BR-23 | Security | Safe errors (api-spec §0.4, §0.5): malformed JSON, a body over the JSON limit, an unsupported charset, unknown routes (since Issue 9 every route in api-spec §7 has a handler, so there is no granted route without one); a database failure in the session lookup and in a handler | `400 VALIDATION_ERROR`, `413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `404 NOT_FOUND`, and `500 INTERNAL_ERROR` — each the bare error envelope, with no stack trace, SQL, or path; the server keeps answering afterwards | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| SEC-13 | FR-07, FR-08, BR-20 | Security | Every route registered on the Express app and its auth router, against the server's route-policy table | Each registered route has exactly one policy, and the table equals api-spec §7 role for role — so no route is unclassified, and an unclassified one is unreachable (`404`) | `server/tests/lab-03/authorization.api.test.ts` | Pass |

### 2.4 Requester regression

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| REG-01 | AC-12, BR-03 | Regression | `POST /api/tickets` with another user's id in a `requesterId` field | Ticket belongs to the session user | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-02 | AC-12, BR-03 | Regression | `GET /api/tickets?requesterId=<other>` with `X-Dev-Requester-Id: <other>` | Only the session user's tickets | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-03 | AC-17, FR-12 | Regression | Create with attachment → list → detail → upload → download → soft-remove, through a session | Every step behaves as in Lab 2 | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-04 | AC-17, BR-34 | Regression | Database row of a newly created ticket, and the create response | `itPriority = requestedPriority`, no owner, `NEW`; response has no `itPriority` | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-05 | BR-71 | Regression | `GET /api/tickets/:id` payload | Has `owner`, `resolutionSummary`, `requesterResolvedAt`; no `itPriority`, no note fields | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-06 | BR-70 | Regression | Add and soft-remove attachments on `CLOSED` and `CANCELLED` tickets; download an existing one | `409 TICKET_CLOSED`; download still `200` | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-07 | D-18 | Regression | Categories, Related Systems, and health with no session and as each role | `200` with the Lab 1/Lab 2 shapes in every case — they stay public | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-08 | AC-18, BR-69 | Regression | Lab 2 server suites run with a session-based helper in place of `X-Dev-Requester-Id` | All pass with unchanged assertions | `server/tests/lab-02/*.test.ts` | Pass |
| REG-09 | AC-17, BR-20 | Regression | IT Staff and Administrator call `POST /api/tickets` and `GET /api/tickets` | `403 FORBIDDEN` | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-10 | AC-20, BR-47 | Regression | Mark an own `IN_PROGRESS` ticket "appears resolved" with and without a comment | `200`; `requesterResolvedAt` set; status unchanged; comment stored as a Public Comment by the Requester | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-11 | AC-20, BR-47 | Regression | Mark again; mark on `RESOLVED`, `CLOSED`, `CANCELLED` | `409 ALREADY_MARKED`; nothing changes | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-12 | AC-20, BR-05 | Regression | Requester calls the staff status route; sends `status`/`currentStatus` in every Requester body | Status route `403`; the fields are ignored; status never changes | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-13 | AC-13 | Regression | Mark another Requester's ticket | `404` | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| REG-14 | AC-18, BR-68, BR-69 | Regression | Lab 2 `RequesterTicketDetail.test.tsx` BR-46 test, rewritten for Lab 3 | Asserts the Lab 3 rule instead: a comment box is present, while internal notes, IT Priority, Actions Taken, and any status control stay absent | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pass |
| REG-15 | AC-18, D-18 | Regression | Lab 1 suites and the public System Status page with no session | `health.test.ts`, `categories.test.ts`, and `App.test.tsx` pass unchanged; "Check System" reports Online | `server/tests/lab-01/*.test.ts` | Pass |
| REG-16 | AC-18, BR-69 | Regression | Lab 2 client suites and the Lab 2 E2E journey after the selector is removed | They sign in instead of choosing a Requester and otherwise keep their assertions; selector-only tests (`RequesterSelector`, `RequireRequester`, `RequesterFlowIntegration`) are retired and named in the PR | `client/tests/lab-02/*.test.tsx` | Pass |
| REG-17 | AC-12, BR-03 | Regression | No staff account can act as a Requester: the Development Requester list, and an IT Staff or Administrator session on the Requester endpoints with the old dev header naming a Requester | The list is gone (`404`, signed out and as every role) and the staff session is refused (`403`) whatever the header names. Rewritten in Issue 5 from the Lab 2-era selector checks (BR-69) | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |

### 2.5 API — Public Comments and Internal Notes

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| API-18 | AC-19, FR-15 | API | Requester posts a Public Comment on an own ticket | `201`; author is the session user; listed for the Requester and for IT Staff | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-19 | AC-19, FR-19 | API | IT Staff post a Public Comment on any ticket | `201`; visible to that ticket's Requester | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-20 | AC-21, BR-50 | API | Comment and note bodies: empty, whitespace-only, 1, 2000, 2001 characters | 1 and 2000 accepted; the rest `400` on `fields.body`, nothing stored | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-21 | AC-23, BR-50 | API | Body carries `authorId` and `createdAt` | Both ignored; server values stored | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-22 | AC-23, BR-51 | API | `PUT`/`PATCH`/`DELETE` on a comment and on a note | `404` — no such routes | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-23 | AC-22, FR-18 | API | IT Staff post an Internal Note | `201`; returned to IT Staff and Administrators | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-24 | AC-22, BR-25 | API | After a note exists, scan every Requester-facing response for that ticket | Note text and any note count absent from all of them | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-25 | BR-52 | API | Public Comment and Internal Note on `CLOSED` and `CANCELLED` tickets | Comment `409 TICKET_CLOSED`; note `201` | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-26 | BR-52 | API | Ticket `updatedAt` before and after a comment or note | Advanced | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-27 | BR-51 | API | Thread ordering and a `<script>` body | Oldest first with id tiebreak; body returned verbatim as text | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-28 | BR-21 | API | Administrator reads comments and notes, then tries to post each | Reads `200`; posts `403` | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |

### 2.6 API — IT Staff Ticket Queue

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| API-29 | AC-25, BR-62, BR-63 | API | `GET /api/staff/tickets` with no parameters | Only non-terminal tickets; IT Priority desc then oldest first; correct pagination metadata | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-30 | AC-26, BR-61 | API | Search by Ticket Number prefix, Summary substring, Requester name; mixed case; whitespace only | Matching tickets only; whitespace-only = no search | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-31 | AC-26, BR-62 | API | `status` = `ALL`, each single status, `ACTIVE` | Exact status sets | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-32 | AC-26, BR-62 | API | IT Priority and Category filters, combined with search | AND of all conditions | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-33 | AC-26, BR-62 | API | `owner` = `any`, `unassigned`, `me`, a user id | Correct subsets | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-34 | AC-26, BR-62 | API | `appearsResolved=true` | Only flagged tickets | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-35 | AC-26, BR-63 | API | Each sort field in both directions | Correct order; status by lifecycle order, priority LOW<MEDIUM<HIGH | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-36 | BR-64 | API | Many tickets with identical sort values, paged through | No ticket repeated or skipped across pages | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-37 | AC-26, BR-66 | API | Invalid enum, id, page, and page size values | `200` with defaults/clamped values; `appliedQuery` shows them | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-38 | BR-67 | API | A page past the last | Empty `data`, correct totals | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-39 | AC-33, FR-30 | API | Administrator and Requester request the queue | Administrator `200`; Requester `403` | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-40 | FR-21 | API | Shape of one queue row | Requester, Category, both priorities, status, owner with `isActive`, signal, dates; no description or notes | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |

### 2.7 API — IT Staff Ticket Detail

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| API-41 | AC-32, FR-25 | API | `GET /api/staff/tickets/:id` as IT Staff | Attachments (active and removed), `permittedTransitions` = the BR-41 row, all capabilities true | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-42 | AC-33, BR-21 | API | Same request as an Administrator | Same ticket data; `permittedTransitions` empty; every capability false | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-43 | AC-32, FR-29 | API | IT Staff and Administrator download an active and a removed attachment on another user's ticket | Active `200`; removed `404` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-44 | AC-28, BR-30, BR-32 | API | Claim an unassigned `NEW` ticket | Owner is the caller and status `OPEN`, committed together | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-45 | AC-28, BR-31 | API | Claim with a stale `expectedOwnerId`, then with a stale `expectedStatus`; two claims sent in parallel | Each stale request `409 STALE_STATE`, unchanged; parallel → exactly one succeeds | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-46 | AC-29, BR-29 | API | Assign to an active IT Staff member and to an active Administrator | Both `200` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-47 | AC-29, BR-29 | API | Assign to an inactive user, a Requester, a missing id | `400` on `fields.ownerId`; owner unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-48 | BR-36 | API | Unassign an `OPEN` and an `IN_PROGRESS` ticket | `OPEN` → `200`, owner cleared, status stays `OPEN`; `IN_PROGRESS` → `409 OWNER_REQUIRED` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-49 | BR-29 | API | Deactivate a ticket's owner, then read the ticket and the queue | Still the owner; shown with `isActive: false` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-50 | AC-30, BR-33, BR-34 | API | Change IT Priority, with `requestedPriority` also in the body | IT Priority changed; Requested Priority unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-51 | BR-37 | API | Owner and IT Priority changes on `CLOSED` and `CANCELLED` tickets | `409 TICKET_CLOSED` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-52 | AC-31, BR-41 | API | Every permitted transition (table-driven), with owner and required text | Each `200` and stored | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-53 | AC-31, BR-41 | API | Every forbidden transition, same-status, and from terminal statuses | `409 INVALID_TRANSITION`; status unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-54 | AC-31, BR-43 | API | Transition with a stale `expectedStatus` | `409 STALE_STATE`; unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-55 | AC-31, BR-32, BR-42 | API | Ownerless `OPEN` ticket (owner removed) to each target; `NEW` → `OPEN` via the status route; ownerless `NEW` → `CANCELLED` | `409 OWNER_REQUIRED` for every target except `CANCELLED`; `NEW` → `OPEN` is `409 INVALID_TRANSITION` (only assignment opens a ticket); the cancellation succeeds | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-56 | AC-31, BR-44 | API | `RESOLVED` with no, short, long, and valid summary; then `REOPENED` | Invalid `400`; valid stored and visible to the Requester; `REOPENED` clears it | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-57 | AC-31, BR-45 | API | `CANCELLED` and `REOPENED` with and without a reason | Without → `400`, unchanged; with → status changes and the reason is a Public Comment by the actor, in one transaction | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-58 | BR-48 | API | Any transition on a flagged ticket | `requesterResolvedAt` cleared | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-59 | FR-26, BR-21, BR-29 | API | `GET /api/staff/assignable-users` as IT Staff, Administrator, and Requester | IT Staff and Administrator `200`: only active IT Staff and Administrators, by name; Requester `403` | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |

### 2.8 API — Administrator user management

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| API-73 | AC-05, BR-14 | API | While one email is throttled, another account signs in from the same client | The other account signs in normally — the throttle is per email, not global | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-80 | BR-17 | API | User with two expired sessions logs in | Both expired rows are deleted; the new session works | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-83 | AC-05, BR-14 | API | 20 wrong passwords for one email at once; then 19 wrong plus the correct one at once | Exactly 5 evaluated (`401`) and 15 refused (`429`); in the mixed burst at most 5 are evaluated and a session exists only if the correct one was among them | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-79 | AC-26, BR-64 | API | Request page 1 with no parameters, rebuild the URL from its `appliedQuery`, request pages 1–3 with that URL | Identical page 1, and pages 1–3 match the default-order pages with no repeats or gaps | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-74 | AC-28, BR-31, BR-80 | API | Race: claim a `NEW` ticket (`expectedStatus: NEW`) while another request cancels it | Never a `CANCELLED` ticket that is `OPEN` or owned; the later request gets `409` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-75 | AC-31, BR-43, BR-80 | API | Race: unassign an `OPEN` ticket while another request moves it to `IN_PROGRESS` | Never an ownerless `IN_PROGRESS` ticket; the later request gets `409` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-76 | BR-52, BR-47, BR-70, BR-80 | API | Race: post a Public Comment, mark appears resolved, and add an attachment while another request closes or cancels the ticket | No comment, signal, or attachment is ever added to a ticket that was already terminal when it committed | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-78 | AC-31, BR-22 | API | Status route: missing `expectedStatus`; missing `expectedOwnerId`; a 3-character resolution summary on a transition that is also forbidden | Each `400 VALIDATION_ERROR`, never `409` — validation runs before business rules | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-81 | BR-31, BR-43 | API | Owner and IT Priority routes with a missing expected field, then with a stale `expectedStatus` | Missing → `400`; stale → `409 STALE_STATE`; ticket unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-60 | AC-34, FR-31 | API | `GET /api/admin/users` | Name, email, role, status for every user, by name; no password material | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-61 | AC-34, FR-32 | API | Search by name and by email (mixed case); role filter; unknown role value | Correct subsets; unknown role ignored | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-62 | AC-35, BR-55 | API | Create a user of each role, then log in as each | `201`, `mustChangePassword: true`; login works and is forced to change | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-63 | AC-36, BR-54 | API | Create and edit with an existing email in another letter case | `409 EMAIL_TAKEN` on `fields.email`; nothing changed | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-64 | AC-36, BR-53, BR-55 | API | Invalid role, short name, malformed email, weak initial password | `400` with each field's message; no user created | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-65 | AC-37, FR-34 | API | Edit name, email, role, activation | Saved | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-66 | AC-37, BR-59 | API | Deactivate a signed-in user | Their old cookie → `401`; their login → `403 ACCOUNT_INACTIVE` | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-67 | BR-59 | API | Change a signed-in user's role | Their sessions end; after re-login the new role's permissions apply | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-68 | AC-38, BR-56 | API | Set a new initial password for a signed-in user | Sessions end; next login works with the new password and is forced to change | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-69 | AC-39, BR-57 | API | Administrator deactivates self, changes own role, sets own initial password | Each `409 SELF_CHANGE_FORBIDDEN`; nothing changed | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-70 | AC-40, BR-58, BR-81, D-22 | API | In a throwaway schema with exactly two active Administrators: they deactivate (and, separately, demote) each other in parallel | Exactly one `200`, the other `409 LAST_ADMINISTRATOR` — never a `500` from a deadlock; one active Administrator remains; seeded accounts never involved | `server/tests/lab-03/last-administrator.api.test.ts` | Pass |
| API-82 | BR-81 | API | In the API-70 schema with four active Administrators: two Administrators deactivate two different other Administrators at the same moment, repeated | Both succeed every time — no deadlock (`40P01`) and no `500`; locks are taken in one statement in ascending id order | `server/tests/lab-03/last-administrator.api.test.ts` | Pass |
| API-71 | BR-60 | API | Demote an IT Staff member who owns an open ticket; reassign, then demote; deactivate instead | `409 OWNS_OPEN_TICKETS`, then `200`; deactivation allowed | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-77 | BR-60, BR-81 | API | Race: demote an IT Staff member to `REQUESTER` while another request assigns them an open ticket | Never a `REQUESTER` owning an open ticket: one succeeds, the other is refused (`409 OWNS_OPEN_TICKETS` or `400` on `fields.ownerId`) | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-72 | BR-59 | API | `DELETE /api/admin/users/:id` | `404` — no such route | `server/tests/lab-03/users-admin.api.test.ts` | Pass |

### 2.9 Migration and seed

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| MIG-01 | AC-42, BR-72, BR-74 | Migration | In a throwaway schema: apply the Lab 1 and Lab 2 migrations, insert Lab 2-shaped data (including a soft-removed attachment), apply the Lab 3 migration | Same ticket, attachment, and user counts and ids; every ticket's requester unchanged; schema dropped afterwards | `server/tests/lab-03/migration-seed.test.ts` | Pass |
| MIG-02 | AC-42, BR-77 | Migration | In the MIG-01 schema, `itPriority` on every pre-existing ticket | Equals `requestedPriority`; column is NOT NULL | `server/tests/lab-03/migration-seed.test.ts` | Pass |
| MIG-03 | AC-42, BR-73, BR-76 | Migration | In the MIG-01 schema, the migrated user rows (checked in the database — no login) | Role `REQUESTER`, activation unchanged, `mustChangePassword` true, `passwordHash` null — the locked state BR-10 refuses (login refusal itself is API-04) | `server/tests/lab-03/migration-seed.test.ts` | Pass |
| MIG-04 | BR-75 | Migration | In the MIG-01 schema, a Lab 2 email inserted with upper-case letters and surrounding spaces | Stored trimmed and lowercased after the migration | `server/tests/lab-03/migration-seed.test.ts` | Pass |
| MIG-05 | D-05 | Migration | In a throwaway schema with every migration applied, `prisma migrate diff --from-url <schema> --to-schema-datamodel prisma/schema.prisma --exit-code` | Exit code 0 — the hand-edited SQL, including the dropped `updatedAt` default and the dropped Lab 2 index, matches the schema | `server/tests/lab-03/migration-seed.test.ts` | Pass |
| MIG-06 | AC-43, BR-78 | Migration | In a throwaway schema: seed twice; change one seeded user's password, role, and activation, then seed again | Second run creates nothing; the changed values are kept; the shared development database is never touched | `server/tests/lab-03/migration-seed.test.ts` | Pass |
| MIG-07 | AC-43, FR-38 | Migration | In a freshly migrated and seeded throwaway schema, the seed content | Exactly 6 active + 1 inactive Requesters (incl. `first.login`), 3 active + 1 inactive IT Staff, 2 active Administrators; tickets in all 8 statuses, assigned and unassigned; comments and notes | `server/tests/lab-03/migration-seed.test.ts` | Pass |
| MIG-08 | BR-76, BR-78 | Migration | In the MIG-07 schema, each documented account's stored hash and flag (checked with the password module — no login) | The documented password verifies against every documented account; only `first.login@kmutt.ac.th` has `mustChangePassword` set | `server/tests/lab-03/migration-seed.test.ts` | Pass |
| MIG-09 | BR-06, BR-79 | Migration | In the MIG-07 schema, search every text column for the documented plaintext password | Not present anywhere | `server/tests/lab-03/migration-seed.test.ts` | Pass |
| MIG-10 | BR-54 | Migration | In the MIG-07 schema, create a user, then a second user with the same email | The database refuses the second (Prisma `P2002` on `User_email_key`); exactly one row exists | `server/tests/lab-03/migration-seed.test.ts` | Pass |
| MIG-11 | BR-53 | Migration | In the MIG-07 schema, insert a user whose role is not one of the three (raw SQL, bypassing the typed client) | The database enum refuses it; no row is created; the `Role` enum holds exactly `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR` | `server/tests/lab-03/migration-seed.test.ts` | Pass |

### 2.10 UI component

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| UI-01 | AC-01, FR-01 | UI | Login with valid credentials | Calls login once, stores the user, navigates to the role's home | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-02 | AC-03 | UI | Login answered `401` | Generic banner; password cleared, email kept, focus on password | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-03 | AC-04 | UI | Login answered `403 ACCOUNT_INACTIVE` | Inactive-account banner, distinct from the generic one | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-04 | AC-05 | UI | Login answered `429` with `Retry-After` | Throttle banner with minutes | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-05 | FR-01 | UI | Empty fields; double-click Sign in | Inline required messages, no request; busy state sends exactly one request | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-06 | AC-02, FR-04 | UI | Change Password in forced mode | No Cancel or navigation; success goes to the role's home | `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| UI-07 | AC-07, BR-07 | UI | Typing into New password and Confirm | Checklist items flip per rule; Save disabled until all pass and Confirm matches | `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| UI-08 | AC-07 | UI | Server rejects current or new password | Message below the matching field; inputs kept | `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| UI-09 | AC-15, FR-09, FR-10 | UI | App shell for each role | Exact nav destinations per role; name and role badge; Change password and Log out | `client/tests/lab-03/AppShellRoles.test.tsx` | Pass |
| UI-10 | AC-15, FR-11 | UI | Forbidden route for a role; protected route while signed out | Home screen with forbidden callout; Login, then back to the original route after sign-in | `client/tests/lab-03/AppShellRoles.test.tsx` | Pass |
| UI-11 | AC-06, AC-08 | UI | Log out; any request answered `401` mid-session | Back to Login; session-ended banner in the second case | `client/tests/lab-03/AppShellRoles.test.tsx` | Pass |
| UI-12 | AC-02, BR-02 | UI | Must-change user opens any route | Redirected to Change Password | `client/tests/lab-03/AppShellRoles.test.tsx` | Pass |
| UI-13 | FR-13 | UI | Render the app and inspect routes, components, and storage | No selector route or component; the `tokTickIT.devRequester` key is never read or written | `client/tests/lab-03/AppShellRoles.test.tsx` | Pass |
| UI-14 | AC-19, FR-14 | UI | Requester Ticket Detail comments thread and composer, including a closed ticket | Oldest first with author, role, time; post adds it; empty body blocked; closed ticket disables the composer | `client/tests/lab-03/RequesterTicketDetailLab3.test.tsx` | Pass |
| UI-15 | AC-20, BR-47 | UI | Problem appears resolved flow | Confirmation dialog with optional comment; after success the pill and date replace the button | `client/tests/lab-03/RequesterTicketDetailLab3.test.tsx` | Pass |
| UI-16 | BR-71 | UI | Requester detail rendered with a payload that wrongly includes IT Priority and notes | Neither is rendered | `client/tests/lab-03/RequesterTicketDetailLab3.test.tsx` | Pass |
| UI-17 | AC-25, FR-21 | UI | Queue rows | Seven columns; *Unassigned* in italics; appears-resolved pill; "Requested:" sub-line only when priorities differ | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-18 | AC-26, FR-22 | UI | Search, each filter, sort, Clear filters | Request parameters and URL query updated; page resets to 1; Clear restores defaults | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-19 | AC-27, FR-23 | UI | Empty, no-results, and failure responses | Three distinct messages; Retry on failure | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-20 | AC-33 | UI | Queue as Administrator | Read-only pill shown | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-21 | AC-32, FR-25 | UI | IT Staff Ticket Detail layout | Ticket information read-only; controls editable; attachments download only | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-22 | AC-28, BR-31 | UI | Assign to me; server answers `409 STALE_STATE` | Sends `expectedOwnerId`; on conflict shows the banner and reloads | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-23 | AC-31, BR-46 | UI | Status control | Lists only permitted transitions; confirm dialogs with required text; ownerless ticket offers only Cancel with a hint | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-24 | AC-24, FR-20 | UI | Public comments and Internal notes tabs | Separate drafts per tab; note composer inside the Internal region with its caption and "Add internal note"; comment button "Post public comment". Built and tested as the shared `DiscussionPanel` component; Issue 8 mounts it on IT Staff Ticket Detail | `client/tests/lab-03/DiscussionPanel.test.tsx` | Pass |
| UI-25 | AC-33, FR-30 | UI | IT Staff Ticket Detail as Administrator | No composers or controls; read-only note shown | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-26 | AC-34, FR-31, FR-32 | UI | User Management list | Columns, "You" pill, search and role filter sent as parameters | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-27 | AC-35, FR-33 | UI | Create user panel | Field validation; Generate fills a policy-compliant password; success closes the panel and adds the row | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-28 | AC-36 | UI | Create answered `409 EMAIL_TAKEN` | Message below Email; panel stays open with input | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-29 | AC-37, AC-38 | UI | Edit user and set initial password | Save sends only changed fields; set password asks for confirmation first | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-30 | AC-39, BR-57 | UI | Edit panel for one's own account | Role and Active disabled with the reason; initial-password section replaced by a Change Password link | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-31 | AC-40, BR-58, BR-60 | UI | `LAST_ADMINISTRATOR` and `OWNS_OPEN_TICKETS` responses | Message beside the related field; nothing saved | `client/tests/lab-03/UserManagement.test.tsx` | Pass |

### 2.11 UI style

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| STYLE-01 | AC-44 | UI Style | Status badges for all 8 values | Class and label per ui-spec §1.2; `NEW` identical to Lab 2 | `client/tests/lab-03/ZenGreenLab3.test.tsx` | Pass |
| STYLE-02 | AC-44 | UI Style | Contrast of every badge and Internal-region pair, computed from the CSS | Each ≥ 4.5:1 | `client/tests/lab-03/ZenGreenLab3.test.tsx` | Planned |
| STYLE-03 | AC-24 | UI Style | Internal region | Uses `--zg-internal-*` tokens and carries the caption text | `client/tests/lab-03/ZenGreenLab3.test.tsx` | Pass |
| STYLE-04 | AC-32 | UI Style | Ticket controls vs ticket information | Controls use the editable field class; information uses `zg-field--readonly` | `client/tests/lab-03/ZenGreenLab3.test.tsx` | Pass |
| STYLE-05 | AC-44 | UI Style | Role badges and shared priority badges | Roles outlined/filled per §1.4; Requested and IT Priority of the same value share one class | `client/tests/lab-03/ZenGreenLab3.test.tsx` | Pass |
| STYLE-06 | AC-44 | UI Style | Scan new components and CSS for hex literals | None outside the token and badge definitions | `client/tests/lab-03/ZenGreenLab3.test.tsx` | Planned |

### 2.12 Responsive

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| RESP-01 | AC-27, AC-44 | Responsive | Queue at desktop, tablet, mobile | 7-column table, 6-column table, cards; no horizontal scroll | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| RESP-02 | AC-44 | Responsive | IT Staff Ticket Detail at the three widths | Controls beside main on desktop, above it otherwise; no overflow | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| RESP-03 | AC-44 | Responsive | User Management at the three widths | Table + side panel on desktop; full-screen panel on tablet and mobile; cards on mobile | `e2e/lab-03/user-administration.spec.ts` | Planned |
| RESP-04 | AC-44 | Responsive | Login and Change Password at the three widths | No overflow; mobile touch targets ≥ 44px | `e2e/lab-03/authentication.spec.ts` | Planned |
| RESP-05 | AC-15, AC-44 | Responsive | Shell on mobile | Hamburger holds the role's links, the user block, and both actions | `e2e/lab-03/authentication.spec.ts` | Planned |
| RESP-06 | AC-44 | Responsive | Keyboard-only pass through Login, queue filters, detail tabs, side panel | Logical order; focus always visible; dialogs trap and restore focus | `e2e/lab-03/user-administration.spec.ts` | Planned |

### 2.13 End-to-end

| Test ID | Requirement/AC | Type | What It Tests | Expected Result | Automated Test File | Final |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| E2E-01 | AC-01, AC-06 | E2E | Requester signs in, sees name and role, signs out, opens a protected URL | Login screen shown after sign-out | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-02 | AC-02, AC-35 | E2E | Administrator API creates a fresh user; that user signs in | Forced to Change Password; lands on home after a valid change | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-03 | AC-03, AC-04 | E2E | Wrong password for this run's fresh user, then an inactive account created for this run | Each shows its own message; per-run emails keep repeated runs from throttling a shared account | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-04 | AC-17, AC-19, AC-20 | E2E | Requester creates a ticket with an attachment, finds it, comments, marks appears resolved | Each step visible in the UI | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-05 | AC-25, AC-28 | E2E | IT Staff filter the queue to unassigned and claim a `NEW` ticket | Ticket shows them as owner and `OPEN` | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-06 | AC-30, AC-31 | E2E | IT Staff raise IT Priority, move to In Progress, then Resolved with a summary | Requester sees the status and the resolution summary | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-07 | AC-22, AC-24 | E2E | IT Staff add an Internal Note and a Public Comment | Requester sees the comment only | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-08 | AC-33 | E2E | Administrator opens the queue and a ticket | Everything readable; no operational control | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-09 | AC-34, AC-36 | E2E | Administrator searches, filters by role, creates a user, retries with a duplicate email | User appears; duplicate refused on the Email field | `e2e/lab-03/user-administration.spec.ts` | Planned |
| E2E-10 | AC-37, AC-38, AC-39 | E2E | Administrator deactivates a user, sets another's initial password, opens own account | Deactivated user cannot sign in; the other is forced to change; own Role/Active disabled | `e2e/lab-03/user-administration.spec.ts` | Planned |
| E2E-11 | AC-15, AC-41 | E2E | Requester opens `/admin/users`; the admin API is called with their session | Forbidden callout; API `403` | `e2e/lab-03/user-administration.spec.ts` | Planned |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
| :--- | :--- |
| AC-01 | API-01, API-02, UI-01, E2E-01 |
| AC-02 | API-11, API-12, UI-06, UI-12, E2E-02 |
| AC-03 | API-03, API-04, UI-02, E2E-03 |
| AC-04 | API-05, UI-03, E2E-03 |
| AC-05 | UNIT-06, API-06, API-07, API-73, API-83, UI-04 |
| AC-06 | API-09, UI-11, E2E-01 |
| AC-07 | UNIT-02, UNIT-03, API-13, API-14, UI-07, UI-08 |
| AC-08 | UNIT-05, API-10, UI-11 |
| AC-09 | API-15 |
| AC-10 | SEC-01 |
| AC-11 | SEC-02, SEC-03 |
| AC-12 | REG-01, REG-02, REG-17 |
| AC-13 | SEC-05, REG-13 |
| AC-14 | SEC-04 |
| AC-15 | UI-09, UI-10, RESP-05, E2E-11 |
| AC-16 | SEC-06 |
| AC-17 | REG-03, REG-04, REG-09, E2E-04 |
| AC-18 | REG-08, REG-14, REG-15, REG-16 |
| AC-19 | API-18, API-19, UI-14, E2E-04 |
| AC-20 | REG-10, REG-11, REG-12, UI-15, E2E-04 |
| AC-21 | API-20 |
| AC-22 | API-23, API-24, E2E-07 |
| AC-23 | API-21, API-22 |
| AC-24 | UI-24, STYLE-03, E2E-07 |
| AC-25 | UNIT-11, API-29, UI-17, E2E-05 |
| AC-26 | UNIT-10, API-30, API-31, API-32, API-33, API-34, API-35, API-37, API-79, UI-18 |
| AC-27 | UI-19, RESP-01 |
| AC-28 | API-44, API-45, API-74, UI-22, E2E-05 |
| AC-29 | API-46, API-47 |
| AC-30 | API-50, E2E-06 |
| AC-31 | UNIT-07, UNIT-08, UNIT-09, API-52, API-53, API-54, API-55, API-56, API-57, API-75, API-78, UI-23, E2E-06 |
| AC-32 | API-41, API-43, UI-21, STYLE-04 |
| AC-33 | SEC-08, API-39, API-42, UI-20, UI-25, E2E-08 |
| AC-34 | API-60, API-61, UI-26, E2E-09 |
| AC-35 | API-62, UI-27, E2E-02 |
| AC-36 | API-63, API-64, UI-28, E2E-09 |
| AC-37 | API-65, API-66, UI-29, E2E-10 |
| AC-38 | API-68, UI-29, E2E-10 |
| AC-39 | API-69, UI-30, E2E-10 |
| AC-40 | API-70, UI-31 |
| AC-41 | SEC-11, E2E-11 |
| AC-42 | MIG-01, MIG-02, MIG-03 |
| AC-43 | MIG-06, MIG-07 |
| AC-44 | STYLE-01, STYLE-02, STYLE-05, STYLE-06, RESP-01, RESP-02, RESP-03, RESP-04, RESP-05, RESP-06 |

All 44 acceptance criteria in `specification.md` §9 have at least one planned test;
none is uncovered. Rows that cite only a rule (`BR-##`, `FR-##`, `D-##`) cover behaviour below the
level of an acceptance criterion and are traced to that rule in §2.

### 3.1 Planned tests by issue

| Issue | Tests | Count |
| :--- | :--- | :--- |
| 1 — Sprint 3 Specification & Test Plan | none — documentation only | 0 |
| 2 — User Model, Lab 2 Migration & Seed | UNIT-01, REG-04, REG-17, MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06, MIG-07, MIG-08, MIG-09, MIG-10, MIG-11 | 14 |
| 3 — Authentication Foundation | UNIT-02, UNIT-03, UNIT-04, UNIT-05, UNIT-06, API-01, API-02, API-03, API-04, API-05, API-06, API-07, API-08, API-09, API-10, API-11, API-12, API-13, API-14, API-15, API-16, API-17, API-73, API-80, API-83, UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, UI-12 | 34 |
| 4 — Authorization Layer & Role-Based App Shell | SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, SEC-08, SEC-09, SEC-12, SEC-13, REG-01, REG-02, REG-08, REG-09, REG-15, UI-09, UI-10, UI-11, STYLE-05 | 20 |
| 5 — Requester Regression on Authenticated Identity | SEC-10, REG-03, REG-05, REG-06, REG-07, REG-16, UI-13, UI-16 | 8 |
| 6 — Public Comments & Internal Notes | REG-14, API-18, API-19, API-20, API-21, API-22, API-23, API-24, API-25, API-26, API-27, API-28, UI-14, UI-24, STYLE-03 | 15 |
| 7 — IT Staff Ticket Queue | UNIT-10, UNIT-11, API-29, API-30, API-31, API-32, API-33, API-34, API-35, API-36, API-37, API-38, API-39, API-40, API-79, API-59, UI-17, UI-18, UI-19, UI-20 | 20 |
| 8 — Ticket Workflow & IT Staff Ticket Detail | UNIT-07, UNIT-08, UNIT-09, REG-10, REG-11, REG-12, REG-13, API-41, API-42, API-43, API-44, API-45, API-46, API-47, API-48, API-49, API-50, API-51, API-52, API-53, API-54, API-55, API-56, API-57, API-58, API-74, API-75, API-76, API-78, API-81, UI-15, UI-21, UI-22, UI-23, UI-25, STYLE-01, STYLE-04 | 37 |
| 9 — Administrator User Management | SEC-11, API-60, API-61, API-62, API-63, API-64, API-65, API-66, API-67, API-68, API-69, API-70, API-82, API-71, API-77, API-72, UI-26, UI-27, UI-28, UI-29, UI-30, UI-31 | 22 |
| 10 — Responsive QA, Visual Checklist & E2E | STYLE-02, STYLE-06, RESP-01, RESP-02, RESP-03, RESP-04, RESP-05, RESP-06, E2E-01, E2E-02, E2E-03, E2E-04, E2E-05, E2E-06, E2E-07, E2E-08, E2E-09, E2E-10, E2E-11 | 19 |
| 11 — Integration & Release to Main | full regression of every row above on `lab3-staging`, then on `main` | — |

**Totals:** UNIT 11, API 83, SEC 13, REG 17, MIG 11, UI 31, STYLE 6, RESP 6, E2E 11 — **189 planned tests**.

## 4. Responsive and Visual Checklist

Filled in per issue against `ui-spec.md` §12; evidence under `artifacts/lab-03/screenshots/`
(`ui-spec.md` §13).

| Check | Login / Change Password | Requester Ticket Detail | Ticket Queue | IT Staff Ticket Detail | User Management |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Only `--zg-*` tokens and badge classes used | Pending | Pending | Pending | Pending | Pending |
| Role navigation correct for each role | Pending | Pending | Pending | Pending | Pending |
| Badges consistent (status, priority, role) | Pending | Pending | Pending | Pending | Pending |
| Editable vs read-only distinct | Pending | Pending | Pending | Pending | Pending |
| Public Comments vs Internal Notes distinct | Pending | Pending | Pending | Pending | Pending |
| Validation below fields; conflicts beside their control | Pending | Pending | Pending | Pending | Pending |
| Focus visible on every control | Pending | Pending | Pending | Pending | Pending |
| No clipping / overlap / horizontal overflow — desktop | Pending | Pending | Pending | Pending | Pending |
| No clipping / overlap / horizontal overflow — tablet | Pending | Pending | Pending | Pending | Pending |
| No clipping / overlap / horizontal overflow — mobile | Pending | Pending | Pending | Pending | Pending |
| Administrator read-only views show no operational control | Pending | Pending | Pending | Pending | Pending |

## 5. Test Commands

```bash
# Backend (Vitest + Supertest) — server/tests/lab-01..03
docker-compose exec server npm test

# Frontend (Vitest + Testing Library) — client/tests/lab-01..03
docker-compose exec client npm test

# E2E + responsive (Playwright, desktop/tablet/mobile projects) — e2e/lab-02..03
docker-compose exec client npx playwright test
```

## 6. Final Results

Pending. A row is marked Pass only after its test passes in a full local run on the issue's
branch before its PR opens; the complete suite is re-run on `main` after the release PR and its
output recorded here as the Part 3 evidence (labsheet §14).

## 7. Known Limitations or Deferred Tests

- **Login throttle is in-memory and keyed by email only (D-12).** UNIT-06, API-06/07, and API-73
  prove the rule within one server process; a restart clears it. Targeted lockout of a known email
  is a documented lab limitation, not a tested defence; multi-instance behaviour is out of scope.
- **Cookie flags are asserted from response headers.** API-01 checks `HttpOnly`, `SameSite=Strict`,
  and `Path`; whether a browser honours them is the browser's behaviour, exercised indirectly by the
  Playwright suites rather than asserted on its own.
- **Session expiry is tested by moving the stored expiry into the past** (UNIT-05, API-10), not by
  waiting 8 hours.
- **Concurrency tests use small bursts** (API-45, API-70): two parallel requests are enough to show
  the locking works; they do not measure behaviour under load.
- **Actions Taken** and any resolution rule depending on them are Lab 4 scope; no test covers them.
- **Route classification is proved from the route table (SEC-13).** A test cannot register a new
  Express handler ahead of the guard chain, so "an unclassified route is unreachable" is shown by
  dropping a policy row in the mutation pass (it then answers `404` and SEC-03/SEC-13 fail), not by
  a runtime probe.
- **Cross-browser coverage** stays at Playwright's Chromium projects, as in Lab 2.
- **E2E-created users remain** in the development database (no user-delete endpoint exists, BR-59).
  Each run uses unique emails so runs never collide; `npx prisma migrate reset` clears them.
- **Race tests (API-45, API-70, API-74 to API-77, API-82) fire two requests at once.** They prove the locks
  serialise the pair; they are run several times before a PR to rule out a lucky ordering.
