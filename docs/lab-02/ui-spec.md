# Lab 2 UI Specification — Zen Green Theme

Companion to `specification.md` §6. This is the precise visual/behavioral contract
the coding agent implements against and the visual checklist (§8.8 of the labsheet)
is graded against. Built on Bootstrap 5.3 (already a client dependency) with a thin
Zen Green token layer on top — no new UI framework is introduced.

## 1. Color tokens

Defined as CSS custom properties in `client/src/styles/zen-green.css`, loaded once
in `main.tsx`.

| Token | Value | Use |
| :--- | :--- | :--- |
| `--zg-primary` | `#006B3C` | App header background, primary button fill, strong emphasis text |
| `--zg-secondary` | `#0B7A46` | Active nav tab, focus ring accent, links, hover states |
| `--zg-pale` | `#EAF6EF` | Selected state background, success surfaces, subtle section emphasis |
| `--zg-bg` | `#F5F7F6` | Page background |
| `--zg-surface` | `#FFFFFF` | Cards, panels, the form itself |
| `--zg-border` | `#D8E3DD` | Default border on editable fields and cards |
| `--zg-text` | `#1B2B22` | Body text (dark charcoal-green, never pure black) |
| `--zg-text-muted` | `#5B6B62` | Secondary/help text |
| `--zg-readonly-bg` | `#EFEDE4` | Read-only field background (warm ivory) |
| `--zg-readonly-border` | `#DDD8C8` | Read-only field border |
| `--zg-error-text` | `#8A1F11` | Error text |
| `--zg-error-border` | `#C0392B` | Error field border |
| `--zg-error-bg` | `#FBEAE2` | Error banner/inline background |
| `--zg-warning-bg` | `#FFF4DE` | Warning callout background — reserved for actual warnings only, never decorative |
| `--zg-warning-text` | `#8A5A00` | Warning callout text |
| `--zg-success-text` | `#0B7A46` | Success confirmation text (paired with `--zg-pale` background and a ✓ icon, never color alone) |

Every color pairing above meets WCAG AA contrast (4.5:1) for normal text; `--zg-text`
on `--zg-bg`/`--zg-surface`/`--zg-pale`/`--zg-readonly-bg` all pass, as does white
text on `--zg-primary`.

## 2. Typography and spacing

- Font stack: Bootstrap's default system stack (`-apple-system, "Segoe UI", Roboto, ...`) — no new font dependency.
- Scale: page `h1` = `1.5rem/600`, screen `h2` = `1.25rem/600`, field labels =
  `0.875rem/600` uppercase-tracked slightly (`letter-spacing: 0.02em`), body/input
  text = `1rem/400`, help/error text = `0.8125rem/400`.
