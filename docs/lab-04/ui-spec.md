# Lab 4 UI Specification — Zen Green Theme, final application

Companion to `specification.md` §6. This **extends** `docs/lab-02/ui-spec.md` and
`docs/lab-03/ui-spec.md` and replaces neither. Everything in them still applies:
- the `--zg-*` tokens, typography, and 4px spacing;
- field states, button variants, and validation below fields;
- the eight status, three priority, and three role badges;
- the Internal region, the Ticket controls panel, and the side panel;
- the three breakpoints (desktop ≥992px, tablet 768–991px, mobile <768px);
- the accessibility rules.

Lab 4 adds no new font, framework, or visual system. Rule references point to
`specification.md`.

The mockups (`lab_04_staff-dashboard-mockup.png` and
`lab_04_requester-dashboard-mockup.png`) are visual direction only:
- the product name stays **TokTickIT**;
- the "from yesterday" deltas are not built (D-11);
- the cards, lists, and Quick actions keep their arrangement.

Lab 4 adds to the shared vocabulary:
1. **Action status badges** and **follow-up pills**;
2. the **metric card** and the **count strip** (Dashboard);
3. the **action card** (Actions Taken list) and the **gate notice** (Ticket controls).

## 1. Additions to tokens and components

### 1.1 Action status badges
Same pill geometry as the ticket status badges (`.zg-badge`). Labels: "Planned",
"Completed", "Cancelled". Action and ticket statuses never share a label, so they
cannot be confused even without colour.

| Status | Class | Background / Text | Contrast |
| :--- | :--- | :--- | :--- |
| `PLANNED` | `.zg-badge--action-planned` | `#FFF4DC` / `#7A4A00`, with a clock icon | 6.85:1 |
| `COMPLETED` | `.zg-badge--action-completed` | `#E8F5EC` / `#0E5A2C`, with a ✓ icon | 7.43:1 |
| `CANCELLED` | `.zg-badge--action-cancelled` | `#F1F1F1` / `#5B5B5B`, with a ✕ icon | 6.01:1 |

### 1.2 Follow-up pills
| Pill | Style | Text | Contrast |
| :--- | :--- | :--- | :--- |
| Follow-up needed | `#FDEDEA` / `#8C2A14`, flag icon | "Follow-up needed" | 7.52:1 |
| Follow-up handled | white, 1px `#0B7A46` border and text | "Follow-up handled" | 5.40:1 |

A follow-up pill appears only on an action with Follow-Up Required. "Needed" turns to
"Handled" once a completed follow-up links to it (BR-14).

### 1.3 Metric card
- A white card (`--zg-surface`, 1px `--zg-border`, 8px radius, 16px padding),
  holding:
  - the **label** (14px, `--zg-text-muted`);
  - the **value** (32px semibold, `--zg-primary`, 6.63:1);
  - a **View** link (tertiary).
- The whole card is not a link: one focusable link per card, with the accessible
  name "View <label> (<value>)".
- A value of 0 is shown as "0", never hidden. Its link stays, because an empty
  list is still a valid answer.
- New tokens:

| Token | Value | Use |
| :--- | :--- | :--- |
| `--zg-metric-value` | `#006B3C` | metric values (same as `--zg-primary`, named for intent) |
| `--zg-action-planned-bg` / `-text` | `#FFF4DC` / `#7A4A00` | §1.1 |
| `--zg-action-completed-bg` / `-text` | `#E8F5EC` / `#0E5A2C` | §1.1 |
| `--zg-followup-bg` / `-text` | `#FDEDEA` / `#8C2A14` | §1.2 |

### 1.4 Count strip
A row of compact links:
- each one is a status badge (or priority badge) followed by its count, e.g.
  `[In progress] 7`;
- accessible name: "In progress: 7 tickets";
- it wraps onto as many lines as it needs and never scrolls sideways.

Used for `byStatus` and `byItPriority` (BR-39).

### 1.5 Action card
One per Action Taken, in a vertical list (BR-24 order). The list itself is an `<ol>`,
so its order is announced.

