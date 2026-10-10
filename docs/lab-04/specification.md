# Lab 4 Sprint Engineering Specification — TokTickIT Actions Taken, Resolution Gate, Dashboards & Final Hardening

**Sprint:** Lab 4 · **Status:** Draft for review (Issue 1, `feature/1-sprint4-contract`)
**Owner:** WirachatTH

> **Numbering restarts for Lab 4**, as labsheet §4.4 asks (BR-01, BR-02, …). Every
> `FR-##`, `BR-##`, `AC-##`, and `D-##` in this file belongs to Sprint 4. An earlier
> rule is cited with its lab, for example "Lab 3 BR-41". Every Lab 2 and Lab 3 rule
> stays in force unless §5.11 names it as changed.

---

## 1. Sprint Goal

Let IT Staff plan and record the real work on a ticket as Actions Taken. Let the
backend refuse to resolve a ticket until that work is done. Give each role a concise,
backend-calculated Dashboard as its home screen. Then harden the whole application,
so every Lab 1–3 feature keeps working in one consistent Zen Green product.

## 2. Stakeholder Request Interpretation

After Lab 3, IT Staff can receive, own, prioritise and discuss tickets, but they cannot
show what was actually done. The stakeholder wants four things:

1. **A work log under each ticket.** Each Action Taken says when it happens, what is
   done, what came of it, who did it, whether follow-up is needed, and where to find
   any related images or files. Work can be planned and given to a colleague before it
   is done. The ticket's owner still coordinates the ticket, but other IT Staff can
   carry out individual actions.
2. **Resolution that reflects the work.** A ticket may become Resolved only when the
   recorded work supports it. The Requester's "Problem appears resolved" stays a hint
   to IT Staff, never a status change. The server enforces this even for a direct
   API call.
3. **A short summary for each role.** Each role gets a few counts and short lists, each
   leading to the detailed screen that already exists. The Dashboard summarises those
   screens; it does not replace them.
4. **A finished product.** The application gets consistent feedback, no
   double-submits, no lost input, no leftovers from earlier labs, and full regression
   across Labs 1–3.

## 3. Scope

### Included
- **Actions Taken** on any ticket:
  - list, create, edit (while planned), complete, and cancel;
  - an assignee, a status, an automatic Performed-by, follow-up flag and note,
    attachment notes, an explicit follow-up link;
  - an append-only change history;
  - optimistic concurrency.
- **Requester view:** the Requester sees their own tickets' Actions Taken read-only,
  with every field.
- **Final status-transition matrix and resolution gate**, enforced server-side. The
  status control offers only permitted transitions and explains a blocked Resolved.
- **Dashboards** for Requester, IT Staff, and Administrator: metric cards,
  per-status and per-priority counts, short lists, drill-down links, and every
  feedback state. The Dashboard is each role's home and first navigation item.
- **Drill-down filters:** the `status` filter on My Tickets, the `UNRESOLVED` value on
  the queue, and an activation filter on the user list, plus URL-driven filters on My
  Tickets and User Management, so every drill-down lands on a matching list.
- **One additive migration** (Actions Taken, history, `Ticket.resolvedAt`), its
  rollback plan, and an extended idempotent seed.
- **Final hardening:**
  - consistent feedback states;
  - duplicate-submit protection;
  - input kept after recoverable failures;
  - console-error-free journeys;
  - an up-to-date README;
  - full Lab 1–3 regression.

### Explicitly excluded
- Everything in labsheet §4.2:
  - SLA clocks, escalation, and on-call;
  - external notifications;
  - inventory, purchasing, cost, time-sheets, and payroll;
  - approval chains and signatures;
  - BI tools, report builders, and exports;
  - multi-tenancy and production operations.
- **Uploading files to an Action Taken.** "Attachment Notes" is text that says where
  to find files (stakeholder request). The ticket's own attachments are unchanged.
- **No delete endpoint for Actions Taken or their history.** A wrong action is
  cancelled with a reason instead.
- **Mockup elements not built:**
  - the "from yesterday" trend deltas (D-11);
  - a global "Search Tickets" box separate from the queue's search;
  - the "TikTockIT" spelling (Lab 3 D-17).
- **Admin changes to Lab 3 ticket operations.** Administrators still do not change
  owner, IT Priority, or status, or post comments or notes (Lab 3 BR-21; D-07).
- Editing or deleting Public Comments or Internal Notes (unchanged from Lab 3).

## 4. Functional Requirements

### 4.1 Actions Taken
| ID | Requirement |
| :--- | :--- |
| FR-01 | IT Staff Ticket Detail has an **Actions Taken** area listing every Action Taken of the ticket in a stable order (BR-24). |
| FR-02 | IT Staff and Administrators can create an Action Taken with Action Date/Time, Action Description, Assignee, Result, Follow-Up Required?, Follow-up Note, Attachment Notes, an optional link to the earlier action whose follow-up it handles, and an initial status of Planned or Completed. |
| FR-03 | IT Staff and Administrators can edit a Planned Action Taken. |
| FR-04 | IT Staff and Administrators can complete a Planned Action Taken, which needs a Result, or cancel it, which needs a reason. |
| FR-05 | Each Action Taken's change history (who changed what, when, and from what to what) can be viewed on IT Staff Ticket Detail. |
| FR-06 | The Requester Ticket Detail shows the ticket's Actions Taken read-only, with every field. |

### 4.2 Ticket workflow
| ID | Requirement |
| :--- | :--- |
| FR-07 | The backend enforces the final transition matrix (BR-27) and the resolution gate (BR-28), including for direct API calls. |
| FR-08 | The IT Staff status control offers only transitions permitted right now. When Resolved is blocked, it explains why and what is outstanding. |
| FR-09 | A successful status change, or an Action Taken change, refreshes the ticket summary on screen: status badge, ticket controls, gate explanation, and Actions Taken list. |

### 4.3 Dashboards
| ID | Requirement |
| :--- | :--- |
| FR-10 | A Dashboard screen (`/dashboard`) exists for every role. It is each role's home after login and the first item of its navigation, with the active-page indication. |
| FR-11 | The IT Staff Dashboard shows the BR-39 metrics, per-status and per-IT-Priority counts, the caller's planned Actions Taken, urgent tickets, and recently updated tickets. |
| FR-12 | The Requester Dashboard shows the BR-40 metrics and lists for the signed-in Requester's own tickets only. |
| FR-13 | The Administrator Dashboard shows the IT Staff Dashboard read-only, plus the BR-41 user-account counts. |
| FR-14 | Every metric card and list item has a drill-down link to a Ticket Queue, My Tickets, User Management, or Ticket Detail view that lists what it counts (BR-38). |
| FR-15 | Dashboards show loading, empty, forbidden, and safe-failure states, the time the data was calculated, and a Refresh action. |

