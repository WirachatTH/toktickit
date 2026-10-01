# Lab 3 API Contract — TokTickIT Users, Roles, IT Staff Ticketing & Administration

Base URL: the browser calls same-origin `/api/...`, which the Vite dev server
proxies to the API (D-11; `API_PROXY_TARGET`, default `http://localhost:3000`, and
`http://server:3000` in Docker). Server tests call the Express app directly. Bodies
are JSON unless noted (ticket creation and attachment upload stay
`multipart/form-data`; attachment download returns the raw file). Rule references
(`BR-##`, `AC-##`, `D-##`) point to `docs/lab-03/specification.md`.

## 0. Conventions

### 0.1 Authentication — session cookie
Identity travels in exactly one place: the `tt_session` cookie (BR-15, BR-16).

| Cookie attribute | Value | Why |
| :--- | :--- | :--- |
| `HttpOnly` | yes | client JavaScript can never read the token, so an XSS bug cannot steal it |
| `SameSite` | `Strict` | the browser never attaches it to a request started from another site (D-11) |
| `Secure` | when `NODE_ENV=production` | local development is plain HTTP |
| `Path` | `/api` | only API requests carry it |
| `Max-Age` | `28800` (8 hours) | matches the server-side expiry (BR-17) |

The token is 32 random bytes, base64url-encoded. The server stores only
`sha256(token)` in `Session.tokenHash` (BR-15, D-02); each authenticated request is
one indexed lookup on that column joined to `User`. An expired or unknown token is
treated as no session (`401`).

Because every browser request goes through the same-origin `/api` proxy, the
session cookie is first-party in local development and in the Docker E2E setup
alike (D-11). The client still sends `credentials: "include"`. The server keeps
`cors({ origin: CLIENT_ORIGINS, credentials: true })` for anyone calling it
directly; `CLIENT_ORIGINS` is a comma-separated allow-list, default
`http://localhost:5173,http://localhost:5174` (the dev server and the Playwright
instance).

**Removed from Lab 2:** the `X-Dev-Requester-Id` header and `GET /api/requesters`
(FR-13). A request that still sends `X-Dev-Requester-Id` is not an error; the
header is ignored (AC-12).