```
┌───────────────────────────────────────────────────────────────────────┐
│ [Planned]  Mon 6 Oct 2026, 09:00          Assigned to Pimchanok [You]  │
│ Replace the laptop battery.                                           │
│ Result: —                                                             │
│ [Follow-up needed] Check again after one week.                        │
│ Attachment notes: battery-serial.jpg on this ticket                   │
│ Created by Anan · Performed by — · Follow-up of #114                  │
│                       [History ▾]  [Edit]  [Complete]  [Cancel action] │
└───────────────────────────────────────────────────────────────────────┘
```
- **Field labels** are always visible text: "Result", "Attachment notes",
  "Performed by". Empty values show "—", never a blank.
- **Times** are shown in Asia/Bangkok, matching the Dashboard (D-19).
- **Completed** cards show "Completed by <name> on <date>". **Cancelled** cards show
  the reason and who cancelled, with the description struck through **and** the
  "Cancelled" badge, so the state never depends on the strike-through alone.
- **Card anchors:** `id="action-<id>"`, so `#action-118` from the Dashboard scrolls
  to the card and focuses it.

### 1.6 Gate notice
A small callout inside the Ticket controls panel, under the status select, styled
like Lab 2's warning (`--zg-warning-bg` / `--zg-warning-text`). It has no icon: the glyph is
missing from some system fonts, and the text carries the meaning:
- **Shown when** the ticket's row in the transition matrix includes `RESOLVED` but
  `resolutionGate.passes` is false (BR-30).
- **Text:** "Resolved is available once:", followed by a list of only the unmet
  conditions:
  - "at least one action is completed (0 completed)";
  - "no action is still planned (2 planned)";
  - "every follow-up is handled (1 open)".
- **Live updates:** it is a polite live region and updates after every Action Taken
  change (FR-09).

## 2. Application shell
| Role | Navigation (in order) | Home screen |
| :--- | :--- | :--- |
| Requester | **Dashboard**, My Tickets, Create Ticket | `/dashboard` |
| IT Staff | **Dashboard**, Ticket Queue | `/dashboard` |
| Administrator | **Dashboard**, User Management, Ticket Queue | `/dashboard` |

- Active link: Lab 2's white underline plus `aria-current="page"`. On a ticket detail
  page, the list it belongs to (My Tickets or Ticket Queue) stays marked.
- The brand link "TokTickIT" goes to `/dashboard`.
- **After login**, every user goes to `/dashboard`, unless they were sent to Login
  from a page their role may open (Lab 3 behaviour).
- **Forbidden callout:** a role opening a page it may not use now lands on
  `/dashboard`, which shows the callout (D-08).
- Everything else, including the hamburger below 768px, is unchanged from Lab 3 §2.

## 3. Screen — Dashboard (`/dashboard`)

### 3.1 Common layout
```
┌────────────────────────────────────────────────────────────────────────────┐
│ Welcome back, Pimchanok                    Updated 16:12 (Bangkok) [Refresh]│
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                         │
│ │Unassigned│ │My tickets│ │My planned│ │Requester │   metric cards          │
│ │    4     │ │    7     │ │ actions 3│ │ says res.│                         │
│ │ View     │ │ View     │ │ View     │ │ View     │                         │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                         │
│ By status:   [New] 3 [Open] 5 [In progress] 7 … (count strip)               │
│ ┌───────────────────────────────┐ ┌──────────────────────────┐              │
│ │ My planned actions   View all │ │ Quick actions            │              │
│ │ …                             │ │ Ticket Queue             │              │
│ └───────────────────────────────┘ │ My tickets               │              │
│ ┌───────────────────────────────┐ └──────────────────────────┘              │
│ │ Urgent tickets       View all │                                           │
│ └───────────────────────────────┘                                           │
└────────────────────────────────────────────────────────────────────────────┘
```
- **Heading:** `<h1>` "Welcome back, <first name>"; "Welcome, <first name>" for
  Requesters.
- **Data time:** "Updated HH:mm (Bangkok time)", taken from `generatedAt`.
- **Refresh** (secondary): re-fetches and stays disabled while loading.
- **Metric cards:** a CSS grid with 4 columns at desktop, 2 at tablet, and 1 at mobile.
  The cards render in API order (BR-34).