### 4.4 Hardening and regression
| ID | Requirement |
| :--- | :--- |
| FR-16 | Every screen uses the same loading, validation, success, empty/no-results, forbidden, conflict, not-found, and safe-failure feedback patterns (labsheet §8.5). |
| FR-17 | Repeated clicks or a network retry never create a duplicate ticket, comment, note, user, or Action Taken (BR-43). |
| FR-18 | Create and edit forms keep the user's input after a recoverable failure (validation, conflict, network, or server error). |
| FR-19 | No journey logs a browser console error. No broken link, placeholder text, unfinished control, or obsolete Lab 1–3 element remains. |
| FR-20 | Every Lab 1–3 screen and API stays available to the roles allowed to use it. The README's setup, migration, seed, test, and demonstration instructions match the Lab 4 build. |

### 4.5 Data, seed, and presentation
| ID | Requirement |
| :--- | :--- |
| FR-21 | A single reviewed migration adds the Lab 4 tables and columns without losing or changing any Lab 1–3 row (§7.5). |
| FR-22 | The idempotent seed adds Actions Taken and dashboard-relevant data as described in §7.6. |
| FR-23 | Every new or changed screen works at desktop (≥992px), tablet (768–991px), and mobile (<768px) widths and meets the Lab 2/3 accessibility rules. |

## 5. Business Rules

### 5.1 Rules fixed by the handout
| ID | Rule |
| :--- | :--- |
| BR-01 | An Action Taken belongs to exactly one Ticket. Its ticket is set at creation and can never change. |
| BR-02 | The Ticket Owner coordinates the ticket, but an Action Taken may be assigned to, or performed by, any eligible IT Staff member or Administrator (BR-08). It need not be the owner, and a ticket need not have an owner to have Actions Taken. |
| BR-03 | **Performed by** is set by the server to the user who completes the action, or who creates it as Completed. The **creator** is set by the server to the user who creates it. A client-supplied value for either is ignored. |
| BR-04 | A Follow-up Note is required when Follow-Up Required is true. When the flag is false, the note is stored as empty, and any value sent is discarded. |
| BR-05 | The Requester's "Problem Appears Resolved" signal stays advisory (Lab 3 BR-05 and Lab 3 BR-47). It never changes status and never satisfies the resolution gate (BR-28). |

### 5.2 Action Taken fields and validation
| ID | Rule |
| :--- | :--- |
| BR-06 | Text lengths are counted after trimming:<br>• Action Description: 1–2000 characters, required.<br>• Result: 1–2000 when present; required to be Completed.<br>• Follow-up Note: 1–1000.<br>• Attachment Notes: 0–1000; empty is stored as no value.<br>• Cancellation reason: 10–1000.<br>All are stored and shown as plain text, with line breaks kept, never as HTML. |
| BR-07 | **Action Date/Time** (`actionAt`) is when the work happened or is planned. The rules:<br>• It is an ISO 8601 timestamp with an offset.<br>• It may not be earlier than the ticket's creation.<br>• A Planned action may be up to 365 days ahead.<br>• A Completed action may not be more than 5 minutes after the server's current time (a margin for client clock drift). Completing an action re-checks the date.<br>The UI fills in the current time by default. |
| BR-08 | Every Action Taken has exactly one **assignee**. It must be an active `IT_STAFF` or `ADMINISTRATOR` user at the moment it is set; otherwise `400` on `assigneeId`. If the assignee is deactivated later, the action keeps them and shows them as inactive, as Lab 3 BR-29 does for owners. |
| BR-09 | The server alone sets the creator, Performed by, creation and update times, completion and cancellation times, who cancelled, and the version. Client values for these are ignored. |

### 5.3 Action Taken status
| ID | Rule |
| :--- | :--- |
| BR-10 | An Action Taken's status is `PLANNED`, `COMPLETED`, or `CANCELLED`. It is created as `PLANNED` (work to do) or `COMPLETED` (work already done). The only transitions are `PLANNED → COMPLETED` and `PLANNED → CANCELLED`. `COMPLETED` and `CANCELLED` are final. |
| BR-11 | Completing an action (or creating it as `COMPLETED`):<br>• requires a Result;<br>• sets Performed by to the caller and the completion time to now;<br>• may set the final follow-up fields and Action Date/Time, which are checked by BR-04 and BR-07. |
| BR-12 | Cancelling an action requires a reason (BR-06). It records who cancelled and when. A cancelled action counts for nothing in the gate or the dashboards. |
| BR-13 | Only a `PLANNED` action can be edited. The editable fields are Action Date/Time, Description, Result, Assignee, Follow-Up Required, Follow-up Note, and Attachment Notes. Editing or changing the status of a `COMPLETED` or `CANCELLED` action is refused with `409 ACTION_NOT_PLANNED`. |
| BR-14 | **Follow-up link.** An action may name, at creation only, the earlier action whose follow-up it handles (`followUpOfId`). That earlier action must be on the same ticket, `COMPLETED`, and marked Follow-Up Required; otherwise `400` on `followUpOfId`. The link never changes afterwards. An action's follow-up is **handled** once at least one `COMPLETED` action links to it. |

### 5.4 Authorization
| ID | Rule |
| :--- | :--- |
| BR-15 | The Lab 3 matrix (Lab 3 BR-20) still applies, plus the rows below. Anything not granted is refused. |

| Operation | Requester | IT Staff | Administrator |
| :--- | :--- | :--- | :--- |
| List a ticket's Actions Taken | own ticket | any ticket | any ticket |
| Create, edit, complete, or cancel an Action Taken | — | any ticket | any ticket |
| Read an Action Taken's history | — | any ticket | any ticket |
| Be an Action Taken's assignee | — | ✓ | ✓ |
| Requester Dashboard | ✓ (own tickets only) | — | — |
| IT Staff Dashboard | — | ✓ | — |
| Administrator Dashboard | — | — | ✓ |

| ID | Rule |
| :--- | :--- |
| BR-16 | Any IT Staff member or Administrator may edit, complete, or cancel any `PLANNED` action, not only its assignee or creator. As with ticket ownership (Lab 3 BR-30), the assignee is accountable for the action, but is not its only possible actor. |
| BR-17 | Administrators gain the Action Taken writes above (labsheet §4.3). They keep Lab 3's read-only access to every other ticket operation: owner, IT Priority, status, comments, and notes (D-07). |
| BR-18 | Lab 3's guard order is unchanged (Lab 3 BR-22). A Requester calling any Action Taken write or history route gets `403`, whether or not the ticket exists. A Requester listing Actions Taken on a ticket they do not own gets `404`, the same as a missing ticket (Lab 3 BR-24). |
| BR-19 | Requesters see every field of every Action Taken on their own tickets, including assignee, Performed by, result, follow-up, and attachment notes (labsheet §8.3; D-09). They never see Internal Notes or IT Priority (Lab 3 BR-25 and Lab 3 D-09). |