### 0.2 Cross-origin guard
Any `POST`, `PATCH`, `PUT`, or `DELETE` whose `Origin` header is present and not in
`CLIENT_ORIGINS` is refused with `403 FORBIDDEN_ORIGIN` before session lookup or any
handler runs (BR-26). The Vite proxy forwards the page's own `Origin`, which is
on the list. `Origin: null` (sent by sandboxed frames) is not on the list and is
refused. Requests without an `Origin` header (server-to-server tools, Supertest,
Playwright's API client) are not affected; browsers always send `Origin` on
cross-origin state-changing requests, including `multipart/form-data` form posts.

### 0.3 Guard order
Every protected request passes these checks in order and stops at the first failure
(BR-22):

1. cross-origin guard (state-changing methods only) → `403 FORBIDDEN_ORIGIN`
2. session present and unexpired → `401 UNAUTHENTICATED`
3. password change not pending (except the three allowed routes) → `403 PASSWORD_CHANGE_REQUIRED`
4. role permitted by the BR-20 matrix → `403 FORBIDDEN`
5. ticket exists, and for Requesters is owned by the caller → `404 NOT_FOUND`
6. request body / parameters valid → `400 VALIDATION_ERROR`
7. business rules (transition, conflicts, safety rules) → `409 …`

Every operation that changes a ticket or adds to it locks the ticket row before
step 7 and holds it until it commits (BR-80). Assigning an owner and changing a
user's role or activation also lock user rows, following the one system-wide lock
order of BR-81: tickets before users, and several user rows only in one statement
in ascending `id` order. Concurrent requests are therefore checked one after the
other, never against a stale read, and never deadlock.

### 0.4 Error envelope (unchanged from Lab 2)
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Some fields need attention.", "fields": { "email": "Enter a valid email address." } } }
```
`message` is always safe to display: no stack trace, SQL, file path, internal id, or
password material. `fields` appears on validation failures and on conflicts that
belong to one field (for example `EMAIL_TAKEN`).

### 0.5 Error codes
Lab 2 codes keep their meaning; Lab 3 adds the rest.

| Code | Status | Meaning |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | 400 | body or parameter failed validation; see `fields` |
| `UNAUTHENTICATED` | 401 | no session, unknown token, or expired session |
| `INVALID_CREDENTIALS` | 401 | login: unknown email, wrong password, or account without a password — one message for all three (BR-10, BR-12) |
| `ACCOUNT_INACTIVE` | 403 | login: correct password for an inactive account (BR-13) |
| `PASSWORD_CHANGE_REQUIRED` | 403 | the session must change its password first (BR-02) |
| `FORBIDDEN` | 403 | the role is not permitted this operation (BR-20, BR-23) |
| `FORBIDDEN_ORIGIN` | 403 | state-changing request from a disallowed origin (BR-26) |
| `NOT_FOUND` | 404 | missing, or a ticket/attachment the Requester does not own (BR-24) |
| `CONFLICT` | 409 | Lab 2: attachment limit reached, or attachment already removed |
| `TICKET_CLOSED` | 409 | the operation is not allowed on a `CLOSED` or `CANCELLED` ticket (BR-37, BR-52, BR-70) |
| `INVALID_TRANSITION` | 409 | target status not permitted from the current one, or equal to it (BR-41) |
| `OWNER_REQUIRED` | 409 | transition or unassignment would leave a ticket that needs an owner without one (BR-36, BR-42) |
| `STALE_STATE` | 409 | `expectedStatus` or `expectedOwnerId` no longer matches the ticket (BR-31, BR-43) |
| `ALREADY_MARKED` | 409 | "Problem Appears Resolved" is already recorded, or not allowed in the current status (BR-47) |
| `EMAIL_TAKEN` | 409 | another user has this email, compared case-insensitively (BR-54) |
| `SELF_CHANGE_FORBIDDEN` | 409 | an Administrator tried to deactivate themselves, change their own role, or set their own initial password (BR-56, BR-57) |
| `LAST_ADMINISTRATOR` | 409 | the change would leave no active Administrator (BR-58) |
| `OWNS_OPEN_TICKETS` | 409 | role change to `REQUESTER` for a user who owns non-terminal tickets (BR-60) |
| `PAYLOAD_TOO_LARGE` | 413 | Lab 2: attachment over 5 MB |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Lab 2: attachment type not allowed |
| `TOO_MANY_ATTEMPTS` | 429 | login throttled for this email (BR-14); `Retry-After` header gives seconds |
| `INTERNAL_ERROR` | 500 | unexpected failure; message is always "Something went wrong. Please try again." |

### 0.6 Shared shapes
**User (as seen by its owner or an Administrator):**
```json
{ "id": 7, "name": "Pimchanok Srisuk", "email": "pimchanok.srisuk@kmutt.ac.th", "role": "IT_STAFF", "isActive": true, "mustChangePassword": false }
```
No response anywhere contains `passwordHash`, a session token, or a token hash.

**Person reference** (authors, owners, requesters inside ticket payloads):
`{ "id": 7, "name": "Pimchanok Srisuk", "role": "IT_STAFF", "isActive": true }`

**Pagination metadata** (unchanged): `{ "page": 1, "pageSize": 10, "totalItems": 23, "totalPages": 3 }`

**Status values:** `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`,
`RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED`. **Priority values:** `LOW`,
`MEDIUM`, `HIGH`. **Role values:** `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`.

---

## 1. Authentication

### 1.1 `POST /api/auth/login`
**Auth:** public. **Body:** `{ "email": "string", "password": "string" }`

Processing (BR-09 to BR-15): email trimmed and lowercased → throttle check → user
lookup (a dummy hash is verified when the email is unknown) → password verified →
only then activation state checked → session created, `lastLoginAt` set, cookie set.

**Response `200`:** `{ "user": <User> }` plus `Set-Cookie: tt_session=…`.
A user with `mustChangePassword: true` still receives a session; it can only reach
§1.2–§1.4 until the password is changed (BR-02).

| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | email or password missing |
| `401` | `INVALID_CREDENTIALS` | unknown email, wrong password, or no password set (identical response) |
| `403` | `ACCOUNT_INACTIVE` | correct password, inactive account |
| `429` | `TOO_MANY_ATTEMPTS` | 5 failures for this email in the last 15 minutes (counted the same for unknown emails) |

### 1.2 `GET /api/auth/me`
**Auth:** any session, including one that must change its password.
**Response `200`:** `{ "user": <User> }`. **Errors:** `401 UNAUTHENTICATED`.

### 1.3 `POST /api/auth/logout`
**Auth:** session optional. Deletes the session row if one is presented and clears
the cookie (`Max-Age=0`). **Response `204`**, also when no session was presented
(BR-18).

### 1.4 `POST /api/auth/change-password`
**Auth:** any session, including one that must change its password.
**Body:** `{ "currentPassword": "string", "newPassword": "string" }`. The
confirmation field is checked by the client only.

On success: hash replaced, `mustChangePassword` cleared, every **other** session of
this user deleted (BR-19). **Response `200`:** `{ "user": <User> }`.

| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | `fields.currentPassword`: incorrect; `fields.newPassword`: breaks BR-07 or equals the current password (BR-08) |
| `401` | `UNAUTHENTICATED` | no session |

A wrong `currentPassword` is a `400` on that field, not a `401`, so a typo does not
look like being signed out.

---

## 2. Reference data

`GET /api/categories`, `GET /api/systems`, and `GET /api/health` keep their Lab 1
and Lab 2 response shapes and stay **public** — no session needed (D-18). Lab 1's
public System Status page and `server/tests/lab-01/categories.test.ts` depend on
this. They return only non-sensitive lookup data.

---

## 3. Requester ticket endpoints (Lab 2, now session-based)

Every endpoint in this section requires role `REQUESTER` (`403 FORBIDDEN`
otherwise), except attachment metadata and download (§3.6), which IT Staff and
Administrators may also call. The Requester is always the session user (BR-03): a
`requesterId` in the body or query, or an `X-Dev-Requester-Id` header, is ignored.
Ownership failures are `404 NOT_FOUND` (BR-24).

### 3.1 `POST /api/tickets`
Unchanged request (`multipart/form-data`, Lab 2 api-spec §4). `currentStatus`,
`ticketNumber`, `itPriority`, `ownerId`, and `requesterId` are never read from the
request. The new ticket gets `requesterId` = session user, `currentStatus = NEW`,
`itPriority = requestedPriority`, no owner.
**Response `201`:** the Lab 2 shape. IT Priority is not included (D-09).

### 3.2 `GET /api/tickets`
Unchanged query parameters and response (Lab 2 api-spec §5), scoped to the session
user. `currentStatus` may now be any of the eight values.

### 3.3 `GET /api/tickets/:id`
Lab 2 response plus:
```json
{
  "currentStatus": "IN_PROGRESS",
  "owner": { "id": 7, "name": "Pimchanok Srisuk", "role": "IT_STAFF", "isActive": true },
  "resolutionSummary": null,
  "requesterResolvedAt": null,
  "canMarkAppearsResolved": true,
  "canComment": true
}
```
`owner` is `null` when unassigned. `itPriority`, Internal Notes, and note counts are
never included (BR-25, BR-71).

### 3.4 `POST /api/tickets/:id/attachments`
Unchanged (Lab 2 api-spec §7), plus `409 TICKET_CLOSED` on a `CLOSED` or
`CANCELLED` ticket (BR-70).

### 3.5 `PATCH /api/tickets/:ticketId/attachments/:attachmentId/remove`
Unchanged (Lab 2 api-spec §10), plus `409 TICKET_CLOSED` (BR-70).

### 3.6 `GET /api/tickets/:ticketId/attachments/:attachmentId` and `…/download`
Unchanged responses (Lab 2 api-spec §8–§9). **Roles:** Requester (own ticket only,
`404` otherwise), IT Staff and Administrator (any ticket). A soft-removed attachment's
download stays `404` for every role.

### 3.7 `POST /api/tickets/:id/appears-resolved`
**Role:** Requester, own ticket. **Body:** `{ "comment": "string, optional" }`.

Allowed while status is `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or
`REOPENED` and not already marked (BR-47). Sets `requesterResolvedAt` to now and,
when `comment` is non-empty after trimming, posts it as a Public Comment in the same
transaction. Status does not change (BR-05).

**Response `200`:** `{ "requesterResolvedAt": "2026-10-05T09:12:00.000Z", "comment": <Comment> | null }`

| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | `comment` over 2000 characters |
| `404` | `NOT_FOUND` | not the caller's ticket |
| `409` | `ALREADY_MARKED` | already marked, or status is `RESOLVED`, `CLOSED`, or `CANCELLED` |

No Requester endpoint accepts a status value; there is no route by which a
Requester can change status (BR-05, AC-20).

---

## 4. Public Comments and Internal Notes

**Comment / note shape:**
```json
{ "id": 31, "body": "Could you restart the laptop and try again?", "createdAt": "2026-10-05T08:00:00.000Z", "author": { "id": 7, "name": "Pimchanok Srisuk", "role": "IT_STAFF", "isActive": true } }
```
Lists are ordered `createdAt` ascending, then `id` ascending. Bodies are returned as
stored text; clients render them as text, never HTML (BR-51).

### 4.1 `GET /api/tickets/:id/comments`
**Roles:** Requester (own ticket; `404` otherwise), IT Staff, Administrator.
**Response `200`:** `{ "data": [<Comment>, …] }`. No pagination in Lab 3.

### 4.2 `POST /api/tickets/:id/comments`
**Roles:** Requester (own ticket), IT Staff. Administrator → `403` (BR-21).
**Body:** `{ "body": "string" }` — 1–2000 characters after trimming (BR-50).
Any `author`, `authorId`, or `createdAt` in the body is ignored. Updates the ticket's
`updatedAt`. **Response `201`:** `<Comment>`.

| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | `fields.body` empty, whitespace-only, or over 2000 |
| `403` | `FORBIDDEN` | Administrator |
| `404` | `NOT_FOUND` | ticket missing, or not the Requester's own |
| `409` | `TICKET_CLOSED` | ticket is `CLOSED` or `CANCELLED` (BR-52) |

### 4.3 `GET /api/tickets/:id/internal-notes`
**Roles:** IT Staff, Administrator. Requester → `403 FORBIDDEN` for every ticket id,
existing or not, with no note content or count (BR-25, AC-14).
**Response `200`:** `{ "data": [<Note>, …] }`.

### 4.4 `POST /api/tickets/:id/internal-notes`
**Role:** IT Staff only. Same body rules as §4.2; allowed on any status (BR-52).
**Response `201`:** `<Note>`. **Errors:** `400`, `403` (Requester, Administrator),
`404`.

No `PUT`, `PATCH`, or `DELETE` exists for comments or notes (BR-51, AC-23).

---

## 5. IT Staff ticket operations

### 5.1 `GET /api/staff/tickets` — the Ticket Queue
**Roles:** IT Staff, Administrator. Requester → `403 FORBIDDEN`.

| Param | Values | Default | Notes |
| :--- | :--- | :--- | :--- |
| `search` | string | — | trimmed; Ticket Number prefix, Summary substring, Requester name substring, case-insensitive (BR-61) |
| `status` | `ACTIVE`, `ALL`, or one status value | `ACTIVE` | `ACTIVE` = all except `CLOSED`, `CANCELLED` |
| `itPriority` | `LOW`, `MEDIUM`, `HIGH` | — | |
| `categoryId` | integer | — | |
| `owner` | `any`, `unassigned`, `me`, or a user id | `any` | |
| `appearsResolved` | `true` | — | only tickets the Requester has flagged |
| `sort` | `itPriority`, `createdAt`, `updatedAt`, `ticketNumber`, `status` | `itPriority` | |
| `order` | `asc`, `desc` | `desc` | see the ordering table below |
| `page` | integer ≥ 1 | `1` | |
| `pageSize` | integer 1–50 | `10` | |

Each `sort` has one fixed full key (BR-64), so a given `sort` + `order` always
means the same order — including the default, which is `sort=itPriority&order=desc`:

| `sort` | Full ordering |
| :--- | :--- |
| `itPriority` | `itPriority` in `order`, then `createdAt` asc, then `id` asc |
| `createdAt`, `updatedAt`, `ticketNumber`, `status` | that field in `order`, then `id` in the same direction |

Rebuilding a URL from `appliedQuery` therefore reproduces the same order on every
page. Status sorts by the lifecycle order of BR-38; priority by
`LOW < MEDIUM < HIGH`.

**Invalid values** — unknown enum, non-numeric id, out-of-range page or page size —
are replaced by their defaults (page size clamped to 1–50), never `400` (BR-66,
carrying forward Lab 2 D-5). A page beyond the last returns `data: []` (BR-67).

**Response `200`:**
```json
{
  "data": [
    {
      "id": 42, "ticketNumber": "TCK-000042", "summary": "Laptop battery drains quickly",
      "requester": { "id": 3, "name": "Somchai Prasert", "role": "REQUESTER", "isActive": true },
      "category": { "id": 2, "name": "Hardware" },
      "requestedPriority": "MEDIUM", "itPriority": "HIGH",
      "currentStatus": "IN_PROGRESS",
      "owner": { "id": 7, "name": "Pimchanok Srisuk", "role": "IT_STAFF", "isActive": true },
      "requesterResolvedAt": null,
      "createdAt": "2026-10-01T03:00:00.000Z", "updatedAt": "2026-10-05T08:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 10, "totalItems": 23, "totalPages": 3 },
  "appliedQuery": { "search": "", "status": "ACTIVE", "itPriority": null, "categoryId": null, "owner": "any", "appearsResolved": false, "sort": "itPriority", "order": "desc", "page": 1, "pageSize": 10 }
}
```
`appliedQuery` echoes what was actually applied after defaults and clamping, so the
UI can show the real filter state (BR-66).

### 5.2 `GET /api/staff/tickets/:id`
**Roles:** IT Staff, Administrator. **Response `200`:**
```json
{
  "id": 42, "ticketNumber": "TCK-000042",
  "requester": { "id": 3, "name": "Somchai Prasert", "email": "somchai.prasert@kmutt.ac.th", "isActive": true },
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
  "summary": "…", "description": "…",
  "requestedPriority": "MEDIUM", "itPriority": "HIGH",
  "currentStatus": "IN_PROGRESS",
  "owner": { "id": 7, "name": "Pimchanok Srisuk", "role": "IT_STAFF", "isActive": true },
  "resolutionSummary": null, "requesterResolvedAt": null,
  "createdAt": "…", "updatedAt": "…",
  "attachments": [ /* Lab 2 attachment shape, active and removed */ ],
  "permittedTransitions": ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  "capabilities": { "canAssign": true, "canChangePriority": true, "canChangeStatus": true, "canPostComment": true, "canPostNote": true }
}
```
`permittedTransitions` is the BR-41 row for the current status (empty for
Administrators and for terminal tickets). `capabilities` is computed for the caller's
role and the ticket's status; the UI renders from it, and the server re-checks every
mutation regardless (BR-27). Comments and notes are fetched from §4.

**Errors:** `401`, `403` (Requester), `404 NOT_FOUND`.

### 5.3 `GET /api/staff/assignable-users`
**Roles:** IT Staff, Administrator (read-only, to fill the queue's Owner filter —
BR-21). Requester → `403`. **Response `200`:** `{ "data": [<Person reference>, …] }`
— active `IT_STAFF` and `ADMINISTRATOR` users, ordered by name.

### 5.4 `PATCH /api/staff/tickets/:id/owner`
**Role:** IT Staff. **Body:** `{ "ownerId": 7 | null, "expectedOwnerId": 5 | null, "expectedStatus": "NEW" }`
— all three fields required (`ownerId` and `expectedOwnerId` may be `null`).

- Claim = `ownerId` is the caller, `expectedOwnerId: null`.
- `ownerId: null` unassigns; allowed only while status is `NEW` or `OPEN` (BR-36).
- If the ticket is `NEW` and gets an owner, its status becomes `OPEN` in the same
  transaction (BR-32).

**Response `200`:** the §5.2 payload.

| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | a field missing or of the wrong type; `fields.ownerId`: user missing, inactive, or not IT Staff / Administrator (BR-29) |
| `403` | `FORBIDDEN` | Requester or Administrator |
| `404` | `NOT_FOUND` | ticket missing |
| `409` | `STALE_STATE` | current owner ≠ `expectedOwnerId`, or current status ≠ `expectedStatus` (BR-31) |
| `409` | `TICKET_CLOSED` | ticket is `CLOSED` or `CANCELLED` |
| `409` | `OWNER_REQUIRED` | unassigning a ticket past `OPEN` (BR-36) |

Check order, after the §0.3 guards (BR-22: validation before business rules):
body shape → lock ticket row, then the proposed owner's user row (BR-80, BR-81) →
`fields.ownerId` eligibility → `STALE_STATE` → `TICKET_CLOSED` → `OWNER_REQUIRED`.

### 5.5 `PATCH /api/staff/tickets/:id/it-priority`
**Role:** IT Staff. **Body:** `{ "itPriority": "HIGH", "expectedStatus": "IN_PROGRESS" }`,
both required. `requestedPriority` in the body is ignored and never changes
(BR-33). Setting the current value is a no-op `200`. **Response `200`:** the §5.2
payload.
**Errors:** `400 VALIDATION_ERROR` (not a priority value, missing field), `403`,
`404`, `409 STALE_STATE` (status ≠ `expectedStatus`, BR-43), `409 TICKET_CLOSED`.
Check order: body shape → lock ticket row (BR-80) → `STALE_STATE` → `TICKET_CLOSED`.

### 5.6 `PATCH /api/staff/tickets/:id/status`
**Role:** IT Staff.
**Body:** `{ "status": "RESOLVED", "expectedStatus": "IN_PROGRESS", "expectedOwnerId": 7, "resolutionSummary": "…", "reason": "…" }`
— `status`, `expectedStatus`, and `expectedOwnerId` (may be `null`) are required;
the text field depends on the target.

| Target | Extra field | Rule |
| :--- | :--- | :--- |
| `RESOLVED` | `resolutionSummary`, 10–2000 chars | stored on the ticket (BR-44) |
| `CANCELLED`, `REOPENED` | `reason`, 10–1000 chars | posted as a Public Comment by the caller (BR-45) |
| `REOPENED` | — | also clears `resolutionSummary` |
| any | — | clears `requesterResolvedAt` (BR-48) |

**Response `200`:** the §5.2 payload.

| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | unknown status value; missing or invalid `expectedStatus` / `expectedOwnerId`; the text field the target requires missing or out of range |
| `403` | `FORBIDDEN` | Requester or Administrator |
| `404` | `NOT_FOUND` | ticket missing |
| `409` | `STALE_STATE` | current status ≠ `expectedStatus`, or current owner ≠ `expectedOwnerId` (BR-43) |
| `409` | `INVALID_TRANSITION` | target not in the BR-41 row, or equal to the current status |
| `409` | `OWNER_REQUIRED` | target is not `CANCELLED` and the ticket has no owner (BR-42) |

Check order, after the §0.3 guards. Everything that can be judged from the body
alone is validation and comes first, so it is always `400` before any `409`
(BR-22): body shape, including the text field the *requested* target needs → lock
ticket row (BR-80) → `STALE_STATE` → `INVALID_TRANSITION` → `OWNER_REQUIRED`. A
missing `expectedStatus` is therefore `400`, and a 3-character resolution summary
is `400` even when the transition itself would also have been refused.

---

## 6. Administrator user management

Every endpoint in this section requires role `ADMINISTRATOR`; Requester and IT
Staff receive `403 FORBIDDEN` with no user data (AC-41).

### 6.1 `GET /api/admin/users`
| Param | Values | Default |
| :--- | :--- | :--- |
| `search` | string — trimmed, case-insensitive substring of name or email | — |
| `role` | `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR` | all (an unknown value is ignored) |

Ordered by name, then id. No pagination, multi-sort, or multi-filter (labsheet §8.5).
**Response `200`:** `{ "data": [<User + "lastLoginAt", "createdAt">, …] }`.

### 6.2 `POST /api/admin/users`
**Body:** `{ "name": "…", "email": "…", "role": "IT_STAFF", "isActive": true, "initialPassword": "…" }`
Created with `mustChangePassword: true` (BR-55). **Response `201`:** `<User>`.

| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | `fields.name` (2–100), `fields.email` (format, ≤254), `fields.role` (not one of three, BR-53), `fields.isActive` (not boolean), `fields.initialPassword` (BR-07) |
| `409` | `EMAIL_TAKEN` | `fields.email` — already used, any letter case (BR-54) |

### 6.3 `PATCH /api/admin/users/:id`
**Body:** any subset of `{ "name", "email", "role", "isActive" }`. Password fields
are not accepted here (§6.4).

Effects: deactivation and role change delete the user's sessions (BR-59).
**Response `200`:** `<User>`.

| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | as §6.2 for the fields present |
| `404` | `NOT_FOUND` | user missing |
| `409` | `EMAIL_TAKEN` | as §6.2 |
| `409` | `SELF_CHANGE_FORBIDDEN` | caller changing their own `isActive` to false or their own `role` (BR-57) |
| `409` | `LAST_ADMINISTRATOR` | change would leave zero active Administrators (BR-58) |
| `409` | `OWNS_OPEN_TICKETS` | role → `REQUESTER` while owning non-terminal tickets (BR-60) |

### 6.4 `POST /api/admin/users/:id/initial-password`
**Body:** `{ "initialPassword": "…" }` (BR-07). Sets the hash, sets
`mustChangePassword`, deletes the user's sessions (BR-56). **Response `200`:**
`<User>`. **Errors:** `400` (`fields.initialPassword`), `404`,
`409 SELF_CHANGE_FORBIDDEN` (target is the caller — use §1.4).

No user-delete endpoint exists (BR-59).

---

## 7. Endpoint summary

| Method | Path | Session | Roles |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | no | public |
| `POST` | `/api/auth/login` | no | public |
| `POST` | `/api/auth/logout` | optional | any |
| `GET` | `/api/auth/me` | yes | any, incl. must-change |
| `POST` | `/api/auth/change-password` | yes | any, incl. must-change |
| `GET` | `/api/categories` | no | public |
| `GET` | `/api/systems` | no | public |
| `POST` | `/api/tickets` | yes | Requester |
| `GET` | `/api/tickets` | yes | Requester |
| `GET` | `/api/tickets/:id` | yes | Requester (own) |
| `POST` | `/api/tickets/:id/attachments` | yes | Requester (own) |
| `GET` | `/api/tickets/:ticketId/attachments/:attachmentId` | yes | Requester (own), IT Staff, Administrator |
| `GET` | `/api/tickets/:ticketId/attachments/:attachmentId/download` | yes | Requester (own), IT Staff, Administrator |
| `PATCH` | `/api/tickets/:ticketId/attachments/:attachmentId/remove` | yes | Requester (own) |
| `POST` | `/api/tickets/:id/appears-resolved` | yes | Requester (own) |
| `GET` | `/api/tickets/:id/comments` | yes | Requester (own), IT Staff, Administrator |
| `POST` | `/api/tickets/:id/comments` | yes | Requester (own), IT Staff |
| `GET` | `/api/tickets/:id/internal-notes` | yes | IT Staff, Administrator |
| `POST` | `/api/tickets/:id/internal-notes` | yes | IT Staff |
| `GET` | `/api/staff/tickets` | yes | IT Staff, Administrator |
| `GET` | `/api/staff/tickets/:id` | yes | IT Staff, Administrator |
| `GET` | `/api/staff/assignable-users` | yes | IT Staff, Administrator |
| `PATCH` | `/api/staff/tickets/:id/owner` | yes | IT Staff |
| `PATCH` | `/api/staff/tickets/:id/it-priority` | yes | IT Staff |
| `PATCH` | `/api/staff/tickets/:id/status` | yes | IT Staff |
| `GET` | `/api/admin/users` | yes | Administrator |
| `POST` | `/api/admin/users` | yes | Administrator |
| `PATCH` | `/api/admin/users/:id` | yes | Administrator |
| `POST` | `/api/admin/users/:id/initial-password` | yes | Administrator |

29 routes. Removed from Lab 2: `GET /api/requesters`.

## 8. Status code summary

| Status | Used for |
| :--- | :--- |
| `200` | successful read or change |
| `201` | comment, note, ticket, attachment, or user created |
| `204` | logout |
| `400` | invalid body or path value (`VALIDATION_ERROR`); list query values are defaulted instead (BR-66) |
| `401` | no or expired session; failed login |
| `403` | role not permitted; password change pending; inactive account at login; disallowed origin |
| `404` | missing, or not owned by the calling Requester |
| `409` | business-rule conflicts listed in §0.5 |
| `413` / `415` | attachment too large / wrong type (Lab 2) |
| `429` | login throttled |
| `500` | unexpected failure with a safe generic message |
