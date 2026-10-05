# Lab 4 API Contract — TokTickIT Actions Taken, Resolution Gate & Dashboards

This extends `docs/lab-03/api-spec.md`, which stays authoritative for every Lab 2–3
route except the changes in §4. Rule references (`BR-##`, `AC-##`, `D-##`) point to
`docs/lab-04/specification.md`; earlier rules are cited as "Lab 3 BR-##".

## 0. Conventions (unchanged from Lab 3)

Each of the following works exactly as in Lab 3 api-spec §0:
- the `tt_session` cookie;
- the same-origin `/api` proxy;
- the cross-origin guard (`403 FORBIDDEN_ORIGIN`);
- the route-policy table (`server/src/authorization.ts`): an unlisted path or method
  answers `404`;
- the error envelope;
- the shared shapes (User, Person reference, Pagination).

### 0.1 Guard order
Every new route goes through the same guard chain (Lab 3 BR-22), and each step stops
the request at the first failure:

1. cross-origin guard (state-changing methods only) → `403 FORBIDDEN_ORIGIN`
2. session → `401 UNAUTHENTICATED`
3. password change not pending → `403 PASSWORD_CHANGE_REQUIRED`
4. role permitted (BR-15) → `403 FORBIDDEN`
5. ticket exists (and, for a Requester, is theirs); the action exists **on that
   ticket** → `404 NOT_FOUND`