- **Lists:** each is a card with a heading, up to 5 rows, and "View all" (tertiary)
  where a full list exists. Each row is one link: ticket number, summary (truncated
  with an ellipsis, with the full text in `title` and in the accessible name), status
  badge, and Bangkok date and time.
- **Desktop arrangement:** the lists sit in the main column (≈2/3) and Quick actions
  in a side column (≈1/3). At tablet and mobile everything stacks in DOM order:
  heading, cards, strips, lists, Quick actions.

### 3.2 IT Staff Dashboard
- **Cards:** Unassigned, My tickets, My planned actions, Requester says resolved,
  Created today, Resolved today (BR-39).
  - "Created today" and "Resolved today" carry the helper text "Bangkok day; the queue
    opens newest first" (BR-38, a superset drill-down).
  - The My planned actions card's View link jumps to the list below
    (`#my-planned-actions`): the list scrolls into view and takes focus. Opening
    `/dashboard#my-planned-actions` directly does the same once the data has loaded.
    The jump happens once per navigation, so Refresh leaves the page where it is. A
    hash that names nothing on the screen, a malformed one included, is ignored.
- **Count strips:** "By status" (8 status badges) and "Unresolved by IT Priority"
  (3 priority badges).
- **Lists:**
  - **My planned actions:** action date and time, description, ticket number. Opens
    `/staff/tickets/:id#action-:actionId`.
  - **Urgent tickets:** HIGH, unresolved, longest waiting. View all opens
    `/staff/queue?status=UNRESOLVED&itPriority=HIGH&sort=createdAt&order=asc`.
  - **Recently updated:** View all opens `/staff/queue?sort=updatedAt&order=desc`.
- **Quick actions:** Ticket Queue, Unassigned tickets, My tickets.

### 3.3 Requester Dashboard
- **Cards:** Open requests, Waiting for you, Resolved, Closed (BR-40).
  - "Waiting for you" is highlighted with the warning colour **and** the text "Needs
    your reply" whenever its value is above 0.
- **Lists:**
  - **Needs your attention:** Waiting-for-Requester tickets.
  - **Recently updated.**
  - **Recently resolved (last 7 days).**
  - Each row opens `/tickets/:id`. View all opens `/tickets?status=WAITING_FOR_REQUESTER`,
    `/tickets?sort=updatedAt&order=desc`, or `/tickets?status=RESOLVED` respectively.