### 5.5 Ticket state and Actions Taken
| ID | Rule |
| :--- | :--- |
| BR-20 | An Action Taken can be created, edited, completed, or cancelled only while its ticket is `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or `REOPENED`. Otherwise it is refused:<br>• `CLOSED` or `CANCELLED` ticket → `409 TICKET_CLOSED`;<br>• `RESOLVED` ticket → `409 TICKET_RESOLVED` (reopen it first; D-10).<br>Reading is always allowed. |
| BR-21 | Every Action Taken write updates the ticket's Last Updated time, as comments do (Lab 3 BR-52). |

### 5.6 History and ordering
| ID | Rule |
| :--- | :--- |
| BR-22 | Every create, edit, completion, and cancellation writes exactly one `ActionTakenEvent` in the same transaction. It holds the type (`CREATED`, `UPDATED`, `COMPLETED`, `CANCELLED`), the acting user, the server time, and each changed field's old and new value. No route edits or deletes an event or an Action Taken. |
| BR-23 | An edit that changes nothing returns `200`, writes no event, and leaves the version unchanged. |
| BR-24 | Actions Taken are listed by Action Date/Time ascending, then `id` ascending. History events are listed by creation time ascending, then `id` ascending. Editing an action's date moves it to its new place; everything else keeps its order across reads. |

### 5.7 Concurrency
| ID | Rule |
| :--- | :--- |
| BR-25 | Every edit and status change states the version the caller last saw (`expectedVersion`). If the action's version differs, the request is refused with `409 STALE_STATE` and nothing changes. A successful change adds 1 to the version. |
| BR-26 | Lock order (extends Lab 3 BR-80 and Lab 3 BR-81). Every Action Taken write locks its ticket row (`SELECT … FOR UPDATE`) first; when it sets an assignee, it then locks that user's row. Each status-dependent check (BR-13, BR-20, BR-25) runs only after those locks. The ticket status change also locks the ticket row, so an action write and a status change on one ticket always run one after the other, and the resolution gate never reads a stale set of actions. |

### 5.8 Ticket workflow and resolution gate
| ID | Rule |
| :--- | :--- |
| BR-27 | **Statuses and transitions.**<br>• The eight statuses are unchanged (Lab 3 BR-38).<br>• The final transition matrix is Lab 3 BR-41, unchanged, restated below.<br>• Only IT Staff change status (Lab 3 BR-39).<br>• Every Lab 3 status rule still applies: Lab 3 BR-42 to BR-48. |

| From | Permitted targets |
| :--- | :--- |
| `NEW` | `CANCELLED` (reaches `OPEN` only by gaining an owner, Lab 3 BR-32) |
| `OPEN` | `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`†, `CANCELLED` |
| `IN_PROGRESS` | `WAITING_FOR_REQUESTER`, `RESOLVED`†, `CANCELLED` |
| `WAITING_FOR_REQUESTER` | `IN_PROGRESS`, `RESOLVED`†, `CANCELLED` |
| `REOPENED` | `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`†, `CANCELLED` |
| `RESOLVED` | `CLOSED`, `REOPENED` |
| `CLOSED`, `CANCELLED` | — (terminal) |

† only when the resolution gate (BR-28) passes.

| ID | Rule |
| :--- | :--- |
| BR-28 | **Resolution gate.** A transition to `RESOLVED` needs all three:<br>(a) at least one `COMPLETED` Action Taken;<br>(b) no `PLANNED` Action Taken;<br>(c) no unhandled follow-up: every `COMPLETED` action marked Follow-Up Required has its follow-up handled (BR-14).<br>Otherwise it is refused with `409 RESOLUTION_BLOCKED` and nothing changes. The gate is checked under the ticket lock, after Lab 3's `STALE_STATE`, `INVALID_TRANSITION`, and `OWNER_REQUIRED` checks. |
| BR-29 | A resolved ticket can never hold planned work or an open follow-up. The gate guarantees this at the moment of resolving, and BR-20 keeps it true while the ticket is `RESOLVED`. `RESOLVED → CLOSED` therefore needs no gate of its own. |
| BR-30 | **What IT Staff Ticket Detail reports.**<br>• `permittedTransitions` leaves out `RESOLVED` while the gate fails.<br>• The detail also reports the gate: whether it passes, and the counts of completed actions, planned actions, and open follow-ups. This lets the UI explain the block (FR-08).<br>• The server re-checks the gate on every request regardless. |
| BR-31 | **Status side effects.**<br>• A transition to `RESOLVED` sets `Ticket.resolvedAt` to now.<br>• `REOPENED` clears it.<br>• `CLOSED` keeps it.<br>• Cancelling a ticket leaves its Actions Taken unchanged; they are read-only from then on (BR-20). Dashboards ignore Actions Taken on `CLOSED` or `CANCELLED` tickets (D-18). |
| BR-32 | After `REOPENED`, the gate counts every action on the ticket, including those completed before the reopen (D-14). The reopen reason is already posted publicly (Lab 3 BR-45). |

### 5.9 Dashboards
| ID | Rule |
| :--- | :--- |
| BR-33 | **Time zone.** Dashboards use Asia/Bangkok (UTC+07:00, no daylight saving).<br>• "Today" is 00:00 to 24:00 Bangkok time, i.e. 17:00 UTC the previous day to 17:00 UTC.<br>• "Last 7 days" runs from 00:00 Bangkok time six days ago until now.<br>Each response names the time zone and when it was calculated. |
| BR-34 | Every count and list comes from database queries the backend runs on current data, at request time. The client only displays the values; it never computes, filters, or adds them. |
| BR-35 | **Status groups.**<br>• **Unresolved** is `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, and `REOPENED`.<br>• **Active** is Unresolved plus `RESOLVED`; it is the Lab 3 queue's `ACTIVE`, all except `CLOSED` and `CANCELLED`. |
| BR-36 | The Requester Dashboard counts and lists only tickets whose Requester is the session user (Lab 3 BR-03). It never includes IT Priority, Internal Notes, or note counts. |
| BR-37 | **Size and empty data.**<br>• A dashboard list holds at most 5 items; no dashboard returns a whole ticket collection.<br>• A count with nothing to count is `0`, never missing or null.<br>• A list with nothing to list is `[]`, and the UI shows that list's empty message. |
| BR-38 | **Drill-down.**<br>• Every metric carries an `href`: a client route plus query string that opens a view listing the tickets it counts (or users, for BR-41).<br>• Where no existing view filters exactly, the `href` opens the closest superset, which includes every counted item and is sorted by recency. The only such cases are the two "today" metrics, marked in the BR-39 table. Every other `href`, including every user count (BR-41), lists exactly what it counts.<br>• Every list item links to its ticket's detail screen for the caller's role. |
| BR-39 | **IT Staff metrics.** All metrics are over the current tickets. "Me" is the session user. |

