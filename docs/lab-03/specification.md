# Lab 3 Sprint Engineering Specification — TokTickIT Users, Roles, IT Staff Ticketing & Administration

**Sprint:** Lab 3 · **Status:** Draft for review (Issue 1, `feature/1-sprint3-contract`)
**Owner:** WirachatTH

> **Numbering restarts for Lab 3.** Every `FR-##`, `BR-##`, `AC-##`, and `D-##` in
> this file belongs to Sprint 3 and is unrelated to the identically numbered item in
> `docs/lab-02/specification.md`. Where a Lab 2 rule is carried forward, it is
> restated here under its Lab 3 number with a pointer to its Lab 2 origin
> ("Lab 2 BR-13").

---

## 1. Sprint Goal

Replace the Lab 2 Development Requester selector with real email-and-password
authentication and server-enforced, role-based authorization for three roles —
Requester, IT Staff, and Administrator — without losing any Lab 2 ticket or
attachment data. On that foundation, deliver the first operational IT Staff
workflow (a shared Ticket Queue and an IT Staff Ticket Detail with ownership, IT
Priority, status changes, Public Comments, and Internal Notes) and a deliberately
minimal Administrator User Management screen, all in the same Zen Green design
language Lab 2 established.

## 2. Stakeholder Request Interpretation

The IT department now wants to *run* tickets, not just receive them. That needs
three things the Lab 2 build cannot provide:

1. **Knowing who is really using the app.** The Lab 2 selector let anyone act as
   anyone. Lab 3 must authenticate each person with their own email and password,
   make anyone holding a temporary (initial) password choose their own before they
   do anything else, and let them sign out in a way that truly ends their session.
2. **Different people seeing and doing different things — enforced by the server.**
   Requesters still only see their own tickets. IT Staff work a shared queue,
   decide who owns each ticket, re-prioritise it, move it through its lifecycle,
   talk to the Requester through Public Comments, and keep private working notes
   the Requester never sees. Administrators manage accounts. The stakeholder was
   explicit that hiding a button is not security: every rule here is enforced by
   the API, and the UI only mirrors it.
3. **A light-touch way to manage accounts.** One screen where an Administrator can
   find, create, and edit users, give each exactly one role, switch them on or off,
   and hand them a new temporary password — and nothing more elaborate than that.

Everything the Requester could do in Lab 2 keeps working, now tied to the signed-in
account, and the Requester gains one new voice in the process: they can comment on
their ticket and say "this appears to be fixed", while only IT Staff can formally
resolve or close it.

## 3. Scope

### Included
- Email/password login, logout, current-user retrieval, and mandatory first-login
  password change; voluntary password change for any signed-in user.
- Server-side sessions, a login-attempt throttle, and a cross-origin request guard.
- Server-side role and ownership authorization for every protected endpoint, and
  role-specific navigation in the application shell.
- Evolving Lab 2's `RequesterUser` into a real `User` model without losing Ticket or
  Attachment data; removing the Development Requester selector entirely.
- Requester regression: Create Ticket, My Tickets, Ticket Detail, and the
  attachment lifecycle working through the authenticated identity.
- Requester Public Comments and the "Problem Appears Resolved" signal.
- IT Staff Ticket Queue (search, filters, sorting, pagination).
- IT Staff Ticket Detail: ownership (claim/assign/reassign/unassign), IT Priority,
  the status lifecycle, Public Comments, Internal Notes, attachment access.
- Read-only ticket oversight for Administrators (queue and detail, no changes).
- Minimal Administrator User Management: list, search by name/email, optional role
  filter, create, edit, one-role assignment, activate/deactivate, set new initial
  password, with the two Administrator safety rules.
- Zen Green extensions: role, IT Priority, and all eight status badges; the
  Internal Note region; editable vs read-only operational fields.
- Idempotent seed data for all three roles, realistic tickets, comments, and notes.

### Explicitly excluded
- Email invitations, password-reset email, "forgot password" self-service, MFA,
  social login, SSO, self-registration.
- Actions Taken and any rule that depends on them (Lab 4).
- SLA calculation, escalation, notifications, dashboards or KPI analytics.
- Multiple roles per user, departments, profile photos, extended profiles,
  multi-tenant organisations.
- User deletion, bulk operations, import/export, role or account history screens,
  account unlocking or approval workflows.
- User-list pagination, multi-column sorting, and multiple simultaneous user filters.
- Editing or deleting Public Comments or Internal Notes.
- Production deployment and infrastructure changes.

## 4. Functional Requirements

### 4.1 Authentication and passwords
| ID | Requirement |
| :--- | :--- |
| FR-01 | The system provides a Login screen that accepts an email address and password and, on success, establishes an authenticated session for that user. |
| FR-02 | The system provides a current-user endpoint that returns the signed-in user's id, name, email, role, and whether they must change their password. |
| FR-03 | The system provides Logout, which ends the current session on the server and returns the user to the Login screen. |
| FR-04 | The system provides a Change Password screen that a user with an initial password is forced through before reaching any other screen, and that any signed-in user can also open voluntarily from the application shell. |
| FR-05 | The system tells a user whose correct credentials belong to an inactive account that the account is inactive, without revealing anything to a caller who did not prove the password. |
| FR-06 | The system throttles repeated failed logins for the same email address. |

### 4.2 Authorization and application shell
| ID | Requirement |
| :--- | :--- |
| FR-07 | Every API endpoint except health check, login, logout, and the public reference data (D-18) requires an authenticated session. |
| FR-08 | Every protected endpoint enforces the authorization matrix (BR-20) on the server, independent of what the UI shows. |
| FR-09 | The application shell shows the signed-in user's name and role badge, a Change Password action, and a Log Out action, replacing Lab 2's Development Requester display. |
| FR-10 | The application shell shows only the navigation destinations the user's role may open, and each role lands on its own home screen after login. |
| FR-11 | Opening a screen the role may not use shows a forbidden message on the user's own home screen; opening any protected screen while signed out shows the Login screen. |

### 4.3 Requester regression and Requester additions
| ID | Requirement |
| :--- | :--- |
| FR-12 | Create Ticket, My Tickets, Requester Ticket Detail, and the full attachment lifecycle work exactly as in Lab 2, with the Requester taken from the session instead of the selector. |
| FR-13 | The Development Requester Selection screen, the Change Requester action, the browser-stored selection, the `X-Dev-Requester-Id` header, and the active-requesters endpoint are removed. |
| FR-14 | The Requester Ticket Detail screen shows the ticket's current status, whether it has an owner, the resolution summary once one exists, and its Public Comments. |
| FR-15 | A Requester can post a Public Comment on their own ticket. |
| FR-16 | A Requester can mark their own open ticket as "Problem Appears Resolved", optionally with a comment. |

### 4.4 Public Comments and Internal Notes
| ID | Requirement |
| :--- | :--- |
| FR-17 | The system stores Public Comments per ticket, each with its author and server-generated creation time, readable by the ticket's Requester, IT Staff, and Administrators. |
| FR-18 | The system stores Internal Notes per ticket, each with its author and server-generated creation time, readable only by IT Staff and Administrators. |
| FR-19 | IT Staff can post Public Comments and Internal Notes on any ticket. |
| FR-20 | Public Comments and Internal Notes are shown in visibly different regions, each labelled with who can see it. |