- **Quick actions:** Create Ticket ("Submit a new request") and My Tickets ("Track
  your requests").
- **IT Priority and Internal Notes are never shown** (BR-36).

### 3.4 Administrator Dashboard
- **Above everything else:** a read-only pill "Ticket metrics are read-only for
  Administrators" (Lab 3 §1.5).
- **Ticket content:** the §3.2 cards, strips, and lists.
- **User accounts card:** the four BR-41 counts as metric rows, each with a View link
  to User Management with its role and activation filters applied, and a "Manage users" link.
- **Quick actions:** User Management, Ticket Queue.

### 3.5 Dashboard states
| State | Presentation |
| :--- | :--- |
| Loading | skeleton cards and rows with the same sizes as the loaded layout (no layout shift); `aria-busy="true"` on the region |
| Empty list | inside its card, a sentence specific to the list: "No planned actions assigned to you.", "Nothing needs your reply right now.", "No tickets were resolved in the last 7 days." Metric cards still show `0` |
| Brand-new Requester | every card 0, plus an EmptyState "You haven't submitted any requests yet." with **Create Ticket** |
| Forbidden (`403`) | the shell's forbidden callout. Cannot normally happen: each role calls its own endpoint |
| Failure | the Lab 2 ErrorState banner "We couldn't load your dashboard." with **Retry**. Values from an earlier successful load are not shown as if current |
| Refreshing | the existing values stay visible and Refresh shows "Refreshing…" |

## 4. Screen — Actions Taken on IT Staff Ticket Detail (`/staff/tickets/:id`)

### 4.1 Placement
- The section is "Actions taken (n)", placed in the main column between Attachments
  and Conversation (Lab 3 §7.2).
- **Caption** (people icon): "Visible to the Requester", the same caption as Public
  Comments, so nobody types private text here (D-09).
- **Header:** **Add action** (primary), shown when `capabilities.canWriteActions`.
- **Read-only cases:**
  - On a `RESOLVED` ticket the button is replaced by the text "Reopen the ticket to
    add or change actions."
  - On `CLOSED` and `CANCELLED` tickets: "This ticket is closed."

### 4.2 List mode
- Action cards (§1.5) in the BR-24 order.
- **Planned cards** show **Edit**, **Complete**, and **Cancel action** (destructive
  tertiary). Completed and cancelled cards show only **History**.
- **History** is a disclosure button (`aria-expanded`). It shows the events oldest
  first: "<actor> · <time> · <type>: field from → to". Assignee ids are shown as
  names.
- **Empty:** "No actions yet. Add the first action to plan or record work on this
  ticket."

### 4.3 Create mode (side panel, Lab 3 §1.8) — "Add action"
| Field | Control | Rule shown |
| :--- | :--- | :--- |
| Status* | radio group: **Plan this work** (`PLANNED`) / **Record work already done** (`COMPLETED`) | — |
| Action date & time* | `datetime-local`, defaults to now (Bangkok) | BR-07 messages below the field |
| Action description* | textarea with a character counter (2000) | BR-06 |
| Assigned to* | select of `GET /api/staff/assignable-users` (active IT Staff and Administrators only), defaulting to the caller | BR-08 |
| Result | textarea (2000). Labelled **Result*** when "Record work already done" is chosen | BR-06, BR-11 |
| Follow-up required? | checkbox | — |
| Follow-up note* | textarea (1000), **shown and required only while the checkbox is ticked**; unticking hides it and clears its validation | BR-04 |
| Attachment notes | textarea (1000), helper "Where to find related images or files, e.g. an attachment name on this ticket" | BR-06 |
| Follow-up of | select of this ticket's completed actions that still need follow-up; shown only when there are any | BR-14 |

- **Footer:** **Save action** (busy "Saving…", disabled while in flight) and Cancel.
- **Form identity:** one `clientRequestId` is generated when the panel opens and
  reused for every retry from it (BR-43).

### 4.4 View/edit mode (side panel) — "Edit action"
- **Fields:** the §4.3 fields, without Status and Follow-up of. Below them, read-only
  values for Created by, Created, and Version.
- **Save:** "Save changes" sends `expectedVersion`.
- **No changes:** a save with nothing changed closes the panel with "No changes to
  save."

### 4.5 Complete and cancel
- **Complete** opens a confirmation dialog, "Complete this action?", with:
  - Result* (pre-filled with any stored result);
  - Follow-up required? and Follow-up note* (as §4.3);
  - Action date & time (pre-filled, must not be in the future);
  - buttons: **Mark as completed** and Back.
- **Cancel action** opens "Cancel this action?", with:
  - Reason* (10–1000), helper "The reason stays on the action's record.";
  - buttons: **Cancel action** (destructive) and **Keep action**.
- Both dialogs trap focus, close on Escape, and return focus to the button that
  opened them. Their primary button is disabled while the request is in flight.

### 4.6 Actions Taken states
| Situation | Presentation |
| :--- | :--- |
| Loading | three skeleton cards |
| Validation `400` | message below each field. Panel and dialog stay open with the input kept (BR-44) |
| `409 STALE_STATE` | in-panel banner "This action was changed by someone else. It has been reloaded." The list reloads. The panel shows the reloaded values, with the user's unsaved text kept in a "Your unsaved text" box they can copy back (BR-44) |
| `409 ACTION_NOT_PLANNED` | the panel closes, the list reloads, and the toast reads "This action was already completed or cancelled." |
| `409 TICKET_RESOLVED` / `TICKET_CLOSED` | banner in the section, the page reloads, and Add action disappears |
| Network or `5xx` | banner "We couldn't save the action. Your input is still here." Retry reuses the same `clientRequestId` |
| Success | the panel closes, the list, Ticket controls, and gate notice refresh (FR-09), and a toast reads "Action added", "Action updated", "Action completed", or "Action cancelled". Focus moves to the affected card |

### 4.7 Administrator view
- The same Actions Taken controls as IT Staff (BR-17).
- The rest of the page stays Lab 3's read-only Administrator view.
- The Ticket controls note becomes: "Administrators can view this ticket and manage
  its actions, but not change its owner, priority, or status."

## 5. Ticket workflow feedback (Ticket controls panel)
- **Status select:** lists only `permittedTransitions` (BR-30), so Resolved is absent
  while the gate fails. The gate notice (§1.6) says why.
- **After a successful status change:** the header status badge, the panel, the gate
  notice, the Add action availability, and the Actions Taken section all refresh from
  the returned payload (FR-09, AC-16).
- **If `409 RESOLUTION_BLOCKED` still happens** (someone changed an action between
  load and submit): the message appears under the status select, and the ticket and
  its actions reload.
- **Lab 3 rules unchanged:** the confirmation dialogs (Lab 3 BR-46), the
  resolution-summary and reason fields, and the stale banner all still work as before.

## 6. Screen — Requester Ticket Detail (`/tickets/:id`), extended
- **New section** "Work on your request (n)", between the ticket information and
  Public Comments:
  - read-only action cards (§1.5) with every field (BR-19);
  - no buttons and no History control.
- **Empty:** "IT Staff haven't recorded any work on this request yet."
- **Resolved tickets:** show "Resolved on <Bangkok date>" beside the resolution
  summary.

## 7. Drill-down targets
| Screen | New behaviour |
| :--- | :--- |
| My Tickets (`/tickets`) | A **Status** select (All, Open requests, and each status). The status filter and the existing sort live in the URL (`?status=`, `?sort=`, `?order=`), so opening `/tickets?status=WAITING_FOR_REQUESTER` shows the filter already applied. Lab 2's other controls are unchanged |
| Ticket Queue (`/staff/queue`) | The Status select gains **Unresolved**. Every other filter already lives in the URL (Lab 3) |
| User Management (`/admin/users`) | The role filter is read from and written to `?role=`. `?status=active` or `?status=inactive` shows a removable chip, "Active only" or "Inactive only", beside the toolbar; removing it drops the parameter. The toolbar itself is unchanged (D-13) |
| Ticket Detail (both) | `#action-<id>` scrolls to the card and focuses it |

## 8. Screen modes and feedback (labsheet §8.5)
| Screen | Modes | Feedback states |
| :--- | :--- | :--- |
| Dashboard (3 roles) | view, refresh | loading, empty lists, brand-new Requester, forbidden, failure + Retry, refreshing |
| IT Staff Ticket Detail — Actions Taken | list, create, view/edit, complete, cancel, history | loading, empty, saving, success, validation, stale conflict, not-planned, ticket resolved/closed, failure (input kept) |
| Requester Ticket Detail — Work on your request | read-only list | loading, empty |
| Ticket controls | permitted transitions, gate notice | blocked-resolution message, stale reload, success |
| My Tickets / Queue / User Management | URL-driven filters | unchanged Lab 2/3 states |
| Any other address | view | signed in: "Page not found" inside the shell, with "Go to your Dashboard"; signed out: Login, which then opens the Dashboard |

**Hardening (FR-16 to FR-19):** every screen from Labs 1–4 is checked against the same
set of states, using the shared Lab 2/3 components (`LoadingSpinner`, `EmptyState`,
`ErrorState`, toasts, field errors). Each create or submit button gets a busy state.
Forms keep their input after failures. Leftovers found by the hardening sweep are
removed and listed in the Issue 7 PR.

What the sweep changed (Issue 7):
- **Not found:** an address no screen answers shows the row above. It was an empty page.
- **Loading:** Retry on IT Staff Ticket Detail shows the loading state while it
  retries, as Requester Ticket Detail does. The Dashboard's loading placeholder shows
  one card per card the role will see (4 for a Requester, 6 otherwise).
- **Failure:** Create Ticket says "Cannot reach the TokTickIT API" when the API did not
  answer: no reply at all, or a `5xx` whose body is not the API's JSON (a proxy in
  front of an API that is down). An error from the API itself says "Something went
  wrong". Both keep the input.