| Key | Label | Calculation | Drill-down `href` |
| :--- | :--- | :--- | :--- |
| `unassigned` | Unassigned | Active tickets with no owner | `/staff/queue?owner=unassigned` |
| `myTickets` | My tickets | Active tickets owned by me | `/staff/queue?owner=me` |
| `myPlannedActions` | My planned actions | `PLANNED` Actions Taken assigned to me, on tickets that are not `CLOSED` or `CANCELLED` | `/dashboard#my-planned-actions` (the list below; each item opens its ticket) |
| `appearsResolved` | Requester says resolved | Active tickets with the "appears resolved" signal set | `/staff/queue?appearsResolved=true` |
| `createdToday` | Created today | Tickets created today (BR-33), any status | `/staff/queue?status=ALL&sort=createdAt&order=desc` (superset, newest first) |
| `resolvedToday` | Resolved today | Tickets whose `resolvedAt` is today, now `RESOLVED` or `CLOSED` | `/staff/queue?status=ALL&sort=updatedAt&order=desc` (superset, most recently updated first) |
| `byStatus.<STATUS>` | one per status (8) | Tickets in that status | `/staff/queue?status=<STATUS>` |
| `byItPriority.<P>` | Low / Medium / High | Unresolved tickets with that IT Priority | `/staff/queue?status=UNRESOLVED&itPriority=<P>` |

| List | Content (≤ 5) | Order |
| :--- | :--- | :--- |
| `myPlannedActions` | my `PLANNED` actions, as counted above, with ticket number and summary | `actionAt` asc, `id` asc |
| `urgent` | Unresolved tickets with IT Priority `HIGH` | `createdAt` asc, `id` asc (longest-waiting first) |
| `recentlyUpdated` | Active tickets | `updatedAt` desc, `id` desc |

| ID | Rule |
| :--- | :--- |
| BR-40 | **Requester metrics.** All metrics are over the session user's own tickets. |

| Key | Label | Calculation | Drill-down `href` |
| :--- | :--- | :--- | :--- |
| `unresolved` | Open requests | own Unresolved tickets | `/tickets?status=UNRESOLVED` |
| `waitingForMe` | Waiting for you | own `WAITING_FOR_REQUESTER` tickets | `/tickets?status=WAITING_FOR_REQUESTER` |
| `resolved` | Resolved | own `RESOLVED` tickets (resolved, not yet closed) | `/tickets?status=RESOLVED` |
| `closed` | Closed | own `CLOSED` tickets | `/tickets?status=CLOSED` |

| List | Content (≤ 5) | Order |
| :--- | :--- | :--- |
| `needsAttention` | own `WAITING_FOR_REQUESTER` tickets | `updatedAt` desc, `id` desc |
| `recentlyUpdated` | own tickets, any status | `updatedAt` desc, `id` desc |
| `recentlyResolved` | own tickets with `resolvedAt` in the last 7 days (BR-33), now `RESOLVED` or `CLOSED` | `resolvedAt` desc, `id` desc |

| ID | Rule |
| :--- | :--- |
| BR-41 | **Administrator Dashboard.** It is the BR-39 payload for the calling Administrator, read-only, plus user counts: active users per role, each with `href` `/admin/users?role=<ROLE>&status=active`, and the number of inactive users, with `href` `/admin/users?status=inactive`. Each `href` lists exactly the users it counts (BR-38). |
| BR-42 | **Legacy tickets.** Tickets from Labs 1–3 have no Actions Taken and count in every ticket metric like any other ticket. `resolvedAt` is backfilled for those already `RESOLVED` or `CLOSED` (BR-47). A legacy Unresolved ticket must gain a completed action before it can be resolved (BR-28). |

### 5.10 Hardening
| ID | Rule |
| :--- | :--- |
| BR-43 | **Duplicate submissions.** Every submit control is disabled while its request is in flight. Creating an Action Taken also accepts an optional `clientRequestId` (a UUID made once per open form). A repeat with the same creator and `clientRequestId` returns the original action with `200` instead of creating a second one. A unique `(createdById, clientRequestId)` constraint guarantees this under concurrency. |
| BR-44 | After a recoverable failure (`400`, `409`, network error, or `5xx`), a form keeps everything the user typed. A `409 STALE_STATE` reloads the record on screen but keeps the unsaved input visible beside the reloaded values. |

### 5.11 Regression and changed earlier rules
| ID | Rule |
| :--- | :--- |
| BR-45 | Every Lab 2 and Lab 3 rule keeps its meaning, **except** these deliberate changes:<br>(1) each role's home screen and first navigation item is now `/dashboard` (Lab 3 FR-10, ui-spec §2; D-08);<br>(2) a transition to `RESOLVED` also needs the gate (BR-28) on top of Lab 3 BR-41 to BR-44;<br>(3) Administrators may write Actions Taken, an exception to Lab 3 BR-21 (D-07);<br>(4) My Tickets (`GET /api/tickets`) accepts an optional `status` filter, the queue's `status` filter accepts `UNRESOLVED`, and the user list (`GET /api/admin/users`) accepts an optional `status` filter of `active` or `inactive` (D-13); without them all three behave exactly as before. |
| BR-46 | Lab 1–3 tests keep their assertions except where a BR-45 change requires a new expectation. Those tests include, at least:<br>• the home-route and navigation tests (BR-45 (1));<br>• any Lab 3 test that resolves a ticket without a completed action (BR-45 (2));<br>• Lab 3 API-42 (`server/tests/lab-03/staff-ticket-detail.api.test.ts`): its strict check of the Administrator's `capabilities` gains `canWriteActions: true`, and its title no longer says "no capabilities" (BR-45 (3));<br>• Lab 2 REG-14 (`client/tests/lab-02/RequesterTicketDetail.test.tsx`): it asserts that Actions Taken never appear on Requester Ticket Detail, and is rewritten so they appear read-only while Internal Notes, IT Priority, and status controls stay absent (FR-06).<br>Each gets the extra setup or the new expectation, and nothing else. Every changed test is named, with its reason, in the PR that changes it. |

### 5.12 Migration and seed
| ID | Rule |
| :--- | :--- |
| BR-47 | The migration only adds: two enums, two tables, one nullable column, and indexes. The one existing value it writes is the `Ticket.resolvedAt` backfill: for tickets now `RESOLVED` or `CLOSED`, it is set to their current `updatedAt`, the best timestamp the Lab 3 schema holds (D-04). No other column of any existing row changes, including `updatedAt`. |
| BR-48 | The seed stays idempotent and additive (Lab 3 BR-78). A seed ticket's Actions Taken are added only while that ticket has none and is still in its seeded status. A second run therefore creates nothing, an action a demo has edited is never duplicated, and no planned work is added to a ticket a demo has since resolved. The seed never changes an Action Taken that already exists. |
| BR-49 | The seed's resolved and closed tickets satisfy the gate (BR-28): each has a completed action and no planned one. The seed never creates a state the API would refuse. |

## 6. UI Specification Summary

Full detail is in `docs/lab-04/ui-spec.md`. It extends Lab 2's and Lab 3's Zen Green
contracts and adds no second visual system.

