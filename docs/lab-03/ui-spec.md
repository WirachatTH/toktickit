# Lab 3 UI Specification — Zen Green Theme, extended

Companion to `specification.md` §6. This **extends** `docs/lab-02/ui-spec.md`; it
does not replace it. Everything there still applies unchanged: the `--zg-*` colour
tokens, typography and 4px spacing, the five field states, the six button variants,
the required-field pattern with validation directly below the field, the
accessibility rules, and the three breakpoints (desktop ≥992px, tablet
768–991px, mobile <768px). Lab 3 introduces no new font, no new framework, and no
second visual system. Rule references point to `specification.md`.

Lab 3 adds to the shared vocabulary:
1. badges for all eight statuses (Lab 2 only defined `NEW`) and for the three roles;
2. one new region type, the **Internal region**, with its two tokens;
3. the **Ticket controls** panel pattern for editable operational fields;
4. a **side panel** pattern for create/edit forms (User Management).

## 1. Additions to tokens and badges

### 1.1 New tokens
Added to `client/src/styles/zen-green.css`:

| Token | Value | Use |
| :--- | :--- | :--- |
| `--zg-internal-bg` | `#EEF1F6` | Internal Notes region background (cool grey-blue, deliberately not green and not the warning colour) |
| `--zg-internal-border` | `#7C8BA3` | 4px dashed left edge of the Internal region |
| `--zg-internal-text` | `#3D4A5C` | Internal region caption text |

### 1.2 Status badges
Same pill geometry as Lab 2 (`.zg-badge`). Label = the value with `_` replaced by a
space, so `NEW` renders exactly as in Lab 2.

| Status | Class | Background / Text | Contrast |
| :--- | :--- | :--- | :--- |
| `NEW` | `.zg-badge--status-new` | `#EAF6EF` / `#0B7A46` (Lab 2) | 4.87:1 |
| `OPEN` | `.zg-badge--status-open` | `#E3F1F4` / `#1E5F6E` | 6.22:1 |
| `IN_PROGRESS` | `.zg-badge--status-in-progress` | `#E6EEFA` / `#23508C` | 6.92:1 |
| `WAITING_FOR_REQUESTER` | `.zg-badge--status-waiting-for-requester` | `#F3ECFA` / `#5E3A87` | 7.48:1 |
| `RESOLVED` | `.zg-badge--status-resolved` | `#DFF3E4` / `#12612F` | 6.51:1 |
| `CLOSED` | `.zg-badge--status-closed` | `#ECEEED` / `#3F4A44` | 7.92:1 |
| `REOPENED` | `.zg-badge--status-reopened` | `#FCEFE6` / `#9A4A12` | 5.54:1 |
| `CANCELLED` | `.zg-badge--status-cancelled` | `#F1F1F1` / `#5B5B5B` | 6.01:1 |

### 1.3 Priority badges
Unchanged from Lab 2 and **shared** by Requested Priority and IT Priority: the same
value has the same colour whichever priority it is. The two are told apart by their
label text ("Requested" / "IT"), never by colour. `LOW` 4.87:1, `MEDIUM` 7.38:1,
`HIGH` 5.10:1.

### 1.4 Role badges
Outlined pills, so a role can never be mistaken for a status or priority pill.

| Role | Class | Style | Contrast |
| :--- | :--- | :--- | :--- |
| `REQUESTER` | `.zg-badge--role-requester` | white, 1px `#5B6B62` border and text | 5.64:1 |
| `IT_STAFF` | `.zg-badge--role-it-staff` | white, 1px `#0B7A46` border and text | 5.40:1 |
| `ADMINISTRATOR` | `.zg-badge--role-administrator` | `#006B3C` fill, white text | 6.63:1 |

Labels: "Requester", "IT Staff", "Administrator".