- Spacing grid: 4px base (Bootstrap's default `$spacer` steps: 0.25/0.5/1/1.5/3rem).
  Field groups use `mb-3`; section groups use `mb-4`; page padding `py-4 px-3` mobile,
  `py-5 px-4` desktop.

## 3. Field states

| State | Class | Visual |
| :--- | :--- | :--- |
| Editable, default | `.zg-field` | White (`--zg-surface`) bg, `--zg-border` 1px border, 40px height |
| Editable, focused | `.zg-field:focus-visible` | 2px `--zg-secondary` outline, no border color change (keeps focus ring separate from validation color) |
| Read-only | `.zg-field.zg-field--readonly` | `--zg-readonly-bg` bg, `--zg-readonly-border` border, `cursor: default`, no focus ring (not tabbable) |
| Invalid | `.zg-field.is-invalid` | `--zg-error-border` border, `--zg-error-text` adjacent message directly below the field (never only at the top of the form) |
| Disabled | `.zg-field:disabled` | 60% opacity, `--zg-readonly-bg` bg, `cursor: not-allowed`, no hover/focus effect |

Required-field label pattern: `<label>Summary <span class="zg-required" aria-hidden="true">*</span></label>` —
the asterisk is `aria-hidden` because the input's own `aria-required="true"` already
communicates it to assistive tech; the asterisk is visual-only and never replaces
the inline validation message (labsheet §8.3).

## 4. Button hierarchy

| Variant | Class | Style | Used for |
| :--- | :--- | :--- | :--- |
| Primary | `.btn.zg-btn-primary` | `--zg-primary` fill, white text | Submit, Continue, Create Ticket |
| Secondary | `.btn.zg-btn-secondary` | White fill, `--zg-secondary` border+text | Cancel, Change Requester, Clear Filters |
| Tertiary | `.btn.zg-btn-tertiary` | No border/fill, `--zg-secondary` text, underline on hover | "View Ticket", inline links |
| Destructive | `.btn.zg-btn-destructive` | `--zg-error-border` fill, white text | Confirm Soft-Remove (inside the confirmation step only) |
| Disabled | `[disabled]` on any variant | 50% opacity, `cursor: not-allowed`, pointer-events retained only for a tooltip explaining why | Any control that cannot currently be activated |
| Busy | `.zg-btn--busy` | Spinner + label changes to a present-participle ("Submitting…"), `disabled` set | Submit while its request is in flight |

Every icon-only button (e.g. a compact "Change Requester" icon variant in the
collapsed mobile nav) carries `aria-label` and a `title` tooltip — text-only buttons
are preferred everywhere space allows.

## 5. Badge rules

| Category | Value | Background | Text |
| :--- | :--- | :--- | :--- |
| Priority | `LOW` | `#EAF6EF` | `#0B7A46` |
| Priority | `MEDIUM` | `#E8EEF7` | `#2A4D7A` |
| Priority | `HIGH` | `#FBEAE2` | `#B23A24` |
| Status | `NEW` | `#EAF6EF` | `#0B7A46` |
| Status | *(reserved, not reachable in Lab 2)* | — | defined only when Lab 3+ introduces the value |

A given value always renders with the same pair everywhere it appears (Create
Ticket success view, My Tickets list/cards, Ticket Detail) — checked by STYLE-9.1.
Priority colors are deliberately distinct hues from `--zg-warning-*`, since the
labsheet forbids using the warning color as ordinary decoration.

## 6. Screens

### 6.1 Application shell
- Header bar: `--zg-primary` background, white "TokTickIT" wordmark, nav links
  (My Tickets, Create Ticket) with the active link underlined in white and bold,
  current Requester name at the right with a "Change Requester" tertiary button
  next to it.
- Below 768px: nav collapses into a hamburger toggle; Requester name + Change
  Requester move into the collapsed menu.
- Active-page indication: the active nav link additionally gets `aria-current="page"`.

### 6.2 Development Requester Selection (`/select-requester`)
- Centered card, max-width 480px, on `--zg-bg`.
- "TokTickIT" title, then the required explanatory paragraph:
  > Select a Development Requester to test requester-specific ticket behavior.
  > This is not a login screen. Authentication and role-based access will be
  > introduced in Lab 3.
- `<select>` of active Requesters (`name` shown, sourced from `GET /api/requesters`),
  Continue button (disabled until a Requester is chosen).
- States: loading (spinner in place of the select), empty (`GET` returns `[]` →
  "No active Requesters are available. Contact an administrator." — no Continue),
  failure (`GET` errors → safe retry message + Retry button).
- Fully keyboard operable: `<select>` and Continue reachable via Tab, `Enter`
  submits when Continue has focus.

### 6.3 Create Ticket (`/tickets/new`)
Desktop (≥992px): two-column grid, max-width 960px centered.
- Top band (full width): read-only Ticket Number ("Generated after submission"),
  Ticket Date (blank until submit), Requester (from current selection) — all
  `.zg-field--readonly`.
- Classification row (2 columns): Category select, Related System select.
- Requested Priority (own row, radio-button group or select — 3 options).
- Summary (full width, single line, live character counter `n/120`).
- Description (full width, `<textarea>` min-height 160px, resizable vertically
  only, live character counter `n/2000`).
- Attachments (full width): file picker + drag-and-drop zone, list of selected
  files each showing name/size/status, per-file inline rejection reason.
- Bottom bar: Submit (primary, busy state) left, Cancel (secondary) right.

Tablet (768–991px): same order, single column, Category/Related System stack.
Mobile (<768px): fully stacked, full-width controls, Submit/Cancel become
full-width stacked buttons (Submit on top).

**Screen states:** initial (empty form, Requester pre-filled) → validation
(inline messages appear per-field on blur and on submit attempt) → submitting
(Submit busy, all fields disabled) → success (form replaced by a confirmation
panel showing the Ticket Number, "View Ticket" primary + "Create Another"
tertiary) → failure (submitting state clears, a `--zg-error-bg` banner appears
above the form with the safe error message, all field values and selected
attachments remain exactly as typed).

Screenshots: `artifacts/lab-02/screenshots/create-ticket/{desktop,tablet,mobile}-{initial,validation,submitting,success,api-failure,invalid-attachment}.png`.

### 6.4 My Tickets (`/tickets`)
Desktop: toolbar row (search input, Category/Related System/Priority filter
dropdowns, sort dropdown, "Clear filters" tertiary button, "Create Ticket"
primary button right-aligned) above a table: Ticket Number, Summary, Category,
Requested Priority (badge), Current Status (badge), Last Updated. Row click
opens Ticket Detail. Pagination footer: page numbers + Prev/Next, page-size
indicator.

Tablet: same toolbar, table columns reduce to Ticket Number, Summary, Status,
Last Updated (Category/Priority visible on row expand or as sub-text).

Mobile (<768px): toolbar collapses to a search bar with a filter icon opening a
bottom sheet (Category/Related System/Priority/Sort); list becomes cards, one
per Ticket: Ticket Number + Status badge on top row, Summary below, Category ·
Priority badge · Last Updated on the bottom row; pagination becomes
Prev/Next + "Page X of Y" text.

**States:** loading (skeleton rows/cards), empty (zero Tickets ever — illustration
+ "You haven't created any tickets yet" + Create Ticket CTA), no-results (search/
filter matches zero — "No tickets match your filters" + Clear Filters link, no
CTA emphasis), failure (safe retry banner).

Screenshots: `artifacts/lab-02/screenshots/my-tickets/{desktop,tablet,mobile}-{loading,list,empty,no-results,failure}.png`.

### 6.5 Requester Ticket Detail (`/tickets/:id`)
- Header band: Ticket Number (large), Status badge, Priority badge, "Back to My
  Tickets" tertiary link.
- Info section (read-only, 2-column on desktop, stacked on mobile): Category,
  Related System, Requester, Ticket Date, Summary, Description (full width).
  Visually separated (card border + heading "Ticket Information") from —
- Attachments section (own card, heading "Attachments"): active attachments
  listed with filename, size, uploaded date, Download + Soft-Remove actions;
  removed attachments listed below a divider, dimmed, showing filename, size,
  removed date, and removal reason, with no action controls. "Add Attachment"
  button at the top of this section, disabled with a tooltip once 5 active
  attachments exist.
- Soft-remove is a two-step confirmation: clicking it opens a modal requiring a
  reason (3–200 chars, validated inline) and a destructive "Remove Attachment"
  button; canceling or clicking outside does nothing.
- No comment box, no internal notes, no status-change control anywhere on this
  screen — those features do not exist in Lab 2.

Screenshots: `artifacts/lab-02/screenshots/ticket-detail/{desktop,tablet,mobile}-{view,add-attachment,remove-confirm,removed-state,failure}.png`.

## 7. Accessibility rules

- Every `<input>/<select>/<textarea>` has a bound `<label htmlFor>`.
- Every inline validation message has `id="<field>-error"`, referenced by the
  field's `aria-describedby`, and the field carries `aria-invalid="true"` while
  invalid.
- A page-level `aria-live="polite"` region announces success/failure banners as
  they appear, so screen-reader users don't need to discover them visually.
- Focus is always visible (`:focus-visible` outline in `--zg-secondary`, never
  suppressed with `outline: none` without a replacement).
- The Soft-Remove confirmation modal traps focus while open and returns focus to
  the triggering button on close.
- Success/error/warning states never rely on color alone — each pairs an icon
  and explicit text with its color.

## 8. Responsive rules

| Viewport | Rule |
| :--- | :--- |
| Desktop ≥992px | Multi-column per §6 above; content centered, max-width 960–1140px depending on screen. |
| Tablet 768–991px | Two-column where practical; Summary/Description always full-width. |
| Mobile <768px | Everything stacks vertically; buttons full-width and ≥44px tall (touch target); zero horizontal page scroll. |
| All sizes | No clipped labels, no overlapping messages, no hidden buttons, attachment filenames truncate with an ellipsis + full name in a `title` tooltip rather than overflowing. |

## 9. Visual inspection checklist (filled in per issue, recorded in `tests.md`)

- [ ] Zen Green tokens used consistently — no ad hoc hex values in component CSS.
- [ ] Editable vs read-only fields visually distinct on every screen that has both.
- [ ] Every validation message sits directly below its field, not only at the top.
- [ ] Button hierarchy (primary/secondary/tertiary/destructive/disabled/busy) matches §4 everywhere it appears.
- [ ] No clipping, overlap, or unintended horizontal scroll at desktop/tablet/mobile on all three screens.
- [ ] Badge color/label pairs identical across Create Ticket, My Tickets, and Ticket Detail.
- [ ] Filters, pagination, attachment controls, and empty/no-results states remain usable at every viewport.
- [ ] Focus indicator visible when tabbing through all three screens.

Screenshot evidence lives under `artifacts/lab-02/screenshots/{create-ticket,my-tickets,ticket-detail}/`, one set per breakpoint per required state, matching the paths listed in §6 above.