- **Shell:** Dashboard is the first navigation item and home for every role, with
  Lab 2's underline plus `aria-current="page"`.
  - Requester: Dashboard, My Tickets, Create Ticket.
  - IT Staff: Dashboard, Ticket Queue.
  - Administrator: Dashboard, User Management, Ticket Queue.
- **Dashboard (`/dashboard`):**
  - a heading with the user's first name, "Updated at HH:mm (Bangkok time)", and Refresh;
  - a grid of metric cards (label, large value, "View" link with an accessible name);
  - a per-status strip and a per-IT-Priority strip (IT Staff and Administrator);
  - two or three short lists with "View all";
  - a Quick actions panel with role-appropriate links;
  - a User accounts card for Administrators.
  - States: skeleton loading; per-list empty messages; forbidden callout; failure banner
    with Retry. Layout: 4 cards per row at desktop, 2 at tablet, 1 at mobile.
- **Actions Taken area (IT Staff Ticket Detail):**
  - a section titled "Actions taken (n)" between Attachments and Conversation;
  - **Add action** (primary), which opens the Lab 3 side panel in create mode;
  - each action is a card: action status badge, date/time, description, assignee,
    Performed by, result, follow-up pill and note, attachment notes, "Follow-up of …"
    link;
  - a planned action has **Edit**, **Complete**, and **Cancel action**. Complete and
    Cancel open confirmation dialogs asking for the result or the reason;
  - **History** expands the append-only event list;
  - Administrators see the same controls (BR-17).
- **Requester Ticket Detail:** a read-only "Work on your request" section with the same
  cards and no controls or history.
- **Ticket controls:** the status select lists only `permittedTransitions`. A gate
  notice beside it says why Resolved is missing, for example "Resolved becomes
  available when every planned action is completed or cancelled (1 planned)."
- **Feedback:**
  - `409 STALE_STATE` → banner "This action was changed by someone else. It has been
    reloaded.", keeping the user's input;
  - other `409`s appear beside the control that caused them;
  - toasts confirm saves.
- **Responsive and accessibility:** the Lab 2/3 rules are unchanged. Cards stack on
  mobile, side panels become full-screen sheets, and there is no horizontal scroll.
  Every status (ticket and action) is shown as badge text, never colour alone.

## 7. Data Changes

All models live in `server/prisma/schema.prisma`.