### 4.5 IT Staff Ticket Queue
| ID | Requirement |
| :--- | :--- |
| FR-21 | The system provides an IT Staff Ticket Queue listing all Requesters' tickets with Ticket Number, Summary, Requester, Category, IT Priority, Requested Priority, Status, Owner, the "appears resolved" signal, and Last Updated. |
| FR-22 | The queue supports search, filtering by status, IT Priority, Category, owner, and the "appears resolved" signal, sorting, and pagination, as specified in BR-61 to BR-67. |
| FR-23 | The queue shows distinct loading, empty, no-results, forbidden, and failure states and a card layout below tablet width. |
| FR-24 | Each queue row opens the IT Staff Ticket Detail screen for that ticket. |

### 4.6 IT Staff Ticket Detail
| ID | Requirement |
| :--- | :--- |
| FR-25 | The system provides an IT Staff Ticket Detail screen showing the ticket's full information, its Requester, Requested and IT Priority, status, owner, resolution summary, attachments, Public Comments, and Internal Notes. |
| FR-26 | IT Staff can claim an unassigned ticket, assign or reassign it to an eligible user, and unassign it where BR-36 permits. |
| FR-27 | IT Staff can change a ticket's IT Priority. |
| FR-28 | IT Staff can move a ticket to any status the transition matrix (BR-41) permits from its current status, supplying a reason or resolution summary where required. |
| FR-29 | IT Staff and Administrators can download a ticket's active attachments from IT Staff Ticket Detail. |
| FR-30 | Administrators can open the IT Staff Ticket Queue and IT Staff Ticket Detail in a read-only mode with every operational control absent. |

### 4.7 Administrator User Management
| ID | Requirement |
| :--- | :--- |
| FR-31 | The system provides a User Management screen listing every user's Name, Email, Role, Status, and an Edit action. |
| FR-32 | User Management supports searching by name or email and optionally filtering by one role. |
| FR-33 | An Administrator can create a user with a name, email, exactly one role, an activation state, and an initial password. |
| FR-34 | An Administrator can edit a user's name, email, role, and activation state. |
| FR-35 | An Administrator can set a new initial password for another user, which that user must change at their next login. |
| FR-36 | User Management enforces BR-53 to BR-60 and shows field-level validation, success, forbidden, and safe-failure feedback. |

### 4.8 Data, seed, and cross-cutting
| ID | Requirement |
| :--- | :--- |
| FR-37 | A single reviewed database migration evolves the Lab 2 schema into the Lab 3 schema without losing Ticket, Attachment, Category, Related System, or Requester data. |
| FR-38 | An idempotent seed provides the accounts, tickets, comments, and notes listed in §7.6. |
| FR-39 | Every new screen presents consistent loading, success, validation, empty, no-results, forbidden, not-found, conflict, and safe-failure feedback where meaningful (labsheet §8.6). |
| FR-40 | Every new screen is usable at desktop (≥992px), tablet (768–991px), and mobile (<768px) widths and meets the Lab 2 accessibility rules. |

## 5. Business Rules

### 5.1 Rules fixed by the handout
| ID | Rule |
| :--- | :--- |
| BR-01 | Only an active user with valid credentials may authenticate. |
| BR-02 | A user who must change their password cannot use any part of the application other than Change Password, current-user, and Log Out until a valid new password is saved. |
| BR-03 | The authenticated session — never a client-supplied id, body field, query parameter, or header — determines who the Requester is for every Requester operation. |
| BR-04 | Public Comments are visible to the ticket's Requester, IT Staff, and Administrators; Internal Notes are visible only to IT Staff and Administrators. |
| BR-05 | A Requester may mark a ticket "Problem Appears Resolved" but can never set a ticket's status to Resolved or Closed, or to any other status. |