### 1.5 Signal and ownership pills
| Pill | Style | Text |
| :--- | :--- | :--- |
| Appears resolved | `#DFF3E4` / `#12612F` with a ✓ icon (6.51:1) | "Requester: appears resolved" |
| Read-only | `--zg-readonly-bg` / `--zg-text-muted`, lock icon | "Read-only" |
| Inactive user | outlined grey, beside a name | "Inactive" |
| You | `--zg-pale` / `--zg-secondary` | "You" (beside the signed-in user's own name) |
| Unassigned | not a pill: the word *Unassigned* in `--zg-text-muted` italic — never an empty cell |

Every value above was checked against WCAG AA (4.5:1) for normal-size text; STYLE-02
re-computes these ratios from the CSS in the test suite.

### 1.6 The Internal region
Used for everything only IT Staff and Administrators may see:
- `--zg-internal-bg` background, 4px dashed `--zg-internal-border` left edge.
- A lock icon and the caption **"Internal — not visible to the Requester"** in
  `--zg-internal-text` at the top of the region. The caption is text, so the meaning
  survives greyscale and screen readers (BR-04, AC-24).

### 1.7 Ticket controls panel
The card that holds editable operational fields (owner, IT Priority, status). Its
fields use the Lab 2 editable state (white, `--zg-border`); the ticket information
beside it uses the Lab 2 read-only state (`--zg-readonly-bg`). Editable and
read-only are therefore never mixed inside one card (AC-32).

### 1.8 Side panel
Create/edit forms open in a panel: 440px wide on the right at desktop (the list
stays visible and dimmed), full-screen sheet at tablet and mobile. Title, a close
button (`aria-label="Close"`), the form, and a sticky footer with the primary action
and Cancel. It traps focus, closes on Escape, and returns focus to the control that
opened it.

## 2. Application shell
Replaces Lab 2's Development Requester display (FR-09, FR-10).

```
┌────────────────────────────────────────────────────────────────────────────┐
│ TokTickIT   Ticket Queue                 Pimchanok Srisuk [IT STAFF] ▾     │  --zg-primary
│             ‾‾‾‾‾‾‾‾‾‾‾‾                    Change password · Log out      │
└────────────────────────────────────────────────────────────────────────────┘
```

| Role | Navigation | Home screen |
| :--- | :--- | :--- |
| Requester | My Tickets, Create Ticket | `/tickets` |
| IT Staff | Ticket Queue | `/staff/queue` |
| Administrator | User Management, Ticket Queue | `/admin/users` |

- Right side: name, role badge, and a menu with **Change password** and **Log out**
  (tertiary styling on the header).
- Active link: Lab 2's white underline plus `aria-current="page"`.
- Below 768px: the existing hamburger menu holds the links, the user block, and both
  actions.
- Lab 1's System Status page at `/` stays public and unchanged — it calls only the
  public `/api/health` and `/api/categories` (D-18).
- A signed-out visitor to any protected route goes to `/login`; after login they
  return to that route if their role may open it, otherwise to their home screen.
- A role opening a route it may not use lands on its home screen with a dismissible
  **forbidden callout**: "You don't have access to that page." (AC-15).
- A `401` on any request after login clears the user and shows Login with
  "Your session has ended. Please sign in again." (AC-08).
- While `/api/auth/me` is loading on first paint, a centred spinner replaces the
  whole shell (no flash of the wrong navigation).

## 3. Screen — Login (`/login`)
- Centred card, max-width 420px, on `--zg-bg`; no navigation.
- "TokTickIT" wordmark, heading **Sign in**.
- Email (type `email`, `autocomplete="username"`) and Password
  (`autocomplete="current-password"`) with a show/hide toggle button
  (`aria-label` "Show password" / "Hide password", `aria-pressed`).
- **Sign in** primary button; busy label "Signing in…" with spinner, both fields and
  the button disabled while in flight; Enter submits.
- Help text under the button: "Forgot your password? Contact your IT
  administrator." — plain text, no link (D-16).
- Client validation: both fields required; message below the field.

| State | Presentation |
| :--- | :--- |
| Initial | empty fields, Sign in enabled |
| Submitting | busy button, fields disabled |
| Invalid credentials (`401`) | `--zg-error-bg` banner above the form: "Email or password is incorrect." Password cleared, email kept, focus moves to the password field |
| Inactive account (`403 ACCOUNT_INACTIVE`) | error banner: "This account is inactive. Contact your IT administrator." |
| Throttled (`429`) | error banner: "Too many sign-in attempts. Try again in N minutes." (from `Retry-After`) |
| Session ended | `--zg-pale` info banner: "Your session has ended. Please sign in again." |
| Failure (network/500) | error banner: "Something went wrong. Please try again." |

Banners are announced through the page's `aria-live="polite"` region and pair an
icon with text.

## 4. Screen — Change Password (`/change-password`)
Card layout like Login, max-width 480px.

- **Forced mode** (`mustChangePassword`): heading **Set a new password**, copy "You
  must set a new password before you can continue." No Cancel; a **Log out**
  tertiary action on the screen itself, so the user is never trapped. Every other
  route redirects back here (BR-02).
- **Voluntary mode** (from the user menu): heading **Change password**, with Cancel
  returning to the previous screen.
- Fields: Current password, New password, Confirm new password — each with a
  show/hide toggle.
- Live rules checklist under New password, each line with ✓ or ✗ icon *and* text
  (BR-07, BR-08): "10 to 128 characters", "At least one letter", "At least one
  number", "Not the same as your email", "Different from your current password".
  Updated as the user types; announced politely.
- Confirm mismatch: "Passwords don't match." below Confirm.
- **Save password** primary (busy "Saving…"). Disabled until every rule passes and
  Confirm matches.

| State | Presentation |
| :--- | :--- |
| Wrong current password (`400`, `fields.currentPassword`) | message below Current password: "Your current password is incorrect." |
| Rule failure from server | message below New password, same wording as the checklist |
| Success | forced mode → home screen with success toast "Password updated."; voluntary mode → previous screen with the same toast |
| Failure | error banner, fields kept |

## 5. Screen — Requester Ticket Detail, extended (`/tickets/:id`)
The Lab 2 layout stays (header band, Ticket Information card, Attachments card).
Changes:

- Header band: status badge now shows all eight statuses; beside it an **Owner**
  line: owner name, or *Not yet assigned* (BR-71). No IT Priority anywhere.
- **Resolution** card (shown when `resolutionSummary` exists, i.e. `RESOLVED` or
  `CLOSED`): heading "Resolution", the summary as read-only text.
- **Problem appears resolved** — secondary button in the header band, shown when
  `canMarkAppearsResolved`. Opens a confirmation dialog: "Let IT Staff know the
  problem appears to be resolved? They will confirm and close the ticket." with an
  optional comment textarea (counter `n/2000`) and **Confirm** (primary) / Cancel.
  After success the button is replaced by the appears-resolved pill and the text
  "You told IT Staff this appears resolved on <date>." (BR-47).
- **Public comments** card below Attachments:
  - heading "Comments", caption "Visible to you and IT Staff";
  - thread oldest first; each entry: author name, role badge, timestamp, body as
    text with line breaks preserved;
  - empty state: "No comments yet.";
  - composer: label "Add a comment", textarea (counter `n/2000`), **Post comment**
    primary (busy "Posting…"); disabled with the note "This ticket is closed — new
    comments are not accepted." on `CLOSED`/`CANCELLED`.
- On `CLOSED` and `CANCELLED`, Add Attachment and Soft-Remove are hidden and the
  Attachments card shows "Attachments can't be changed on a closed ticket."
  (BR-70).
- Still absent: Internal Notes, IT Priority, any status control (BR-71).

## 6. Screen — IT Staff Ticket Queue (`/staff/queue`)

### 6.1 Toolbar
Search ("Search ticket number, summary, or requester"), then filters: **Status**
(Active — default, All, then each status), **IT Priority**, **Category**, **Owner**
(Anyone, Unassigned, Me, then each user from `GET /api/staff/assignable-users`,
which both IT Staff and Administrators may read — BR-21; an Administrator sees no
"Me" option, since they cannot claim), a **Requester says resolved** checkbox, a
**Sort** select, and **Clear filters** (tertiary). Each Sort option is exactly one
`sort` + `order` pair, so the URL rebuilt from `appliedQuery` gives the same order on
every page (BR-64): Priority — default (`itPriority`/`desc`), Newest
(`createdAt`/`desc`), Oldest (`createdAt`/`asc`), Recently updated
(`updatedAt`/`desc`), Ticket number (`ticketNumber`/`asc`), Status (`status`/`asc`).
Filter changes reload page 1; search is debounced 300ms. The filter state is kept in
the URL query, rebuilt from the response's `appliedQuery`, so the browser Back
button and a refresh restore it.

### 6.2 Columns
Seven columns, chosen so the queue stays readable at 992px (AC-27):

| Column | Content |
| :--- | :--- |
| Ticket | Ticket Number (link) |
| Summary | summary (ellipsis + full text in `title`), Requester name as muted sub-line |
| Category | category name |
| Priority | IT Priority badge; when it differs from Requested Priority, a muted sub-line "Requested: MEDIUM" |
| Status | status badge; appears-resolved pill below when flagged |
| Owner | name (+ "You" pill, + "Inactive" pill), or *Unassigned* |
| Updated | relative time ("2 h ago") with the full date in `title` |

Created date is a sort option and is shown on the detail screen rather than as an
eighth column.

- Tablet: Category folds into the Summary sub-line; six columns.
- Mobile: one card per ticket — Ticket Number and status badge on the first row,
  summary, then priority badge · owner · updated; the appears-resolved pill on its
  own row when present. Filters move into a "Filters" bottom sheet (Lab 2 pattern).
- Pagination: Lab 2 footer ("Showing 11–20 of 87", Prev/Next, page numbers; mobile
  "Page 2 of 9").
- Whole row is a link target to IT Staff Ticket Detail.

### 6.3 States
| State | Presentation |
| :--- | :--- |
| Loading | skeleton rows/cards |
| Empty (no tickets match the default Active view and no filters/search) | "The queue is clear — there are no active tickets." |
| No results | "No tickets match your search or filters." + Clear filters |
| Forbidden | the shell's forbidden callout (Requesters never see this screen) |
| Failure | error banner + Retry |
| Administrator | `Read-only` pill beside the page heading; identical table |

## 7. Screen — IT Staff Ticket Detail (`/staff/tickets/:id`)

Desktop: two columns — main (≈ 2/3) and Ticket controls (≈ 1/3, sticky). Tablet and
mobile: Ticket controls moves above the main column.

### 7.1 Header band
Back to queue (tertiary, keeps the queue's URL filters), Ticket Number (large),
status badge, IT Priority badge, appears-resolved pill if flagged.

### 7.2 Main column
1. **Ticket information** (read-only card): Requester (name + email), Category,
   Related System, Requested Priority badge (labelled "Requested"), Created, Last
   updated, Summary, Description.
2. **Resolution** (read-only card, when present).
3. **Attachments**: active attachments with Download; removed ones dimmed with their
   removal reason; no add/remove controls for staff (FR-29).
4. **Conversation** — tabs (`role="tablist"`): **Public comments (n)** and
   **Internal notes (n)**.
   - *Public comments* tab: white card, caption with a people icon "Visible to the
     Requester", composer label "Reply to the Requester", button **Post public
     comment**.
   - *Internal notes* tab: the Internal region (§1.6), composer label "Add an
     internal note", button **Add internal note**.
   - The two composers never share a text box: switching tabs keeps each draft
     separate, so text typed as a note cannot be sent as a comment (AC-24).

### 7.3 Ticket controls panel (IT Staff)
- **Owner**: select of assignable users (*Unassigned* allowed only for `NEW`/`OPEN`)
  plus **Assign to me** (secondary) when the caller is not the owner.
- Every save from this panel sends the owner and status the screen is showing
  (`expectedOwnerId`, `expectedStatus`), so a change made meanwhile by someone else
  is refused rather than overwritten (BR-31, BR-43) and the screen reloads (§7.5).
- **IT Priority**: select + **Save**; shows "Requested: X" beneath for reference.
- **Status**: current badge, a select listing only `permittedTransitions`, and
  **Update status**. Choosing `RESOLVED`, `CLOSED`, `CANCELLED`, or `REOPENED`
  opens a confirmation dialog (BR-46); `RESOLVED` asks for the resolution summary
  (10–2000), `CANCELLED`/`REOPENED` for a reason (10–1000) with the note "This reason
  will be posted as a public comment." Destructive styling for Cancel ticket.
- Owner-less ticket: the status select shows only `CANCELLED`, with the hint
  "Assign an owner to move this ticket forward." (BR-42).
- Terminal ticket: the panel shows read-only values and "This ticket is closed."

### 7.4 Administrator view
Same layout. The Ticket controls panel shows owner, IT Priority, and status as
read-only text with the note "Administrators can view tickets but not change them."
Both conversation tabs are readable; composers are absent (BR-21).

### 7.5 States
Loading skeleton; not-found ("This ticket doesn't exist.") with Back to queue;
`409 STALE_STATE`: banner "This ticket was changed by someone else. It has been
reloaded." and the ticket reloads; other `409`s show their message beside the
control that caused them; save success shows a toast ("Owner updated", "Status
changed to In Progress"); failure banners keep entered text.

## 8. Screen — User Management (`/admin/users`)

### 8.1 List
- Heading "User Management", **Create user** primary at the right.
- Toolbar: search ("Search by name or email", debounced 300ms) and **Role** select
  (All roles, Requester, IT Staff, Administrator). No pagination (labsheet §8.5).
- Table: Name (+ "You" pill on the caller's row), Email, Role badge, Status
  (Active ✓ / Inactive ✗ pill with icon and text), **Edit** (tertiary button,
  `aria-label="Edit <name>"`).
- Mobile: cards — name + role badge, email, status, Edit.
- States: loading skeleton; empty search result "No users match your search." with
  Clear; failure banner + Retry.

### 8.2 Create user panel
Side panel (§1.8) titled "Create user": Full name*, Email*, Role* (select of the
three roles), Active (switch, default on, with text "Active"/"Inactive"), Initial
password* (show/hide toggle, a **Generate** tertiary button that fills a random
password meeting BR-07, and the §4 rules checklist). Helper text: "The user must
change this password when they first sign in. Share it with them yourself — it is
not emailed." (D-16). Footer: **Create user** (busy "Creating…"), Cancel.

### 8.3 Edit user panel
Title "Edit <name>": Full name*, Email*, Role*, Active switch. Below a divider, a
section **Set new initial password** with a password field (same rules and
Generate) and a secondary **Set initial password** button that opens a confirmation
dialog ("<name> will be signed out everywhere and must choose a new password at their
next sign-in."). Footer: **Save changes**, Cancel.

### 8.4 Safety rules in the UI
Shown as disabled controls with a visible reason, and also enforced by the server
(BR-27):
- Own account: Role select and Active switch disabled, reason "You can't change your
  own role or deactivate your own account." The Set new initial password section is
  replaced by a link to Change Password.
- `409 LAST_ADMINISTRATOR`, `OWNS_OPEN_TICKETS`, `EMAIL_TAKEN`: message below the
  related field; nothing saved; panel stays open with the user's input.

### 8.5 States
Saved → panel closes, row updates, toast ("User created", "Changes saved",
"Initial password set"); validation → below each field; forbidden → shell callout;
failure → banner inside the panel, input kept.

## 9. Screen modes and feedback (labsheet §8.6)

| Screen | Modes | Feedback states |
| :--- | :--- | :--- |
| Login | sign in | submitting, invalid, inactive, throttled, session ended, failure |
| Change Password | forced, voluntary | rules checklist, mismatch, wrong current, saving, success, failure |
| Requester Ticket Detail | view, mark appears resolved, post comment | loading, not found, closed-ticket notice, posting, success, validation, failure |
| Ticket Queue | browse (IT Staff), browse read-only (Administrator) | loading, empty, no results, forbidden, failure |
| IT Staff Ticket Detail | view, operate (IT Staff), read-only (Administrator) | loading, not found, saving, success, validation, stale/conflict, forbidden, failure |
| User Management | list, create, edit, set initial password | loading, no results, saving, success, validation, conflict, forbidden, failure |

## 10. Accessibility
Lab 2 §7 applies to every new screen. In addition:
- Tabs use `role="tablist"`/`tab`/`tabpanel`, `aria-selected`, arrow-key navigation.
- Side panels and dialogs trap focus, close on Escape, restore focus to their opener.
- Password show/hide toggles are buttons with `aria-pressed` and a changing label.
- The rules checklist is a list whose items carry the ✓/✗ state in text for screen
  readers ("met"/"not met").
- Toasts are announced politely and stay at least 5 seconds; none is the only place
  an error appears.
- Badges and pills always carry text; no state is conveyed by colour alone.

## 11. Responsive summary
| Screen | Desktop ≥992px | Tablet 768–991px | Mobile <768px |
| :--- | :--- | :--- | :--- |
| Login / Change Password | centred card | centred card | full-width card, 16px page padding |
| Requester Ticket Detail | Lab 2 two-column info | stacked | stacked; buttons full-width |
| Ticket Queue | 7-column table | 6-column table | cards + filters sheet |
| IT Staff Ticket Detail | main + sticky controls | controls above main | controls above main; tabs scroll horizontally inside their own strip only |
| User Management | table + right side panel | table + full-screen panel | cards + full-screen panel |

All sizes: no horizontal page scroll, no clipped labels, no overlapping messages,
touch targets ≥44px on mobile.

## 12. Visual inspection checklist
Recorded per issue in `tests.md` §4:
- [ ] New screens use only `--zg-*` tokens and the badge classes above — no ad hoc hex values.
- [ ] Role navigation shows exactly the destinations in §2 for each role.
- [ ] All eight status badges, three priority badges, and three role badges render with the §1 pairs everywhere they appear.
- [ ] Editable (Ticket controls, forms) and read-only (ticket information) fields are visibly distinct.
- [ ] Public Comments and Internal Notes are distinguishable without reading the text (region style) and with it (caption, button label).
- [ ] Validation messages sit directly below their fields; conflict messages next to the control that caused them.
- [ ] Focus indicator is visible on every interactive element, including tabs, switches, and the side panel.
- [ ] No clipping, overlap, or horizontal overflow at desktop, tablet, and mobile on every Lab 3 screen.
- [ ] Administrator read-only views show no operational control.

## 13. Screenshot paths
Under `artifacts/lab-03/screenshots/`, named `<breakpoint>-<state>.png` with
breakpoint `desktop`, `tablet`, or `mobile`:

| Folder | States |
| :--- | :--- |
| `authentication/` | `login`, `login-invalid`, `login-inactive`, `login-throttled`, `change-password-forced`, `change-password-rules`, `shell-requester`, `shell-it-staff`, `shell-administrator`, `logged-out-redirect` |
| `requester-regression/` | `ticket-detail-comments`, `appears-resolved-confirm`, `appears-resolved-done`, `closed-ticket` |
| `staff-queue/` | `default`, `filtered`, `sorted`, `page-2`, `unassigned`, `empty`, `no-results`, `failure`, `admin-read-only` |
| `staff-ticket-detail/` | `view`, `claim`, `priority-changed`, `status-confirm`, `public-comments`, `internal-notes`, `stale-conflict`, `admin-read-only` |
| `user-management/` | `list`, `search`, `role-filter`, `create`, `create-validation`, `duplicate-email`, `edit`, `set-initial-password`, `self-restriction`, `last-administrator`, `forbidden` |