- **Filters:** on My Tickets, the page number belongs to the status and sort in the
  URL. When the URL changes them, the list starts again at page 1.
- **Console:** the page-load session check uses `GET /api/auth/session`
  (specification.md D-20), and the app has a favicon, so a normal visit logs no error.
- **Touch target:** the filter chip's remove button is 44px on mobile (§9).

## 9. Accessibility
Labs 2 and 3 apply unchanged. In addition:
- **Metric cards:** one link each, named "View <label> (<value>)". The value is text,
  never only a bar or a colour.
- **Count strips:** a `<ul>` of links with full names ("Waiting for Requester: 2
  tickets").
- **Action list:** an `<ol>`. Each card is an `<article>` labelled by its date and
  status. History is a disclosure with `aria-expanded` and `aria-controls`.
- **Hidden fields:** the follow-up note is in the accessibility tree only while it is
  shown. Ticking the checkbox moves no focus; the new field follows the checkbox in
  tab order.
- **Live updates:** the gate notice and the Dashboard's "Updated …" line are polite
  live regions. A dashboard refresh announces "Dashboard updated".
- **Anchors:** following `#action-<id>` focuses the card (`tabindex="-1"`) so screen
  readers start there.
- **Status cues:** every status, action status, priority, and follow-up state carries
  text. Colour is never the only cue.
- **Touch targets** are at least 44px on mobile, including the count-strip links.

## 10. Responsive summary
| Screen | Desktop ≥992px | Tablet 768–991px | Mobile <768px |
| :--- | :--- | :--- | :--- |
| Dashboard | 4-column cards; lists (2/3) + Quick actions (1/3) | 2-column cards; everything stacked | 1-column cards; stacked; strips wrap |
| Actions Taken (staff) | cards in the main column; side panel 440px | cards full width; full-screen sheet | cards full width; buttons wrap onto their own row, full width; full-screen sheet |
| Work on your request | cards in the main column | stacked | stacked |
| Ticket controls + gate notice | sticky side column | above the main column | above the main column |

At every width: no horizontal page scroll, no clipped labels or values (long
descriptions wrap; summaries in lists truncate with the full text available), and no
overlapping messages.

## 11. Visual and accessibility checklist
Recorded per issue in `tests.md` §4:
- [ ] New screens use only `--zg-*` tokens and the badge classes in Lab 3 §1 and Lab 4 §1, with no ad hoc hex values.
- [ ] Dashboard is the first navigation item for every role and shows the active-page indication.
- [ ] Metric cards show label, value, and an accessible drill-down; counts match the API.
- [ ] Action status badges and follow-up pills render with the §1 pairs and text everywhere.
- [ ] Editable (side panel, Ticket controls) and read-only (action cards, Requester view) are visibly distinct.
- [ ] The Actions Taken caption says it is visible to the Requester; Internal Notes keep the Internal region.
- [ ] Validation messages sit directly below their fields; conflict messages sit next to the control that caused them.
- [ ] Focus is visible on every control, and focus returns to the opener after every panel and dialog.
- [ ] No clipping, overlap, or horizontal overflow at desktop, tablet, and mobile on every Lab 4 screen.
- [ ] Every Lab 1–3 screen still renders correctly in the final shell (regression pass).

## 12. Screenshot plan
Under `artifacts/lab-04/screenshots/`, named `<breakpoint>-<state>.png` with
breakpoint `desktop`, `tablet`, or `mobile`. Captured from seeded data with
`CAPTURE_SCREENSHOTS=1`:

| Folder | States |
| :--- | :--- |
| `staff-dashboard/` | `staff-default`, `admin-zero-mine` (Krit Wattana: zero "my" metrics), `staff-loading`, `staff-failure`, `staff-drilldown-queue`, `admin-default`, `admin-users-drilldown` |
| `requester-dashboard/` | `requester-default`, `requester-empty` (brand-new Requester), `requester-drilldown-my-tickets`, `requester-failure` |
| `actions-taken/` | `list-several`, `create-planned`, `create-completed`, `create-validation`, `edit`, `complete-confirm`, `cancel-confirm`, `history`, `stale-conflict`, `gate-blocked`, `gate-passed-resolved`, `requester-view`, `admin-view`, `closed-ticket` |