### 5.2 Credentials and passwords
| ID | Rule |
| :--- | :--- |
| BR-06 | Passwords are stored only as a salted `scrypt` hash (Node's built-in `crypto`), never in plaintext, and never appear in any log, API response, or seed file. |
| BR-07 | A new password must be 10–128 characters, contain at least one letter and at least one digit, and must not equal the user's own email address (case-insensitive). Passwords are not trimmed. |
| BR-08 | A changed password must differ from the user's current password. |
| BR-09 | Email addresses are trimmed and stored lowercased; login and uniqueness compare them case-insensitively. |
| BR-10 | A user whose password hash is empty (a migrated account that has not yet been given a password, BR-76) cannot log in, and the login response is identical to a wrong password. |
| BR-11 | The application never sends, emails, or displays a password after it is set; an Administrator-typed initial password is shown only in the field where it was typed. |

### 5.3 Login, sessions, and logout
| ID | Rule |
| :--- | :--- |
| BR-12 | An unknown email and a wrong password produce the same `401` response and message, and take comparable time (a dummy hash is verified for unknown emails). |
| BR-13 | The password is verified before activation state is checked: only a caller who supplied the correct password for an inactive account is told the account is inactive (`403`). |
| BR-14 | After 5 failed logins for the same email within 15 minutes, further attempts for that email are refused with `429` until the oldest failure leaves the window; a successful login clears that email's count. The throttle applies identically to emails that do not exist, and the store holds at most 10,000 emails (D-12). |
| BR-15 | A successful login creates a server-side session holding only the SHA-256 hash of a random 32-byte token; the raw token travels only in the session cookie. |
| BR-16 | The session cookie is `HttpOnly`, `SameSite=Strict`, scoped to `/api`, and `Secure` outside local development; it is never readable by client-side JavaScript. |
| BR-17 | A session expires 8 hours after it is created; an expired session is treated exactly like no session and is deleted when next presented. A successful login also deletes that user's other expired sessions, so abandoned rows do not accumulate. |
| BR-18 | Logout deletes the session on the server and clears the cookie; the old cookie can never be used again. Logout without a session still succeeds. |
| BR-19 | Changing one's own password ends every other session of that user; the session that made the change stays signed in. |

### 5.4 Authorization
| ID | Rule |
| :--- | :--- |
| BR-20 | Every user holds exactly one role — `REQUESTER`, `IT_STAFF`, or `ADMINISTRATOR` — and the following matrix is the complete list of what each may do. Anything not granted is refused. |

| Operation | Requester | IT Staff | Administrator |
| :--- | :--- | :--- | :--- |
| Log in, log out, read own profile, change own password | ✓ | ✓ | ✓ |
| Read Categories and Related Systems (public, no session needed — D-18) | ✓ | ✓ | ✓ |
| Create a ticket | ✓ | — | — |
| List own tickets, open own Requester Ticket Detail | own | — | — |
| Add or soft-remove an attachment | own ticket | — | — |
| Read attachment metadata, download an active attachment | own ticket | any ticket | any ticket |
| Read Public Comments | own ticket | any ticket | any ticket |
| Post a Public Comment | own ticket | any ticket | — |
| Mark "Problem Appears Resolved" | own ticket | — | — |
| Read Internal Notes | — | any ticket | any ticket |
| Post an Internal Note | — | any ticket | — |
| Read the IT Staff Ticket Queue and IT Staff Ticket Detail | — | ✓ | ✓ (read-only) |
| List assignable owners (fills the queue's Owner filter and the owner select) | — | ✓ | ✓ |
| Claim, assign, reassign, or unassign a ticket | — | ✓ | — |
| Change IT Priority | — | ✓ | — |
| Change a ticket's status | — | ✓ | — |
| Be a ticket's owner | — | ✓ | ✓ |
| List, search, create, and edit users; set an initial password | — | — | ✓ |

| ID | Rule |
| :--- | :--- |
| BR-21 | Administrators do not inherit IT Staff ticket operations: they may view tickets, comments, notes, attachments, and the assignable-owner list read-only, and may be chosen as a ticket's owner, but they cannot change any ticket or post on it (D-06). |
| BR-22 | Guards run in a fixed order: cross-origin check → session → mandatory password change → role → ticket existence and ownership → input validation → business rules. A caller therefore learns "sign in" before "not allowed", and "not allowed" before anything about the resource. |
| BR-23 | Missing or expired session → `401`. Authenticated but role not permitted → `403`, with no resource data in the body. Must change password first → `403` with its own error code. |
| BR-24 | A Requester asking for a ticket, attachment, or comment thread on a ticket they do not own receives `404`, identical to a ticket that does not exist (carried forward from Lab 2 BR-13). |
| BR-25 | A role check fails before any lookup, so a Requester calling an IT Staff or Administrator endpoint — including Internal Notes — receives `403` whether or not the ticket exists, and no response to a Requester ever contains Internal Note content or an Internal Note count. |
| BR-26 | State-changing requests (`POST`, `PATCH`, `PUT`, `DELETE`) that carry an `Origin` header not on the configured client-origin list are refused with `403` before any handler runs. This protects the `multipart/form-data` attachment endpoints, which a cross-site HTML form could otherwise target. |
| BR-27 | The frontend hides or disables controls the role may not use, but every such control is also refused by the server (BR-20); a hidden control is feedback, not protection. |

### 5.5 Ownership and priority
| ID | Rule |
| :--- | :--- |
| BR-28 | A ticket has zero or one owner. New tickets arrive unassigned. |
| BR-29 | An owner must be an active IT Staff member or Administrator **at the moment of assignment**. If an owner is later deactivated, the ticket keeps them as owner and they are shown as inactive until IT Staff reassign it. |
| BR-30 | Any IT Staff member may claim (assign to self) an unassigned ticket, or assign, reassign, or unassign any ticket; ownership does not restrict who may act on a ticket, only who is accountable for it. |
| BR-31 | Every ownership change states **both** the owner and the status the caller expects the ticket to have now (`expectedOwnerId`, `expectedStatus`); if either differs (someone else changed the ticket first), the change is refused with `409` and nothing is modified. Checking both stops a claim from reopening a ticket that was just cancelled, and an unassignment from leaving a ticket that just moved past `OPEN` without an owner. |
| BR-32 | Assigning an owner to a `NEW` ticket also moves it to `OPEN` in the same transaction. |
| BR-33 | Requested Priority is the Requester's value from ticket creation and can never be changed by any role. |
| BR-34 | IT Priority is set equal to Requested Priority when a ticket is created (or backfilled, BR-77) and afterwards can be changed only by IT Staff. Both values are stored and shown to IT Staff; Requesters see only Requested Priority (D-09). |
| BR-35 | Priorities are `LOW`, `MEDIUM`, `HIGH` (unchanged from Lab 2). |
| BR-36 | A ticket may be unassigned only while its status is `NEW` or `OPEN`; later statuses keep an owner until the ticket is reassigned. |
| BR-37 | Ownership and IT Priority cannot be changed on a `CLOSED` or `CANCELLED` ticket. |

### 5.6 Status lifecycle
| ID | Rule |
| :--- | :--- |
| BR-38 | A ticket's status is one of `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED`. New tickets start at `NEW`. |
| BR-39 | Only IT Staff change status. No Requester or Administrator status change exists. |
| BR-40 | `CLOSED` and `CANCELLED` are terminal. |
| BR-41 | The permitted transitions are exactly the table below; any other request, including one that names the ticket's current status, is refused with `409`. |

| From | Permitted targets |
| :--- | :--- |
| `NEW` | `CANCELLED` (a `NEW` ticket reaches `OPEN` only by being given an owner, BR-32) |
| `OPEN` | `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED` |
| `IN_PROGRESS` | `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED` |
| `WAITING_FOR_REQUESTER` | `IN_PROGRESS`, `RESOLVED`, `CANCELLED` |
| `REOPENED` | `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED` |
| `RESOLVED` | `CLOSED`, `REOPENED` |
| `CLOSED` | — (terminal) |
| `CANCELLED` | — (terminal) |

| ID | Rule |
| :--- | :--- |
| BR-42 | Every transition except one to `CANCELLED` requires the ticket to have an owner; a ticket that should never have been opened can be cancelled straight from `NEW`. |
| BR-43 | Every status change states **both** the status and the owner the caller expects (`expectedStatus`, `expectedOwnerId`), and every IT Priority change states the expected status; if any differs, the change is refused with `409` and nothing is modified. |
| BR-44 | A transition to `RESOLVED` requires a resolution summary of 10–2000 characters (trimmed), stored on the ticket and visible to the Requester. A transition to `REOPENED` clears it. |
| BR-45 | A transition to `CANCELLED` or `REOPENED` requires a reason of 10–1000 characters (trimmed), which is posted as a Public Comment by the acting user in the same transaction, so the Requester always learns why. |
| BR-46 | The UI asks for explicit confirmation before `RESOLVED`, `CLOSED`, `CANCELLED`, and `REOPENED`. |
| BR-47 | A Requester may mark "Problem Appears Resolved" on their own ticket while it is `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or `REOPENED`; it records the time, does not change status, and may carry an optional comment (1–2000 characters) posted as a Public Comment. Marking it again while already marked is refused with `409`. |
| BR-48 | Any status change clears the "Problem Appears Resolved" signal, so it always reflects the Requester's opinion of the current state of work. |

### 5.7 Public Comments and Internal Notes
| ID | Rule |
| :--- | :--- |
| BR-49 | Public Comments and Internal Notes are stored in two separate tables, so a missing filter can never surface a note in a comment thread (D-04). |
| BR-50 | Comment and note bodies are 1–2000 characters after trimming; empty or whitespace-only bodies are rejected. Author and creation time are always set by the server; client-supplied values are ignored. |
| BR-51 | Comments and notes are append-only: no edit or delete endpoint exists. They are listed oldest first and rendered as plain text with line breaks preserved, never as HTML. |
| BR-52 | Public Comments cannot be posted on `CLOSED` or `CANCELLED` tickets; Internal Notes can be posted on any ticket. Posting either updates the ticket's Last Updated time. |

### 5.8 Administrator rules
| ID | Rule |
| :--- | :--- |
| BR-53 | Every user has exactly one role from the fixed set; any other role value is rejected with `400`. |
| BR-54 | Email addresses are unique across all users (case-insensitive, BR-09); a duplicate on create or edit is refused with `409` on the email field. |
| BR-55 | Creating a user requires a name (2–100 characters, trimmed), a valid email (≤254 characters), one role, an activation state, and an initial password meeting BR-07; the new user must change that password at first login. |
| BR-56 | Setting a new initial password applies BR-07, forces a password change at the user's next login, and ends all of that user's sessions. An Administrator changes their own password through Change Password, not this action. |
| BR-57 | An Administrator cannot deactivate their own account or change their own role. |
| BR-58 | The system always keeps at least one active Administrator: any deactivation or role change that would leave zero is refused with `409`. The count is checked inside the same transaction as the change, holding the locks BR-81 prescribes, because with BR-57 in place the only way to reach zero is two Administrators acting on each other at the same moment. |
| BR-59 | Deactivating a user ends all their sessions immediately; changing a user's role also ends their sessions so the new permissions apply at once. Deactivation never deletes data, and no user-delete endpoint exists. |
| BR-60 | A user who owns tickets that are not `CLOSED` or `CANCELLED` cannot have their role changed to `REQUESTER` until those tickets are reassigned (409); deactivation is still allowed (BR-29). The check and the role change hold the user-row lock of BR-81, so an assignment to that user cannot slip in between them. |

### 5.9 Queue behaviour
| ID | Rule |
| :--- | :--- |
| BR-61 | Queue search is trimmed and case-insensitive, matching Ticket Number by prefix, Summary by substring, or Requester name by substring; empty search means no search (Lab 2 BR-14). |
| BR-62 | Queue filters are: status (`ACTIVE` = every status except `CLOSED` and `CANCELLED`, the default; `ALL`; or one specific status), IT Priority, Category, owner (`any` default, `unassigned`, `me`, or a user id), and "appears resolved" (on/off). Filters combine with each other and with search using AND. |
| BR-63 | Sort fields are `itPriority`, `createdAt`, `updatedAt`, `ticketNumber`, and `status`, ascending or descending. The default is `sort=itPriority&order=desc` — the most urgent work first. |
| BR-64 | Each sort's full key is fixed, so the same `sort` and `order` always produce the same order and pagination never repeats or skips a row (Lab 2 BR-17): `itPriority` (either direction) is followed by `createdAt` ascending and then `id` ascending — within one priority, the ticket that has waited longest comes first; every other field is followed by `id` in the same direction. The default order is therefore exactly what `appliedQuery` echoes. |
| BR-65 | Pagination defaults to page 1 of 10; page size is 1–50 (Lab 2 BR-18). |
| BR-66 | Invalid or unknown query values are replaced by their defaults rather than rejected (Lab 2 BR-19 and Lab 2 D-5), and the response echoes the query actually applied so the UI can show it. |
| BR-67 | A page beyond the last page returns an empty list with correct pagination metadata. |

### 5.10 Requester regression and terminal tickets
| ID | Rule |
| :--- | :--- |
| BR-68 | Every Lab 2 Requester rule (Lab 2 BR-01 to BR-48) keeps its meaning, with "the selected Requester" read as "the signed-in Requester", **except** the rules Lab 3 deliberately supersedes: Lab 2 BR-03 and BR-06 to BR-10 (the selector and its header, replaced by FR-01 to FR-04 and BR-03), Lab 2 BR-41 (selector visibility, replaced by BR-01), Lab 2 BR-46 (no comment box on Ticket Detail, replaced by FR-14 to FR-16), and Lab 2 BR-47 and BR-48 (no credentials on the Requester model, replaced by §7). |
| BR-69 | Lab 1 and Lab 2 behaviour tests keep their assertions and change only how they authenticate (session instead of `X-Dev-Requester-Id`), with two exceptions: a test that asserts a rule BR-68 lists as superseded is rewritten to assert the Lab 3 rule that replaces it, and a test that existed only to check the selector is retired. Every rewritten or retired test is named in the PR that changes it. |
| BR-70 | A Requester cannot add or soft-remove attachments on a `CLOSED` or `CANCELLED` ticket (`409`); existing attachments remain downloadable. |
| BR-71 | The Requester Ticket Detail shows the owner's name or "Not yet assigned", but never IT Priority, Internal Notes, or any IT Staff control. |

### 5.11 Migration and seed
| ID | Rule |
| :--- | :--- |
| BR-72 | The migration renames `RequesterUser` to `User` and the `RequestedPriority` enum to `Priority` in place, so every user id, ticket id, and foreign key survives (D-05). |
| BR-73 | Every migrated user becomes a `REQUESTER`, active state unchanged, with `mustChangePassword` set and no password hash. |
| BR-74 | Existing tickets keep their Requester, Ticket Number, Requested Priority, `NEW` status, timestamps, and all attachment rows and files. |
| BR-75 | Existing email addresses are lowercased by the migration (BR-09). |
| BR-76 | A migrated account without a password cannot log in (BR-10) until a password is assigned — by the local-development seed for documented accounts (§7.6), or by an Administrator's "Set initial password" for any other. |
| BR-77 | `Ticket.itPriority` is backfilled from `Ticket.requestedPriority` for every existing ticket before the column becomes required. |
| BR-78 | The seed is idempotent and additive: it creates missing reference data, accounts, and seed tickets, and assigns the documented local-development password only to documented accounts that have no password yet. It never overwrites an existing password, role, or activation state. |
| BR-79 | Seeded credentials are for local development only and documented in `README.md`. No automated test depends on a seeded account's changeable state: server tests create their own users, and E2E signs in as a seeded Administrator only to create the per-run users it then works with (D-19). |

### 5.12 Concurrency
| ID | Rule |
| :--- | :--- |
| BR-80 | Every operation that changes a ticket or adds to it — ownership, IT Priority, status, Public Comment, Internal Note, "Problem Appears Resolved", and attachment add or soft-remove — locks that ticket's row (`SELECT … FOR UPDATE`) inside its transaction before checking any status-dependent rule (BR-31, BR-37, BR-42, BR-43, BR-47, BR-52, BR-70) and holds the lock until it commits. Two concurrent changes to one ticket therefore run one after the other, and the second is checked against the result of the first. |
| BR-81 | **One lock order for the whole system**, so no two operations can deadlock: (1) ticket rows are always locked before user rows, and no operation that holds a user lock ever waits for a ticket lock; (2) when an operation needs several user rows, it locks them all in **one** statement in ascending `id` order. Concretely: assigning an owner locks the ticket (BR-80), then the proposed owner's row. Changing the role or activation of a user who is currently an active Administrator locks the target and every active Administrator in one statement — `SELECT … FROM "User" WHERE id = $target OR (role = 'ADMINISTRATOR' AND "isActive") ORDER BY id FOR UPDATE` — before checking BR-58. Any other role or activation change locks only the target's row before checking BR-60. A user can therefore never end up as a `REQUESTER` or inactive at the moment they were made the owner of an open ticket, and two Administrators changing each other at once are serialised rather than deadlocked. |

## 6. UI Specification Summary

Full detail lives in `docs/lab-03/ui-spec.md`. Lab 3 extends Lab 2's Zen Green
contract (`docs/lab-02/ui-spec.md`) rather than replacing it.

- **Application shell:** the Development Requester display is replaced by the
  signed-in user's name, a role badge, Change Password, and Log Out. Navigation is
  role-specific — Requester: My Tickets, Create Ticket; IT Staff: Ticket Queue;
  Administrator: User Management, Ticket Queue (read-only). Below 768px it collapses
  into the existing hamburger menu.
- **Login:** centred card with email, password (show/hide toggle), a busy Sign In
  button, a generic failure banner, a distinct inactive-account banner, a
  throttled-attempts banner, and plain help text instead of a "Forgot password" link.
- **Change Password:** current, new, and confirm fields with a live rules checklist;
  a forced mode with no way out but Log Out, and a voluntary mode with Cancel.
- **Requester Ticket Detail (extended):** all eight status badges, owner name or
  "Not yet assigned", the resolution summary panel, a Public Comments thread with a
  composer, and a "Problem appears resolved" action with confirmation.
- **IT Staff Ticket Queue:** search, filters, sort, pagination; seven-column desktop
  table, condensed tablet table, cards on mobile; distinct empty, no-results,
  forbidden, and failure states; a read-only banner for Administrators.
- **IT Staff Ticket Detail:** read-only ticket information beside an editable
  "Ticket controls" panel (owner, IT Priority, status), attachments, and two tabs —
  Public Comments and Internal Notes — whose regions, labels, and composer buttons
  differ so private text is not posted publicly by accident.
- **User Management:** search, role filter, Name/Email/Role/Status/Edit table, and a
  create/edit side panel with an initial-password field, activation switch, and
  inline validation; self and last-Administrator restrictions shown as disabled
  controls with explanations, and also enforced by the server.
- **Badges:** consistent label/colour pairs for all eight statuses, the three
  priorities (shared by Requested and IT Priority), and the three roles.
- **Responsive and accessibility rules:** unchanged from Lab 2 — three breakpoints,
  no horizontal scroll, visible focus, labelled controls, focus-trapped dialogs, and
  never colour alone.

## 7. Data Changes

All models live in `server/prisma/schema.prisma`.

### 7.1 Models
| Model | Change | Fields |
| :--- | :--- | :--- |
| `User` | **renamed** from `RequesterUser`; columns added | kept: `id`, `name`, `email` (unique), `isActive`, `createdAt`; added: `passwordHash` (nullable), `role` (`Role`, default `REQUESTER`), `mustChangePassword` (bool, default `true`), `lastLoginAt` (nullable), `updatedAt` |
| `Session` | new | `id`, `tokenHash` (unique), `userId` (FK → User, cascade), `createdAt`, `expiresAt` |
| `Ticket` | columns added | added: `ownerId` (nullable FK → User, restrict), `itPriority` (`Priority`), `requesterResolvedAt` (nullable), `resolutionSummary` (nullable, ≤2000); `currentStatus` widened to 8 values |
| `PublicComment` | new | `id`, `ticketId` (FK → Ticket, cascade), `authorId` (FK → User, restrict), `body` (≤2000), `createdAt` |
| `InternalNote` | new | `id`, `ticketId` (FK → Ticket, cascade), `authorId` (FK → User, restrict), `body` (≤2000), `createdAt` |
| `Category`, `RelatedSystem`, `Attachment` | unchanged | — |

| Enum | Change |
| :--- | :--- |
| `Role` | new: `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR` |
| `Priority` | **renamed** from `RequestedPriority`; same values `LOW`, `MEDIUM`, `HIGH`; used by `requestedPriority` and `itPriority` |
| `TicketStatus` | widened from `NEW` to the 8 values in BR-38 |

### 7.2 Relationships
- `User` 1—N `Ticket` as Requester (`Ticket.requesterId`, existing relation, restrict).
- `User` 1—N `Ticket` as owner (`Ticket.ownerId`, optional, restrict — users are
  deactivated, never deleted).
- `User` 1—N `Session` (cascade: removing a user's sessions is how logout,
  password change, deactivation, and role change take effect).
- `Ticket` 1—N `PublicComment`, 1—N `InternalNote`; each comment or note has one
  author `User` (restrict).
- `Ticket` keeps its relations to `Category`, `RelatedSystem`, and `Attachment`.

### 7.3 Indexes and constraints
| Index / constraint | Why |
| :--- | :--- |
| `User.email` unique | BR-54 and the login lookup |
| `User(role, isActive)` | assignable-owner list, Administrator role filter, last-Administrator count |
| `Session.tokenHash` unique | every authenticated request is one lookup on this column |
| `Session(userId)`, `Session(expiresAt)` | ending a user's sessions; clearing expired rows |
| `Ticket(requesterId, createdAt)` | kept from Lab 2 — My Tickets |
| `Ticket(ownerId)` | owner filter and the BR-60 check |
| `Ticket(currentStatus, itPriority, createdAt)` | the queue's default filter and order |
| `PublicComment(ticketId, createdAt)`, `InternalNote(ticketId, createdAt)` | one ordered thread read per ticket |

### 7.4 Justified design decisions
| ID | Decision | Rationale |
| :--- | :--- | :--- |
| D-01 | Server-side `Session` rows with an opaque random token in a cookie, not a JWT. | Labsheet §6.1 requires logout to invalidate access. Deleting a row does that immediately; a signed JWT stays valid until it expires unless a revocation list is added — which is a session table by another name. |
| D-02 | Store only `sha256(token)`; the raw token lives only in the `HttpOnly` cookie. | A copied database contains no usable session. SHA-256 (not a slow hash) is right here because the token is 256 bits of randomness, not a guessable password. |
| D-03 | Hash passwords with Node's built-in `crypto.scrypt` (N=16384, r=8, p=1, 16-byte salt, 64-byte key), stored as `scrypt$N$r$p$salt$hash`. | A memory-hard, salted KDF with no new dependency and no native build step, so the suite runs the same on Windows and in the Docker image. Parameters are stored with each hash so they can be raised later without invalidating existing passwords. |
| D-04 | Public Comments and Internal Notes in two tables. | Visibility becomes structural: a forgotten `WHERE` clause on one table cannot leak rows from the other into a Requester's thread (BR-49). |
| D-05 | Rename `RequesterUser` → `User` and `RequestedPriority` → `Priority` with hand-edited SQL. | Prisma Migrate has no rename detection: left alone it emits `DROP` + `CREATE`, deleting every Requester and orphaning every Ticket. The migration is generated with `prisma migrate dev --create-only`, its SQL is replaced by `ALTER TABLE … RENAME` / `ALTER TYPE … RENAME`, and it is reviewed before it is applied (§7.5). |
| D-06 | Administrators get read-only ticket oversight, not IT Staff operations. | Labsheet §4.3 keeps the two responsibilities separate. Read-only access makes BR-04's "Internal Notes visible to Administrators" reachable in the product (not only through the API) and makes an Administrator who is set as a ticket owner able to see that ticket, without granting any power to change it. |
| D-07 | `passwordHash` is nullable; the migration leaves it empty and the seed or an Administrator fills it. | SQL cannot compute a scrypt hash, and a hash literal in a migration would put a credential into version control. An empty hash is an explicitly locked account (BR-10), which is the safe intermediate state. |
| D-08 | Ownership and status changes carry the expected current value (`expectedOwnerId`, `expectedStatus`). | Two IT Staff working the same ticket must not silently overwrite each other; a stale request fails with `409` and the UI reloads the ticket. |

### 7.5 Migration plan
One migration, `lab3_users_roles_workflow`, generated with
`npx prisma migrate dev --create-only` after the schema is edited, then hand-edited
and reviewed as SQL before it is applied:

1. `ALTER TABLE "RequesterUser" RENAME TO "User";`, then rename its primary key
   (`User_pkey`), unique email index (`User_email_key`), and id sequence
   (`User_id_seq`) to the names Prisma generates for `User`, and drop Lab 2's
   `RequesterUser_isActive_idx`, which the Lab 3 schema replaces with
   `User(role, isActive)`.
2. `ALTER TYPE "RequestedPriority" RENAME TO "Priority";`
3. Create the `Role` enum; add `passwordHash` (nullable), `role` (default
   `REQUESTER`), `mustChangePassword` (default `true`), `lastLoginAt` (nullable),
   and `updatedAt` to `User`. Every new column is nullable or has a default,
   because the table already holds rows. `updatedAt` is added with `DEFAULT now()`
   to fill the existing rows and the default is then dropped
   (`ALTER COLUMN "updatedAt" DROP DEFAULT`), because Prisma's `@updatedAt`
   columns carry no database default (compare Lab 2's `Ticket."updatedAt"`) and
   leaving it would show up as drift in step 8.
4. `UPDATE "User" SET "email" = lower(trim("email"));`
5. Add the seven new `TicketStatus` values with `ALTER TYPE … ADD VALUE`. None of
   them is used later in the same migration, so PostgreSQL's restriction on using a
   freshly added enum value inside one transaction never applies.
6. Add `ownerId` (nullable FK), `itPriority` (nullable for now),
   `requesterResolvedAt`, and `resolutionSummary` to `Ticket`; then
   `UPDATE "Ticket" SET "itPriority" = "requestedPriority";` and
   `ALTER COLUMN "itPriority" SET NOT NULL`.
7. Create `Session`, `PublicComment`, `InternalNote` and the §7.3 indexes.
8. Verify on a throwaway schema (never the shared development database): apply
   every migration in order, then
   `npx prisma migrate diff --from-url "<throwaway schema url>" --to-schema-datamodel prisma/schema.prisma --exit-code`
   must report no difference (MIG-05), and the migration tests (MIG-01 to MIG-04),
   which seed a throwaway schema with Lab 2-shaped data before applying this
   migration, must pass.

Rollback is restoring the pre-migration database backup taken before applying it
(local lab). Every statement is a rename, an addition, or a backfill, so no Lab 2 row
is deleted at any point.

### 7.6 Seed data
`npm run prisma:seed` (idempotent, BR-78):

| Group | Accounts |
| :--- | :--- |
| Requesters | the 6 Lab 2 Requesters, migrated (5 active, 1 inactive), plus `first.login@kmutt.ac.th` (active, must change password) |
| IT Staff | 3 active, 1 inactive |
| Administrators | 2 active (so the last-Administrator rule can be exercised by removing one) |
| Tickets | ~20, spread across the active Requesters, all 8 statuses, all 3 priorities, with IT Priority differing from Requested Priority on several, both assigned and unassigned ownership, and at least one flagged "appears resolved" |
| Public Comments / Internal Notes | several on the non-`NEW` tickets; no sensitive content |

Every documented account uses the local-development password documented in
`README.md`. All of them have `mustChangePassword` cleared except
`first.login@kmutt.ac.th`, which exists to demonstrate the forced-change path by
hand. Because the seed never overwrites an existing password (BR-78), restoring the
documented state after a demo is `npx prisma migrate reset`.

### 7.7 New dependencies
| Package | Where | Why |
| :--- | :--- | :--- |
| `cookie-parser` (+ `@types/cookie-parser`) | server | read the session cookie |

Password hashing and token generation use Node's built-in `crypto` (D-03). The
`/api` proxy is Vite's built-in `server.proxy` (D-11), so there is no new client
dependency. New configuration:

| Variable | Where | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `CLIENT_ORIGINS` | server | `http://localhost:5173,http://localhost:5174` | `Origin` allow-list (BR-26) and the `cors` origin list, which keeps `credentials: true` for anyone calling the API directly |
| `API_PROXY_TARGET` | client (Vite) | `http://localhost:3000` | where the dev server sends `/api`; `http://server:3000` in Docker Compose and in the Playwright web server |

`VITE_API_URL` is retired: the client always calls same-origin `/api/...` URLs.

## 8. API Contract

The authoritative contract is `docs/lab-03/api-spec.md`. Summary of new and changed
routes:

| Capability | Route | Roles |
| :--- | :--- | :--- |
| Health check | `GET /api/health` | public |
| Log in | `POST /api/auth/login` | public |
| Log out | `POST /api/auth/logout` | any (session optional) |
| Current user | `GET /api/auth/me` | any, including must-change |
| Change own password | `POST /api/auth/change-password` | any, including must-change |
| Categories / Related Systems | `GET /api/categories`, `GET /api/systems` | public (D-18) |
| Create, list, open own tickets | `POST /api/tickets`, `GET /api/tickets`, `GET /api/tickets/:id` | Requester |
| Attachments (upload, soft-remove) | `POST /api/tickets/:id/attachments`, `PATCH /api/tickets/:ticketId/attachments/:attachmentId/remove` | Requester (own) |
| Attachments (metadata, download) | `GET /api/tickets/:ticketId/attachments/:attachmentId[/download]` | Requester (own), IT Staff, Administrator |
| Public Comments | `GET`, `POST /api/tickets/:id/comments` | per BR-20 |
| Internal Notes | `GET`, `POST /api/tickets/:id/internal-notes` | IT Staff (read/post), Administrator (read) |
| Problem Appears Resolved | `POST /api/tickets/:id/appears-resolved` | Requester (own) |
| Ticket Queue | `GET /api/staff/tickets` | IT Staff, Administrator |
| IT Staff Ticket Detail | `GET /api/staff/tickets/:id` | IT Staff, Administrator |
| Assignable owners | `GET /api/staff/assignable-users` | IT Staff, Administrator |
| Ownership | `PATCH /api/staff/tickets/:id/owner` | IT Staff |
| IT Priority | `PATCH /api/staff/tickets/:id/it-priority` | IT Staff |
| Status | `PATCH /api/staff/tickets/:id/status` | IT Staff |
| Users | `GET`, `POST /api/admin/users`; `PATCH /api/admin/users/:id` | Administrator |
| Set initial password | `POST /api/admin/users/:id/initial-password` | Administrator |

`GET /api/requesters` and the `X-Dev-Requester-Id` header are removed (FR-13).
Authentication is a session cookie (BR-15, BR-16); the error envelope and
pagination shape are unchanged from Lab 2.

## 9. Acceptance Criteria

### 9.1 Authentication
| ID | Criterion |
| :--- | :--- |
| AC-01 | Given an active user with valid credentials, when they log in, then the server creates a session, sets the session cookie, returns their id, name, email, role, and password-change flag, and the app shell shows their name and role. |
| AC-02 | Given a user who must change their initial password, when login succeeds, then every normal screen and API remains unavailable until a valid new password is saved, after which they land on their role's home screen. |
| AC-03 | Given an unknown email or a wrong password, when login is attempted, then the same generic failure is returned, no session is created, and no cookie is set. |
| AC-04 | Given an inactive account, when login is attempted with the correct password, then a clear inactive-account message is shown and no session is created; with a wrong password, the generic failure is shown instead. |
| AC-05 | Given 5 failed logins for one email within 15 minutes, when another login for that email is attempted, then it is refused with a throttling message even if the password is correct, and the same happens for an email that does not exist. |
| AC-06 | Given a signed-in user, when they log out, then the session is deleted, the old cookie is rejected with `401`, and opening a protected screen shows the Login screen. |
| AC-07 | Given a password that breaks BR-07 or BR-08, when it is submitted to Change Password, Create User, or Set Initial Password, then it is rejected with a field-level message and nothing changes. |
| AC-08 | Given an expired session, when any protected request is made, then it is treated as signed out (`401`) and the UI returns to Login with a "session ended" message. |
| AC-09 | Given a user signed in on two browsers, when they change their password in one, then the other session is ended and the changing session stays signed in. |

### 9.2 Authorization
| ID | Criterion |
| :--- | :--- |
| AC-10 | Given no session, when any protected endpoint is called, then it returns `401` and no resource data. |
| AC-11 | Given an authenticated user, when they call any endpoint their role is not granted in BR-20, then it returns `403` and no resource data. |
| AC-12 | Given an authenticated Requester, when the client supplies another Requester's id in a body field, query parameter, or `X-Dev-Requester-Id` header, then the server still applies the session identity and never returns another Requester's data. |
| AC-13 | Given a Requester, when they request another Requester's ticket, attachment, or comment thread directly by id, then the response is `404`, identical to a missing ticket. |
| AC-14 | Given a Requester account, when an Internal Note endpoint is requested for any ticket, then it is rejected with `403` and no note content or count is returned. |
| AC-15 | Given a signed-in user, when the app shell renders, then only their role's destinations appear; when they type the URL of a screen their role may not open, then their home screen shows a forbidden message. |
| AC-16 | Given a state-changing request carrying a foreign `Origin` header, when it reaches the API, then it is refused with `403` before any change is made. |

### 9.3 Requester regression and additions
| ID | Criterion |
| :--- | :--- |
| AC-17 | Given a signed-in Requester, when they create a ticket, list and search their tickets, open its detail, and add, download, and soft-remove attachments, then every Lab 2 behaviour still holds, the ticket's Requester is the signed-in user, and no selector exists anywhere in the app. |
| AC-18 | Given the Lab 1 and Lab 2 test suites (server, client, and the Lab 2 E2E journey), when they run against the Lab 3 build, then they pass with only their authentication setup changed, except tests of superseded Lab 2 rules, which are rewritten to the Lab 3 rule that replaces them (BR-69). |
| AC-19 | Given a Requester's own ticket, when they post a Public Comment, then it appears in their thread and in IT Staff Ticket Detail with author name, role, and time. |
| AC-20 | Given a Requester's own open ticket, when they mark "Problem Appears Resolved", then the signal is recorded and visible to IT Staff, the status does not change, and no Requester request can set any status. |

### 9.4 Comments and notes
| ID | Criterion |
| :--- | :--- |
| AC-21 | Given an empty, whitespace-only, or over-2000-character body, when a comment or note is posted, then it is rejected with a field-level message and nothing is stored. |
| AC-22 | Given an Internal Note posted by IT Staff, when the ticket is viewed by IT Staff or an Administrator, then the note is shown; when any Requester-facing endpoint returns that ticket's data, then the note is absent. |
| AC-23 | Given an existing comment or note, when any edit or delete is attempted, then no such endpoint exists, and author and time always come from the server. |
| AC-24 | Given IT Staff Ticket Detail, when the Public Comments and Internal Notes areas are shown, then they differ in region styling, visibility label, and composer button text. |

### 9.5 IT Staff Ticket Queue
| ID | Criterion |
| :--- | :--- |
| AC-25 | Given IT Staff open the queue with no parameters, then they see every non-terminal ticket ordered by IT Priority descending and oldest first, with correct pagination metadata. |
| AC-26 | Given search text and any combination of filters and sort, when the queue loads, then only matching tickets are returned in the requested order; invalid parameters fall back to defaults and the applied query is echoed. |
| AC-27 | Given the queue, when it has no tickets, no matches, or the request fails, then a distinct empty, no-results, or failure state is shown; below 768px rows render as cards without horizontal scroll. |

### 9.6 IT Staff Ticket Detail
| ID | Criterion |
| :--- | :--- |
| AC-28 | Given an unassigned `NEW` ticket, when an IT Staff member claims it, then they become the owner and the status becomes `OPEN`; when a second claim based on the old owner arrives, then it is refused with `409`. |
| AC-29 | Given a ticket, when IT Staff assign it to an active IT Staff member or Administrator, then the owner changes; assigning an inactive user or a Requester is refused. |
| AC-30 | Given a ticket, when IT Staff change its IT Priority, then IT Priority changes, Requested Priority stays the same, and both are shown to IT Staff. |
| AC-31 | Given a ticket, when IT Staff request a transition, then permitted transitions succeed with required reasons stored, and forbidden, same-status, ownerless, or stale (`expectedStatus` mismatch) transitions are refused with nothing changed. |
| AC-32 | Given IT Staff Ticket Detail, when it loads, then the ticket's attachments (active downloadable, removed shown as metadata), Public Comments, and Internal Notes are present, and operational fields are styled as editable while ticket information is read-only. |
| AC-33 | Given an Administrator, when they open the queue and a ticket, then everything is visible read-only with no operational controls, and every IT Staff mutation endpoint returns `403` for them. |

### 9.7 Administrator User Management
| ID | Criterion |
| :--- | :--- |
| AC-34 | Given an Administrator, when User Management loads, then every user's Name, Email, Role, Status, and Edit action are listed, and search by name or email and the role filter narrow the list. |
| AC-35 | Given valid details, when an Administrator creates a user with one role and an initial password, then that user can log in and is forced to change the password. |
| AC-36 | Given a duplicate email (in any letter case), an invalid role, or invalid fields, when a user is created or edited, then it is refused with field-level messages and nothing changes. |
| AC-37 | Given an existing user, when an Administrator edits name, email, role, or activation, then the change is saved; a deactivated user's sessions end and they can no longer log in. |
| AC-38 | Given another user, when an Administrator sets a new initial password, then that user's sessions end and their next login forces a password change. |
| AC-39 | Given an Administrator editing their own account, when they try to deactivate it or change its role, then the change is refused. |
| AC-40 | Given exactly one active Administrator, when anyone tries to deactivate or demote them, then it is refused with `409`. |
| AC-41 | Given a Requester or IT Staff member, when they call any Administrator endpoint or open User Management, then they receive `403` or the forbidden state, and no user data. |

### 9.8 Migration, seed, and presentation
| ID | Criterion |
| :--- | :--- |
| AC-42 | Given a database holding Lab 2 data, when the Lab 3 migration runs, then every ticket, attachment, and requester binding is preserved, IT Priority equals Requested Priority on every existing ticket, and migrated accounts cannot log in until given a password. |
| AC-43 | Given the seed, when it runs twice, then the second run creates nothing new and changes no existing password, role, or activation state, and the required account counts are present. |
| AC-44 | Given every new or changed screen, when viewed at desktop, tablet, and mobile widths, then it shows no clipping, overlap, or horizontal scroll, uses consistent badges, keeps visible keyboard focus, and never relies on colour alone. |

## 10. Definition of Done

**Part 1 — Product completion**
- [ ] Every planned test in `docs/lab-03/tests.md` exists, passes from the documented
      commands on the final `main` branch, and is not skipped, disabled, or flaky.
- [ ] Every AC-## above traces to at least one passing automated test.
- [ ] Every protected endpoint enforces the BR-20 matrix server-side, verified by
      direct API calls with no session and with each wrong role.
- [ ] The migration has been applied to a database holding Lab 2 data and the
      migration tests prove nothing was lost.
- [ ] All Lab 1 and Lab 2 behaviour tests pass with only their authentication setup
      changed, apart from the rewritten and retired tests BR-69 allows, each named in
      its PR; no reference to the Development Requester selector remains.
- [ ] Every implemented screen and endpoint matches this specification,
      `api-spec.md`, and `ui-spec.md`; any deviation is written back into these docs.
- [ ] No secret (session secret, real password, token) is committed or exposed to
      the client bundle.

**Part 2 — Course delivery**
- [ ] All Lab 3 work happened on feature branches merged via peer-reviewed PRs into
      `lab3-staging`, then one release PR into `main`.
- [ ] `docs/lab-03/reviewer.md` records every PR, its reviewer, comments, responses,
      and approvals; `ai-use.md` records the model, 6–10 key prompts, and reflection.
- [ ] `README.md` documents setup, migration, seed, seeded local-development
      accounts, and test commands, verified on a clean checkout.
- [ ] Screenshots for every Lab 3 screen group exist at desktop, tablet, and mobile
      under `artifacts/lab-03/screenshots/`, with the visual checklist completed.
- [ ] Direct-API authorization evidence (wrong role → `403`) is captured for PDF Part 7.
- [ ] The GitHub Project board shows every Lab 3 issue in Done, and the PDF
      (Answer Part 1–9) is assembled and submitted.

## 11. Assumptions and Decisions

| ID | Decision | Rationale |
| :--- | :--- | :--- |
| D-09 | Requesters see Requested Priority but not IT Priority. | IT Priority is IT's triage judgement relative to all other work; showing a Requester that their request was lowered invites dispute without helping them. |
| D-10 | Session lifetime is a fixed 8 hours with no sliding renewal. | A working day; a fixed window is simpler to reason about and to test (by shifting the stored expiry) than idle timeouts. |
| D-11 | The browser only ever talks to one origin: the client calls relative `/api/...` URLs, and the Vite dev server proxies `/api` to the API (`API_PROXY_TARGET`, default `http://localhost:3000`; `http://server:3000` inside Docker, for both the `:5173` dev server and the `:5174` instance Playwright uses). CSRF protection is then `SameSite=Strict` plus the `Origin` check (BR-26), without a CSRF token. | Without the proxy, the Docker E2E topology (page on `localhost:5174`, API on `server:3000`) is cross-site, so a `SameSite=Strict` cookie would never be sent and E2E could not sign in. Through the proxy the cookie is first-party in every environment. The proxy forwards the page's `Origin`, so `CLIENT_ORIGINS` defaults to both dev origins, `http://localhost:5173,http://localhost:5174`. The content type is not relied on, because attachment upload is `multipart/form-data`, which a cross-site form can send. |
| D-12 | Login throttling (BR-14) is in-memory, keyed by email only, holds at most 10,000 emails (expired entries are dropped first, then the oldest), and resets when the server restarts. **Known lab limitation:** anyone who knows an account's email can keep it throttled by sending 5 wrong passwords every 15 minutes (targeted lockout). | In this single-machine setup every browser reaches the API through the same Vite proxy, so a client IP cannot tell users apart: keying by IP would make a per-IP limit effectively global, and trusting `X-Forwarded-For` would let any local caller rotate it to escape the limit. Email-only keying is the honest fit. Account-unlock and lockout-recovery workflows are out of scope (labsheet §4.2); restarting the server clears every entry. The cap keeps a flood of random emails from growing the store without limit. |
| D-13 | Password rules are length plus one letter and one digit (BR-07); the mockup's upper/lower/special-character rules are not adopted. | Length dominates password strength; composition rules beyond this push people toward predictable substitutions. The labsheet leaves the rules to us. |
| D-14 | A ticket's owner must be able to work it, so `CLOSED` is terminal and a Requester whose problem returns after closure opens a new ticket; `REOPENED` is reachable only from `RESOLVED`. | Keeps the lifecycle small and auditable; a resolved-but-not-closed ticket is the window for "it came back". |
| D-15 | Ticket Number stays `TCK-######` (Lab 2 BR-01), not the mockup's `TKT-2025-001234`. | Changing it would rewrite every existing ticket's reference and break Lab 2 tests for no functional gain. |
| D-16 | Mockup elements outside Lab 3 scope are not built: the Administrator "Send password reset email" option (the Administrator types an initial password instead, BR-55), the "Forgot your password?" link (replaced by "Contact your IT administrator" text), the "Service Actions" tab (Actions Taken is Lab 4), and user-list pagination (§8.5 says not required). | Labsheet §4.2 and §8.5 exclude them explicitly; the mockups are visual direction, not scope. |
| D-17 | The mockup's "Pending" status does not exist; the closest required status is `WAITING_FOR_REQUESTER`. The product name stays "TokTickIT". | Labsheet §4.5 fixes the eight statuses; the mockup's spelling of the product name differs from the repository's. |
| D-18 | Reference-data endpoints (`/api/categories`, `/api/systems`) and `/api/health` stay public, as in Labs 1 and 2. Every other endpoint requires a session. | They return only the public lookup lists every user sees on the Create Ticket form, and Lab 1's public System Status page (`/`) and its test call `GET /api/categories` without a session. Protecting them would break Lab 1 for no security gain. |
| D-19 | An E2E test that needs a fresh user creates one through the Administrator API with a unique email per run, instead of relying on a seeded account's state. | Keeps E2E runs repeatable without the seed having to reset passwords (BR-78). |
| D-20 | Test files live under `server/tests/lab-03/`, `client/tests/lab-03/`, and `e2e/lab-03/`. | Labsheet §10 writes `lab03` in its example table but §12 writes `lab-03`; §12 matches Lab 2's existing convention. |
| D-21 | A user whose role is changed away from `REQUESTER` keeps every ticket they submitted as its Requester of record, but can no longer open those tickets through Requester screens; IT Staff still see them in the queue. | The labsheet allows exactly one role per user, so a person cannot be both. Moving their submitted tickets would rewrite history, and the case is rare enough to document rather than build for. |
| D-22 | Tests that change shared state in ways the seed does not undo — the migration and seed tests (MIG-01 to MIG-09) and the last-Administrator race (API-70) — run against a throwaway PostgreSQL schema created and dropped by the test itself. API-70 goes through the Express app, whose Prisma client is a singleton built from `DATABASE_URL` on first use (`server/src/prisma.ts`), so it lives in its own file, `last-administrator.api.test.ts`, which points `DATABASE_URL` at the throwaway schema before the app is first imported; Vitest isolates modules per test file, so no other file shares that client. Every other server test creates its own users and tickets with a unique prefix and deletes them afterwards, and never modifies a seeded row. | All server tests share one development database with no per-test isolation (`server/vitest.config.ts`); the seed never overwrites changed data (BR-78), so a test that altered a seeded account would break the README credentials for every later run. |