6. body valid (shape, types, lengths, dates that need no database) → `400 VALIDATION_ERROR`
7. lock the ticket row, then the assignee's user row if one is being set (BR-26) →
   database-dependent validation (`400` on `assigneeId`, `followUpOfId`, `actionAt`
   against the ticket's creation) → business rules (`409`)

### 0.2 New error codes
| Code | Status | Meaning |
| :--- | :--- | :--- |
| `RESOLUTION_BLOCKED` | 409 | transition to `RESOLVED` while the gate fails (BR-28). `details` gives the counts |
| `TICKET_RESOLVED` | 409 | Action Taken write on a `RESOLVED` ticket: reopen it first (BR-20, D-10) |
| `ACTION_NOT_PLANNED` | 409 | edit or status change of a `COMPLETED` or `CANCELLED` action (BR-13) |
| `STALE_STATE` | 409 | *widened:* also when `expectedVersion` ≠ the action's version (BR-25) |
| `TICKET_CLOSED` | 409 | *widened:* also Action Taken writes on a `CLOSED` or `CANCELLED` ticket (BR-20) |

The envelope is Lab 3's, with one optional addition used only by `RESOLUTION_BLOCKED`:
```json
{ "error": { "code": "RESOLUTION_BLOCKED", "message": "This ticket can't be resolved yet: 1 planned action is still open.", "details": { "completedCount": 2, "plannedCount": 1, "openFollowUpCount": 0 } } }
```

### 0.3 Time values
- Every timestamp in a response is ISO 8601 UTC (`…Z`), as in Lab 3.
- `actionAt` in a request must carry an offset (`Z` or `±HH:MM`). A value without one is
  `400`, so the server never guesses a time zone.
- Dashboards add `"timeZone": "Asia/Bangkok"` and `generatedAt` (BR-33).

---

## 1. Actions Taken

### 1.1 Action Taken shape
```json
{
  "id": 118,
  "ticketId": 42,
  "actionAt": "2026-10-05T03:30:00.000Z",
  "description": "Replaced the laptop battery.",
  "result": "Battery holds charge for 6 hours in testing.",
  "status": "COMPLETED",
  "assignee":    { "id": 7, "name": "Pimchanok Srisuk", "role": "IT_STAFF", "isActive": true },
  "createdBy":   { "id": 9, "name": "Anan Wongsa", "role": "IT_STAFF", "isActive": true },
  "performedBy": { "id": 7, "name": "Pimchanok Srisuk", "role": "IT_STAFF", "isActive": true },
  "followUpRequired": true,
  "followUpNote": "Check again after one week of normal use.",
  "followUpHandled": false,
  "followUpOfId": null,
  "attachmentNotes": "Battery serial photo is attachment battery-serial.jpg on this ticket.",
  "cancelReason": null,
  "cancelledBy": null,
  "completedAt": "2026-10-05T04:00:00.000Z",
  "cancelledAt": null,
  "version": 3,
  "createdAt": "2026-10-04T09:00:00.000Z",
  "updatedAt": "2026-10-05T04:00:00.000Z"
}
```
- `performedBy` is `null` until the action is completed. `cancelledBy` and
  `cancelReason` are `null` unless it was cancelled.
- `followUpHandled` is computed by the server (BR-14). It is `null` when
  `followUpRequired` is false.
- `clientRequestId` is never returned.
- The same shape goes to every permitted role, Requesters included (BR-19).

### 1.2 `GET /api/tickets/:id/actions-taken`
**Roles:** Requester (own ticket; otherwise `404`), IT Staff, Administrator.
**Response `200`:** `{ "data": [<Action Taken>, …] }`, ordered by `actionAt` asc, then
`id` asc (BR-24). There is no pagination: a ticket's actions are a bounded work log.
Works on tickets in every status.

**Errors:** `401`, `403` (none for the three roles), `404 NOT_FOUND`.

### 1.3 `POST /api/tickets/:id/actions-taken`
**Roles:** IT Staff, Administrator. Requester → `403`.

**Body:**
```json
{
  "status": "PLANNED",
  "actionAt": "2026-10-06T09:00:00+07:00",
  "description": "Replace the laptop battery.",
  "assigneeId": 7,
  "result": null,
  "followUpRequired": false,
  "followUpNote": null,
  "attachmentNotes": null,
  "followUpOfId": null,
  "clientRequestId": "6f1c0e5a-0d4b-4b8e-9d8a-2a3f5c1e7b90"
}
```

| Field | Rule |
| :--- | :--- |
| `status` | required; `PLANNED` or `COMPLETED` (BR-10) |
| `actionAt` | required; BR-07 (`COMPLETED`: no later than now + 5 min; `PLANNED`: no later than now + 365 days; never before the ticket's `createdAt`) |
| `description` | required; 1–2000 after trimming |
| `assigneeId` | required; an active `IT_STAFF` or `ADMINISTRATOR` (BR-08) |
| `result` | required for `COMPLETED`; optional for `PLANNED`; 1–2000 when present |
| `followUpRequired` | optional boolean, default `false` |
| `followUpNote` | required (1–1000) when `followUpRequired` is true; ignored and stored as `null` otherwise (BR-04) |
| `attachmentNotes` | optional; 0–1000; empty → `null` |
| `followUpOfId` | optional; an action on this ticket that is `COMPLETED` with `followUpRequired` (BR-14) |
| `clientRequestId` | optional UUID (BR-43) |

The server sets `createdById` to the caller. For `COMPLETED`, it also sets
`performedById` to the caller and `completedAt` to now (BR-03, BR-11). It writes a
`CREATED` event holding the initial values, and updates the ticket's `updatedAt`
(BR-21).

**Response `201`:** `<Action Taken>`. **Response `200`:** the existing action, when the
same caller repeats a `clientRequestId` (BR-43); in that case nothing is written.

| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | `fields.<name>` for any rule above; `fields.assigneeId` user missing, inactive, or a Requester; `fields.followUpOfId` not eligible; `fields.actionAt` before the ticket's creation or outside its window |
| `403` | `FORBIDDEN` | Requester |
| `404` | `NOT_FOUND` | ticket missing |
| `409` | `TICKET_RESOLVED` | ticket is `RESOLVED` |
| `409` | `TICKET_CLOSED` | ticket is `CLOSED` or `CANCELLED` |

**Check order** after the §0.1 guards:
1. body shape;
2. look up `clientRequestId` and return a replay if it matches;
3. lock the ticket, then the assignee;
4. assignee, `followUpOfId`, and `actionAt` eligibility;
5. `TICKET_RESOLVED` / `TICKET_CLOSED`.

### 1.4 `PATCH /api/tickets/:id/actions-taken/:actionId`
**Roles:** IT Staff, Administrator (BR-16: any of them, not only the assignee).
**Body:** `expectedVersion` (required integer), plus any subset of `actionAt`,
`description`, `assigneeId`, `result`, `followUpRequired`, `followUpNote`, and
`attachmentNotes`. Each has the §1.3 rule for a `PLANNED` action.
- `status`, `followUpOfId`, `ticketId`, `createdById`, `performedById`, and
  `version` are not accepted. If present, they are ignored (AC-11).
- Turning `followUpRequired` off clears `followUpNote`.
- Turning it on requires a note, either in the body or already stored.

**Effects:**
- If any value changes: version + 1, an `UPDATED` event with `{ field: { from, to } }`
  for each changed field, and the ticket's `updatedAt` updated.
- If nothing changes: `200` with the action unchanged, no event, and the same version
  (BR-23).

**Response `200`:** `<Action Taken>`.

| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | `expectedVersion` missing or not a positive integer; any field rule |
| `403` | `FORBIDDEN` | Requester |
| `404` | `NOT_FOUND` | ticket missing, or no such action on this ticket |
| `409` | `STALE_STATE` | version ≠ `expectedVersion` (BR-25) |
| `409` | `TICKET_RESOLVED` / `TICKET_CLOSED` | ticket status (BR-20) |
| `409` | `ACTION_NOT_PLANNED` | action is `COMPLETED` or `CANCELLED` (BR-13) |

**Check order:**
1. body shape;
2. lock the ticket, then the new assignee if one is set;
3. database-dependent `400`s;
4. `STALE_STATE`;
5. `TICKET_RESOLVED` / `TICKET_CLOSED`;
6. `ACTION_NOT_PLANNED`.

Checking the version first means a caller whose screen is out of date always learns
that first, and reloads.

### 1.5 `PATCH /api/tickets/:id/actions-taken/:actionId/status`
**Roles:** IT Staff, Administrator.

| Target | Body | Effect |
| :--- | :--- | :--- |
| `COMPLETED` | `{ "status": "COMPLETED", "expectedVersion": 3, "result": "…", "followUpRequired": false, "followUpNote": null, "actionAt": "…" }`: `result` is required unless already stored; the follow-up fields and `actionAt` are optional final values | `performedBy` = caller, `completedAt` = now, version + 1, a `COMPLETED` event (BR-11) |
| `CANCELLED` | `{ "status": "CANCELLED", "expectedVersion": 3, "reason": "Requester replaced the laptop instead." }` with `reason` 10–1000 | `cancelReason`, `cancelledBy` = caller, `cancelledAt` = now, version + 1, a `CANCELLED` event (BR-12) |

Both update the ticket's `updatedAt`. **Response `200`:** `<Action Taken>`.

| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | `status` not `COMPLETED` or `CANCELLED`; `expectedVersion` missing; `result` missing for completion; `reason` out of range; follow-up note missing while the flag is true; `actionAt` later than now + 5 min |
| `403` | `FORBIDDEN` | Requester |
| `404` | `NOT_FOUND` | ticket or action missing |
| `409` | `STALE_STATE` | version mismatch |
| `409` | `TICKET_RESOLVED` / `TICKET_CLOSED` | ticket status |
| `409` | `ACTION_NOT_PLANNED` | already `COMPLETED` or `CANCELLED` |

The check order is the same as §1.4.

### 1.6 `GET /api/tickets/:id/actions-taken/:actionId/history`
**Roles:** IT Staff, Administrator. Requester → `403` (BR-15).
**Response `200`:**
```json
{ "data": [
  { "id": 501, "type": "CREATED", "actor": <Person reference>, "createdAt": "…", "changes": { "description": { "from": null, "to": "Replace the laptop battery." }, "status": { "from": null, "to": "PLANNED" } } },
  { "id": 517, "type": "UPDATED", "actor": <Person reference>, "createdAt": "…", "changes": { "assigneeId": { "from": 9, "to": 7 } } },
  { "id": 530, "type": "COMPLETED", "actor": <Person reference>, "createdAt": "…", "changes": { "status": { "from": "PLANNED", "to": "COMPLETED" }, "result": { "from": null, "to": "Battery holds charge…" } } }
] }
```
- Events are ordered by `createdAt` asc, then `id` asc (BR-24).
- An assignee change records user ids; the UI resolves names from the assignable-user
  list it already holds, or shows "user #id".

**Errors:** `401`, `403`, `404`.

No `PUT`, `DELETE`, or other write exists for actions or events (BR-22). Any such
method answers `404` through the route-policy table.

---

## 2. Ticket workflow changes

### 2.1 `PATCH /api/staff/tickets/:id/status` (changed)
The request and every Lab 3 rule are unchanged (Lab 3 api-spec §5.6). Additions:
- **Resolution gate (BR-28):** for `status: "RESOLVED"`, after `STALE_STATE`,
  `INVALID_TRANSITION`, and `OWNER_REQUIRED`, the server counts the ticket's actions
  under the same ticket lock.
  - The conditions: at least one `COMPLETED`, no `PLANNED`, and no completed action
    with `followUpRequired` and no completed follow-up.
  - If any fails: `409 RESOLUTION_BLOCKED` with `details` (§0.2), and nothing changes.
- **`resolvedAt` (BR-31):** set to now on `RESOLVED`, cleared on `REOPENED`, and
  unchanged otherwise.

**Full check order:**
1. body shape;
2. lock the ticket;
3. `STALE_STATE`;
4. `INVALID_TRANSITION`;
5. `OWNER_REQUIRED`;
6. `RESOLUTION_BLOCKED`.

### 2.2 `GET /api/staff/tickets/:id` (changed)
Lab 3 payload, plus:
```json
{
  "resolvedAt": null,
  "resolutionGate": { "passes": false, "completedCount": 1, "plannedCount": 1, "openFollowUpCount": 0 },
  "permittedTransitions": ["WAITING_FOR_REQUESTER", "CANCELLED"],
  "capabilities": { "canAssign": true, "canChangePriority": true, "canChangeStatus": true, "canPostComment": true, "canPostNote": true, "canWriteActions": true }
}
```
- `permittedTransitions` is the BR-27 row without `RESOLVED` while the gate fails
  (BR-30). For Administrators it stays empty, as in Lab 3.
- `canWriteActions` is true for IT Staff and Administrators on tickets in a working
  status (BR-20), and false otherwise.
- `resolutionGate` is present for both roles.

### 2.3 `GET /api/tickets/:id` (Requester, changed)
The Lab 3 payload plus `resolvedAt`. Actions Taken are fetched from §1.2.

---

## 3. Dashboards

All three endpoints are `GET`, take no parameters (any query string is ignored), and
compute every value at request time (BR-34). The common envelope:
```json
{
  "generatedAt": "2026-10-05T09:12:00.000Z",
  "timeZone": "Asia/Bangkok",
  "today": { "start": "2026-10-04T17:00:00.000Z", "end": "2026-10-05T17:00:00.000Z" },
  "metrics": [ { "key": "unassigned", "label": "Unassigned", "value": 4, "href": "/staff/queue?owner=unassigned" } ],
  "lists": { }
}
```
- A metric is `{ key, label, value, href }`. `value` is always an integer ≥ 0, and
  `href` is a client route (BR-38).
- Metrics come in the order of the BR-39 and BR-40 tables, so the UI renders them as
  given.

**Ticket list item:**
`{ "id": 42, "ticketNumber": "TCK-000042", "summary": "…", "currentStatus": "IN_PROGRESS", "updatedAt": "…", "href": "/staff/tickets/42" }`.
- Staff and Administrator items add `itPriority` and `owner`.
- Requester items never carry `itPriority` (BR-36), and their `href` is
  `/tickets/:id`.

### 3.1 `GET /api/dashboard/requester`
**Role:** Requester. IT Staff and Administrator → `403`.
- `metrics`: `unresolved`, `waitingForMe`, `resolved`, `closed` (BR-40).
- `lists`: `needsAttention`, `recentlyUpdated`, `recentlyResolved`, each with at most
  5 items (BR-37). `recentlyResolved` items add `resolvedAt`.

Every number covers only tickets whose `requesterId` is the session user (BR-36,
AC-18). Any `requesterId` in the query is ignored.

### 3.2 `GET /api/dashboard/staff`
**Role:** IT Staff. Requester and Administrator → `403`. Administrators use §3.3.
- `metrics`: `unassigned`, `myTickets`, `myPlannedActions`, `appearsResolved`,
  `createdToday`, `resolvedToday` (BR-39).
- `byStatus`: 8 metrics in the Lab 3 BR-38 lifecycle order, keys `NEW` … `CANCELLED`.
- `byItPriority`: `HIGH`, `MEDIUM`, `LOW` over Unresolved tickets.
- `lists`:
  - `myPlannedActions`: up to 5 items of
    `{ "actionId": 118, "actionAt": "…", "description": "…", "ticket": { "id": 42, "ticketNumber": "TCK-000042", "summary": "…", "currentStatus": "IN_PROGRESS" }, "href": "/staff/tickets/42#action-118" }`;
  - `urgent`: up to 5 ticket list items;
  - `recentlyUpdated`: up to 5 ticket list items.

### 3.3 `GET /api/dashboard/admin`
**Role:** Administrator. Requester and IT Staff → `403`.
- The §3.2 payload computed for the calling Administrator (BR-41). "Me" is the
  Administrator, who may own tickets and be an assignee (Lab 3 BR-29; BR-08).
- Ticket `href`s point to the same staff routes, which Administrators open read-only
  (Lab 3 BR-21), with Actions Taken writable (BR-17).
- Adds `users`:
```json
"users": [
  { "key": "activeRequesters", "label": "Active Requesters", "value": 6, "href": "/admin/users?role=REQUESTER&status=active" },
  { "key": "activeItStaff", "label": "Active IT Staff", "value": 3, "href": "/admin/users?role=IT_STAFF&status=active" },
  { "key": "activeAdministrators", "label": "Active Administrators", "value": 2, "href": "/admin/users?role=ADMINISTRATOR&status=active" },
  { "key": "inactive", "label": "Inactive accounts", "value": 2, "href": "/admin/users?status=inactive" }
]
```

**Errors for all three:** `401`, `403 FORBIDDEN`, `403 PASSWORD_CHANGE_REQUIRED`, and
`500 INTERNAL_ERROR`. A failure is never a partial payload.

**Performance (D-17):** each endpoint runs a fixed set of aggregate and `LIMIT 5`
queries, so its query count does not grow with the number of tickets.

---

## 4. Changed Lab 2–3 list endpoints (drill-down filters, D-13)

### 4.1 `GET /api/tickets` (My Tickets)
Adds an optional `status` parameter:

| Value | Meaning |
| :--- | :--- |
| `ALL` (default, and any unknown value) | every own ticket, the Lab 2 behaviour |
| `UNRESOLVED` | own tickets in the Unresolved group (BR-35) |
| one status value | own tickets in that status |

Every other parameter, the ordering, pagination, and the response shape are
unchanged. Lenient parsing follows Lab 2 D-5: invalid values fall back to the default.

### 4.2 `GET /api/staff/tickets` (Ticket Queue)
`status` also accepts `UNRESOLVED` (BR-35). Everything else, including the `ACTIVE`
default and `appliedQuery`, is unchanged.

### 4.3 `GET /api/admin/users` (User Management)
Adds an optional `status` parameter:

| Value | Meaning |
| :--- | :--- |
| absent (default, and any unknown value) | every user, the Lab 3 behaviour |
| `active` | only users with `isActive: true` |
| `inactive` | only users with `isActive: false` |

It combines with `search` and `role` using AND. The ordering (name, then id) and the
response shape are unchanged. The User Management screen reads `role` and `status`
from the URL, so `/admin/users?role=IT_STAFF&status=active` lists exactly the users
the "Active IT Staff" card counts.

---

## 5. Endpoint summary

The 29 Lab 3 routes (Lab 3 api-spec §7) stay, with the changes in §2 and §4. New routes:

| Method | Path | Session | Roles |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/tickets/:id/actions-taken` | yes | Requester (own), IT Staff, Administrator |
| `POST` | `/api/tickets/:id/actions-taken` | yes | IT Staff, Administrator |
| `PATCH` | `/api/tickets/:id/actions-taken/:actionId` | yes | IT Staff, Administrator |
| `PATCH` | `/api/tickets/:id/actions-taken/:actionId/status` | yes | IT Staff, Administrator |
| `GET` | `/api/tickets/:id/actions-taken/:actionId/history` | yes | IT Staff, Administrator |
| `GET` | `/api/dashboard/requester` | yes | Requester |
| `GET` | `/api/dashboard/staff` | yes | IT Staff |
| `GET` | `/api/dashboard/admin` | yes | Administrator |

37 routes in total. Each one has a row in the route-policy table, and the
authorization sweep (SEC rows in `tests.md`) drives every route with no session, with
each denied role, and with each granted role.

## 6. Status code summary

Unchanged from Lab 3 api-spec §8, plus:

| Status | New uses in Lab 4 |
| :--- | :--- |
| `200` | a create replayed with the same `clientRequestId`; a no-change edit |
| `201` | Action Taken created |
| `409` | `RESOLUTION_BLOCKED`, `TICKET_RESOLVED`, `ACTION_NOT_PLANNED`; `STALE_STATE` for `expectedVersion` |