### 7.1 Models
| Model | Change | Fields |
| :--- | :--- | :--- |
| `ActionTaken` | new | `id`; `ticketId` (FK → Ticket, cascade); `actionAt`; `description` (≤2000); `result` (≤2000, nullable); `status` (`ActionTakenStatus`, default `PLANNED`); `assigneeId` (FK → User, restrict); `createdById` (FK → User, restrict); `performedById` (nullable FK → User, restrict); `followUpRequired` (bool, default `false`); `followUpNote` (≤1000, nullable); `attachmentNotes` (≤1000, nullable); `followUpOfId` (nullable FK → ActionTaken, no action: checked at the end of the statement, so a ticket's cascade can delete a whole follow-up chain at once); `cancelReason` (≤1000, nullable); `cancelledById` (nullable FK → User, restrict); `completedAt`, `cancelledAt` (nullable); `version` (int, default 1); `clientRequestId` (UUID, nullable); `createdAt`; `updatedAt` |
| `ActionTakenEvent` | new | `id`; `actionTakenId` (FK → ActionTaken, cascade); `type` (`ActionTakenEventType`); `actorId` (FK → User, restrict); `changes` (JSON: `{ field: { from, to } }`); `createdAt` |
| `Ticket` | column added | `resolvedAt` (nullable timestamp, BR-31, BR-47) |
| All Lab 3 models | unchanged | — |

| Enum | Values |
| :--- | :--- |
| `ActionTakenStatus` | `PLANNED`, `COMPLETED`, `CANCELLED` |
| `ActionTakenEventType` | `CREATED`, `UPDATED`, `COMPLETED`, `CANCELLED` |

### 7.2 Relationships
- `Ticket` has many `ActionTaken`; each `ActionTaken` has exactly one ticket (BR-01).
  The cascade only serves test clean-up. No API route deletes a ticket.
- `ActionTaken` has many `ActionTakenEvent` (the append-only history; BR-22).
- `User` links to `ActionTaken` as assignee, creator, performer, and canceller. Each FK
  is `restrict`, because users are deactivated, never deleted (Lab 3 BR-59).
- `ActionTaken` optionally links to an earlier `ActionTaken` through `followUpOfId`
  (BR-14).

### 7.3 Indexes and constraints
| Index / constraint | Why |
| :--- | :--- |
| `ActionTaken(ticketId, actionAt, id)` | the per-ticket list in its BR-24 order |
| `ActionTaken(ticketId, status)` | the resolution gate's counts (BR-28) |
| `ActionTaken(assigneeId, status, actionAt)` | "My planned actions" count and list (BR-39) |
| `ActionTaken(followUpOfId)` | "is this follow-up handled?" (BR-14) |
| `ActionTaken(createdById, clientRequestId)` unique | duplicate-create protection (BR-43); `NULL`s never collide in PostgreSQL |
| `ActionTakenEvent(actionTakenId, createdAt, id)` | one ordered history read |
| `Ticket(requesterId, currentStatus)` | Requester Dashboard counts |
| `Ticket(updatedAt)` | "recently updated" lists |
| `Ticket(resolvedAt)` | "resolved today" and "recently resolved" |
| Database `CHECK`s | `version >= 1`; `followUpRequired` implies `followUpNote IS NOT NULL`; `status = 'COMPLETED'` implies `result` and `performedById` are set; `status = 'CANCELLED'` implies `cancelReason` is set. These back up BR-04, BR-11, and BR-12 if the application code is ever wrong |

### 7.4 Justified design decisions
| ID | Decision | Rationale |
| :--- | :--- | :--- |
| D-01 | An Action Taken is both a **planned task and a record**: it has an assignee and a status (`PLANNED` → `COMPLETED` / `CANCELLED`), and Performed by is set by the server when the work is completed. | The stakeholder asks to "plan and track the actual work". The grading table asks for assign, complete, cancel, and inactive-assignee rejection, and labsheet AC-01 names an "approved assignee". A pure record would satisfy only the field list. Creating directly as `COMPLETED` keeps "record what I just did" one step. |
| D-02 | Optimistic concurrency with an integer `version` (`expectedVersion` in each write), not `updatedAt`. | A counter compares exactly. A timestamp can lose precision across JSON and JavaScript `Date` (milliseconds) against PostgreSQL (microseconds), so a fresh read could compare as stale. A counter also says how many changes were missed. |
| D-03 | History lives in a separate append-only `ActionTakenEvent` table. The action row holds the current state. | Queries (gate, dashboards, the list) read one current row per action. The history table has no update path at all, so "append-only" is structural rather than a convention. Every write and its event share one transaction (BR-22). |
| D-04 | `Ticket.resolvedAt` is a column, backfilled from `updatedAt` for tickets already `RESOLVED` or `CLOSED`. | "Resolved today" and "recently resolved" become one indexed range query. Without it they would need a status history Lab 3 never stored. The backfill is an approximation: a Lab 3 ticket resolved and then commented on reports the comment's time. This is documented rather than hidden, and every ticket resolved after the migration is exact. |
| D-05 | Follow-up is handled through an explicit `followUpOfId` link, not inferred from "any later action". | The gate's condition (c) must be testable and explainable: the UI can show which follow-up is still open, and a cancelled follow-up visibly does not count. Inferring it from dates would let unrelated work close a follow-up silently. |

### 7.5 Migration plan
One migration, `lab4_actions_taken_dashboards`. It is generated with
`npx prisma migrate dev --create-only`, reviewed as SQL, and hand-edited only to add
the `CHECK` constraints and the backfill:

1. Create the `ActionTakenStatus` and `ActionTakenEventType` enums.
2. Create `ActionTaken` and `ActionTakenEvent` with their FKs, indexes, and `CHECK`s.
3. Add `Ticket.resolvedAt` (nullable) and its index.
4. `UPDATE "Ticket" SET "resolvedAt" = "updatedAt" WHERE "currentStatus" IN ('RESOLVED','CLOSED');`.
   This is a plain SQL update, so `updatedAt` itself is not touched.
5. Verify on a throwaway schema, never the shared development database:
   - load Lab 3-shaped data, apply the migration, and check that every Lab 1–3 row is
     unchanged apart from `resolvedAt`;
   - check that `prisma migrate diff … --exit-code` reports no drift (MIG rows in
     `tests.md`).

**Rollback / recovery** (labsheet §5.2):
- Take a `pg_dump` backup before applying, and restore it if needed.
- Or apply the reviewed down-script `server/prisma/rollback/lab4_down.sql`: drop the two
  tables, the two enums, `Ticket.resolvedAt`, and the new indexes, then delete the
  migration's `_prisma_migrations` row.
- Because the migration only adds, the down-script returns the schema to exactly
  Lab 3, with every Lab 3 row intact. MIG-04 applies up, down, then up again on a
  throwaway schema and compares the data each time.

### 7.6 Seed data
`npm run prisma:seed` (idempotent, BR-48) keeps every Lab 3 account and ticket and adds:

| Group | Content |
| :--- | :--- |
| Actions Taken | 15 actions across the seed tickets, enough for every case below:<br>• tickets with **zero**, **one**, and **several** (≥4) actions;<br>• every action status;<br>• follow-up chains: one handled, one still open;<br>• several assignees, including an inactive IT Staff assignee kept from before deactivation, and an Administrator assignee;<br>• attachment notes on some. |
| Gate states | an `IN_PROGRESS` ticket that can be resolved; one blocked by a planned action; one blocked by an open follow-up; one with no actions at all |
| Resolved tickets | every seed `RESOLVED` or `CLOSED` ticket has a completed action (BR-49) and a `resolvedAt`, some within the last 7 days |
| Dashboard data | IT Staff accounts with planned actions and owned tickets (non-zero), and the Administrator Krit Wattana, who owns no ticket and is assigned no action (zero "my" metrics); the Requester `first.login@kmutt.ac.th` has no tickets (empty Requester Dashboard). No account is added, so the Lab 3 account counts stay as documented |

Accounts and passwords are unchanged from Lab 3 (README). Tests never depend on
seeded rows' changeable state (Lab 3 BR-79 and Lab 3 D-22).

### 7.7 New dependencies
None. Time-zone boundaries are calculated with a fixed `+07:00` offset (BR-33; no DST),
so no date library is added.

## 8. API Contract

The authoritative contract is `docs/lab-04/api-spec.md`. Every Lab 2–3 route keeps its
contract, except the additive changes in BR-45.

| Capability | Route | Roles |
| :--- | :--- | :--- |
| List a ticket's Actions Taken | `GET /api/tickets/:id/actions-taken` | Requester (own), IT Staff, Administrator |
| Create an Action Taken | `POST /api/tickets/:id/actions-taken` | IT Staff, Administrator |
| Edit a planned Action Taken | `PATCH /api/tickets/:id/actions-taken/:actionId` | IT Staff, Administrator |
| Complete or cancel an Action Taken | `PATCH /api/tickets/:id/actions-taken/:actionId/status` | IT Staff, Administrator |
| An Action Taken's history | `GET /api/tickets/:id/actions-taken/:actionId/history` | IT Staff, Administrator |
| Requester Dashboard | `GET /api/dashboard/requester` | Requester |
| IT Staff Dashboard | `GET /api/dashboard/staff` | IT Staff |
| Administrator Dashboard | `GET /api/dashboard/admin` | Administrator |
| Who is signed in (page-load check) | `GET /api/auth/session` | anyone; `user: null` without a session (D-20) |
| *Changed:* status change | `PATCH /api/staff/tickets/:id/status` | IT Staff: adds `409 RESOLUTION_BLOCKED` and sets `resolvedAt` |
| *Changed:* IT Staff Ticket Detail | `GET /api/staff/tickets/:id` | adds `resolutionGate` and `capabilities.canWriteActions`; gated `permittedTransitions` |
| *Changed:* My Tickets | `GET /api/tickets` | adds optional `status` filter |
| *Changed:* Requester Ticket Detail | `GET /api/tickets/:id` | adds `resolvedAt` |
| *Changed:* Ticket Queue | `GET /api/staff/tickets` | `status` also accepts `UNRESOLVED` |
| *Changed:* User Management | `GET /api/admin/users` | adds optional `status` filter (`active`, `inactive`) |

New error codes: `RESOLUTION_BLOCKED`, `TICKET_RESOLVED`, `ACTION_NOT_PLANNED` (all
`409`). `STALE_STATE` also covers `expectedVersion`. The guard order, error envelope,
Origin guard, and route-policy table are unchanged.

## 9. Acceptance Criteria

### 9.1 Actions Taken — API
| ID | Criterion |
| :--- | :--- |
| AC-01 | Given a permitted IT Staff user and valid data, when an Action Taken is created, then it is saved under the correct Ticket with the authenticated creator and the approved assignee, and a `CREATED` history event is recorded. |
| AC-02 | Given an Administrator, when they create, edit, complete, and cancel Actions Taken, then each succeeds as it does for IT Staff, while every Lab 3 ticket mutation still returns `403` for them. |
| AC-03 | Given a missing description, a follow-up flag without a note, any text out of its BR-06 range, or an Action Date/Time outside BR-07, when an action is created, edited, or completed, then it is refused with `400` on that field and nothing is stored. |
| AC-04 | Given an inactive user, a Requester, or an unknown id as assignee, when an action is created or edited, then it is refused with `400` on `assigneeId`. |
| AC-05 | Given a planned action, when it is edited, then the changes are saved, the version rises by one, and an `UPDATED` event records each field's old and new value. An edit that changes nothing writes no event. |
| AC-06 | Given a planned action, when it is completed with a result, then it becomes `COMPLETED` with the caller as Performed by. When it is cancelled with a reason, then it becomes `CANCELLED`. Afterwards any edit or status change is refused with `409 ACTION_NOT_PLANNED`. |
| AC-07 | Given several Actions Taken on one ticket, when they are listed repeatedly and after edits, then they always appear by Action Date/Time and then id, and each history lists its events oldest first. No route edits or deletes either. |
| AC-08 | Given an edit or status change with an out-of-date `expectedVersion`, when it is sent, then it is refused with `409 STALE_STATE` and nothing changes. Given two concurrent changes from the same version, exactly one succeeds. |
| AC-09 | Given a Requester, when they list Actions Taken on their own ticket, then every field is returned. On another Requester's ticket the response is `404`, and every write or history route returns `403`. |
| AC-10 | Given a `RESOLVED`, `CLOSED`, or `CANCELLED` ticket, when any Action Taken write is attempted, then it is refused with `409` (`TICKET_RESOLVED` or `TICKET_CLOSED`), while listing still works. |
| AC-11 | Given client-supplied creator, Performed by, version, timestamps, or ticket id in a body, when an action is created or changed, then the server ignores them. |
| AC-12 | Given the same `clientRequestId` sent twice, or twice at once, by the same user, when an action is created, then exactly one action exists and both responses describe it. |

### 9.2 Ticket workflow and resolution gate
| ID | Criterion |
| :--- | :--- |
| AC-13 | Given each pair of statuses, when IT Staff request that transition with the gate satisfied, then exactly the BR-27 pairs succeed and every other pair is refused with nothing changed. All Lab 3 workflow rules still hold. |
| AC-14 | Given a ticket with no completed action, with a planned action, or with an unhandled follow-up, when a transition to `RESOLVED` is sent directly to the API, then it is refused with `409 RESOLUTION_BLOCKED` and the status is unchanged. Once the conditions hold, the same request succeeds and sets `resolvedAt`. |
| AC-15 | Given a request completing the last planned action and a request resolving the ticket sent at the same moment, then the ticket is never `RESOLVED` while any action on it is `PLANNED`. |
| AC-16 | Given IT Staff Ticket Detail, when the gate fails, then the status control does not offer Resolved and explains what is outstanding. After a successful status or Action Taken change, the status badge, controls, and gate notice update without a manual reload. |
| AC-17 | Given a Requester marks "Problem Appears Resolved", then the status does not change and the resolution gate is not satisfied by it. |

### 9.3 Dashboards — API
| ID | Criterion |
| :--- | :--- |
| AC-18 | Given an authenticated Requester, when dashboard data is retrieved, then only metrics and recent tickets owned by that Requester are returned. |
| AC-19 | Given IT Staff, when the dashboard is retrieved, then every BR-39 metric equals an independent database count for the same definition and caller, and every list follows its BR-39 content, order, and limit. |
| AC-20 | Given an Administrator, when the dashboard is retrieved, then it contains the BR-39 metrics for them and user counts equal to independent database counts. |
| AC-21 | Given tickets created or resolved just before and just after 00:00 Asia/Bangkok, when "today" and "last 7 days" metrics are computed, then each ticket falls on the correct Bangkok day. |
| AC-22 | Given no matching data, when any dashboard is retrieved, then every count is `0`, every list is `[]`, and the response is `200`. |
| AC-23 | Given any metric's `href`, when it is opened, then the view lists exactly the counted items, or, for the two "today" metrics BR-38 marks as supersets, includes every counted item, sorted by recency. |
| AC-24 | Given a role calling another role's dashboard endpoint, then it receives `403` with no metrics. Given no session, `401`. |
| AC-25 | Given the seeded data, when each dashboard endpoint is called repeatedly, then it answers within the D-17 budget, returns at most 5 items per list, and runs the same number of queries regardless of ticket count. |

### 9.4 Dashboards and Actions Taken — UI
| ID | Criterion |
| :--- | :--- |
| AC-26 | Given each role, when they sign in, then they land on `/dashboard`. Dashboard is the first navigation item and marked as the current page, and every Lab 1–3 screen of that role is still reachable from the navigation. |
| AC-27 | Given dashboard data, when the Dashboard renders, then each card shows the label and the exact value from the API, each drill-down has an accessible name and goes to its `href`, and the loading, empty, forbidden, and failure-with-Retry states appear when they apply. |
| AC-28 | Given IT Staff Ticket Detail, when IT Staff use the Actions Taken area, then they can list, create (planned or completed), edit, complete, and cancel actions, and view history. Only eligible assignees are offered. The follow-up note appears and is required only when follow-up is ticked. Complete and cancel ask for confirmation. |
| AC-29 | Given a Requester's Ticket Detail, when it has Actions Taken, then every field of every action is shown read-only with no create, edit, status, or history control. |
| AC-30 | Given a stale conflict, a double click, or a failed save in the Actions Taken area, then a reload banner appears, at most one action is created, and the typed input is kept. |

### 9.5 Data, regression, and presentation
| ID | Criterion |
| :--- | :--- |
| AC-31 | Given a database holding Lab 3 data, when the Lab 4 migration runs, then every Lab 1–3 row is preserved, legacy tickets have zero Actions Taken, and `resolvedAt` is backfilled per BR-47. When the documented rollback runs, the Lab 3 schema and data return intact. |
| AC-32 | Given the seed, when it runs twice, then the second run creates nothing new, and the seeded data contains tickets with zero, one, and several actions, every action and ticket status, and both zero and non-zero dashboard metrics. |
| AC-33 | Given the Lab 1–3 test suites (server, client, and E2E), when they run against the Lab 4 build, then they pass, changed only where BR-46 allows, with each change named in its PR. |
| AC-34 | Given every screen, when the full E2E journeys run, then no console error is logged, every link resolves, and loading, validation, success, empty, forbidden, conflict, not-found, and failure feedback follow the shared patterns. |
| AC-35 | Given every new or changed screen, when viewed at desktop, tablet, and mobile widths, then there is no clipping, overlap, or horizontal scroll. Focus is visible, controls are labelled, and status is never shown by colour alone. |
| AC-36 | Given every new route, when it is called with no session, a wrong role, or a foreign `Origin`, then it answers `401`, `403`, or `403 FORBIDDEN_ORIGIN` before any handler runs, and an error never exposes internals. |

## 10. Definition of Done

**Part 1 — Product completion** (used by the coding agent on every issue)
- [ ] Every planned test in `docs/lab-04/tests.md` exists and passes from the
      documented commands on the final `main`. None is skipped, disabled,
      commented out, or flaky.
- [ ] Every AC-## traces to at least one passing automated test.
- [ ] Every new rule was mutation-checked before its PR: removing or inverting the
      guarding line makes at least one test fail.
- [ ] Every protected route (Lab 2–4) enforces BR-15 and Lab 3 BR-20 server-side,
      proven by direct API calls with no session and with each wrong role.
- [ ] The resolution gate holds for direct API calls and under the completion/resolve
      race.
- [ ] Every dashboard count matches an independent database query, and no metric is
      computed in the client.
- [ ] The migration has been applied to Lab 3-shaped data and rolled back on a
      throwaway schema with no loss.
- [ ] All Lab 1–3 suites pass, changed only as BR-46 allows. Every change is named
      in its PR.
- [ ] The full E2E journeys at desktop, tablet, and mobile log no console error, and
      the visual and accessibility checklist (`ui-spec.md` §11) is complete.
- [ ] Every screen and route matches this specification, `api-spec.md`, and
      `ui-spec.md`. Any deviation is written back into the docs before release.
- [ ] No secret, real password, or token is committed or sent to the client bundle.

**Part 2 — Course delivery**
- [ ] All Lab 4 work went through feature branches and peer-reviewed PRs into
      `lab4-staging`, then exactly one release PR into `main`.
- [ ] `docs/lab-04/reviewer.md` records every PR, its reviewer, comments,
      responses, and approval. `ai-use.md` records the model, 6–10 key prompts, and
      the reflection on the specification agent and the coding agent.
- [ ] The README documents setup, migration (and rollback), seed, accounts, test
      commands, and a demo walkthrough. It is verified on a clean checkout.
- [ ] Screenshots of every Lab 4 screen at desktop, tablet, and mobile are under
      `artifacts/lab-04/screenshots/`.
- [ ] The GitHub Project board shows every Lab 4 issue in Done, and the PDF
      (Parts 1–9) is assembled and submitted.

## 11. Assumptions and Decisions

| ID | Decision | Rationale |
| :--- | :--- | :--- |
| D-06 | Numbering restarts at 01 for Lab 4, and earlier rules are cited as "Lab 3 BR-41". | Labsheet §4.4 asks for BR-01, BR-02, …, and Lab 3 set the same precedent. |
| D-07 | Administrators may write Actions Taken but keep Lab 3's read-only access to owner, IT Priority, status, comments, and notes. | Labsheet §4.3's Action Taken table gives Administrators "IT Staff behavior" for Actions Taken. Lab 3 D-06 deliberately kept other ticket operations to IT Staff, and nothing in Lab 4 asks to change that. Widening it would also rewrite Lab 3's SEC-08 and AC-33 for no stakeholder benefit. |
| D-08 | The Dashboard becomes every role's home and first navigation item. Lab 3's home-route tests are updated deliberately (BR-46). | A summary with links to everything is the natural starting point (labsheet §8.1, "operational starting point"). Keeping the old homes would hide the Dashboard behind a click. |
| D-09 | Requesters see every Action Taken field. | Labsheet §8.3: "Requesters will see all Actions Taken items." Private working text belongs in Internal Notes, which stay hidden (Lab 3 BR-25). The Actions Taken form says "Visible to the Requester" so nobody writes there by mistake. |
| D-10 | No Action Taken writes on `RESOLVED` tickets: reopen first (`409 TICKET_RESOLVED`). `CLOSED` and `CANCELLED` refuse with `TICKET_CLOSED`. | This keeps a resolved ticket free of planned work and open follow-ups (BR-29) without a second gate on `CLOSED`. New work on a resolved ticket means it is not really resolved, and `REOPENED` exists for exactly that (Lab 3 D-14). |
| D-11 | The mockups' "from yesterday" deltas are not built. | They need stored daily snapshots: a reporting store labsheet §4.2 excludes ("export warehouses"). Current counts with drill-down meet §4.6. |
| D-12 | Dashboard lists hold at most 5 items. "Recent" means newest first, and "recently resolved" means the last 7 Bangkok days. | Labsheet §6.2 asks for concise data, not whole collections. Five fits one mobile screen. "View all" opens the full list. |
| D-13 | Drill-down needs three additive filters: `status` on My Tickets (`ALL` default, `UNRESOLVED`, or one status), `UNRESOLVED` on the queue, and `status` (`active` or `inactive`) on the user list. My Tickets reads its status filter and sort from the URL; User Management reads its role and activation filters from the URL. The activation filter appears on screen as a removable "Active only" or "Inactive only" chip, not as a second toolbar control. | Without them, a Requester's "Waiting for you" card could only open an unfiltered list, and "Active IT Staff" would open a list that also holds inactive IT Staff (PR #74 review). All three are optional, and their defaults reproduce Lab 2/3 behaviour exactly, so no earlier test changes. Lab 3 kept User Management to one toolbar filter; the chip only shows a drill-down's filter and lets the user remove it, so the toolbar stays as it was. |
| D-14 | After `REOPENED`, actions completed before the reopen still count towards the gate. | Requiring "new work since reopen" needs a reopen timestamp and a rule for what counts as new. The public reopen reason (Lab 3 BR-45) already records why, and IT Staff are expected to add the follow-up work. Kept simple and stated. |
| D-15 | Duplicate-create protection uses a client-generated `clientRequestId` with a unique constraint, for Action Taken creation. Other creates rely on the disabled button. | A disabled button cannot stop a network retry. A server key can, and Actions Taken are the new create path. Earlier create paths keep their Lab 2/3 contracts and get UI busy-state protection, as BR-43 allows. |
| D-16 | Test files live under `server/tests/lab-04/`, `client/tests/lab-04/`, and `e2e/lab-04/`, with the file names labsheet §12 lists. Extra files are added only where §12 has no home (units, migration, regression, performance). | Matches labsheet §12 and the Lab 3 convention (Lab 3 D-20). |
| D-17 | Performance-smoke budget: on the seeded data, each dashboard endpoint's 95th-percentile time over 20 sequential calls is under 500 ms in the Docker test environment. Its query count stays the same when 50 more tickets are added. | The labsheet asks for a performance smoke test, not load testing. A fixed query count catches the real risk, an N+1 query, independent of machine speed. The time budget is generous enough not to flake on a laptop. |
| D-18 | Cancelling or closing a ticket leaves its planned actions as they are, and dashboards skip actions on `CLOSED` or `CANCELLED` tickets. | Changing actions automatically on a ticket transition would rewrite history the user did not touch. The actions stay visible and read-only (BR-20), and the dashboards do not report work nobody can do. |
| D-19 | The time zone is fixed to Asia/Bangkok on the server, not per user. | All users are in one organisation in Thailand, and the labsheet names no per-user setting. One fixed boundary makes counts identical for everyone and testable. |
| D-20 | The client asks who is signed in through a new `GET /api/auth/session`, which answers `200` with `user: null` when there is no session. Lab 3's `GET /api/auth/me` keeps its `401`. | The app asks on every page load, and a browser logs every `401` response as a console error, so each signed-out visit broke FR-19. Changing `/me` would rewrite Lab 3's contract and its tests (API-17, the authorization matrix), which BR-46 does not allow. An additive route changes no earlier rule. |
