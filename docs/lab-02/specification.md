# Lab 2: Requester MVP Engineering Specification

## 1. Goals & Scope
**Goal:** Implement the minimum viable product (MVP) for IT Requesters, allowing them to submit tickets, view their tickets, and manage file attachments.
**Scope:** Includes Mock Login, Create Ticket flow, My Tickets list view, and Ticket Details. Out of scope: Real authentication, IT Staff workflows, and ticket status transitions by staff.

## 2. Functional Requirements
- **Mock Login:** A UI to select a development requester (seed data) and save their ID in global state to simulate an active session.
- **Create Ticket:** A form for requesters to submit an IT ticket containing a subject, description, category, related system, and optional attachments.
- **My Tickets:** A paginated, searchable, sortable list view showing only the active requester's tickets.
- **Ticket Details:** A read-only view of a specific ticket belonging to the requester, with a management zone to view and soft-delete attachments.

## 3. Business Rules
- **Defaults:** Tickets default to 'Open' status upon creation.
- **Requester Switching:** Changing the active requester instantly updates the ticket list to match the new user, dropping any active state.
- **Ownership:** Requesters can only view, download attachments for, and manage tickets they created. Accessing others' tickets results in a 403 Forbidden or 404 Not Found error.
- **Search/Filter/Sort/Pagination:** The API must support cursor or offset pagination, text search on subjects, filtering by category/status, and sorting by date/status.
- **Validation:** 
  - Subject (required, max 100 chars).
  - Description (required, max 1000 chars).
  - Category & Related System must exist in the database.
- **Failure/Data-Retention:** If a ticket submission fails, the client must preserve form state so the user doesn't lose their drafted text. In the event of a partial failure (e.g., ticket creation succeeds but attachment upload fails), the system must notify the user of the upload failure but still allow them to access the created ticket to re-attempt the upload.
- **Attachment Lifecycle:** 
  - Uploads must be <= 5MB.
  - Allowed extensions: JPG, PNG, WEBP, PDF.
  - Max 5 files per ticket.
  - Deletions are soft-deletes (retaining metadata/reason).
- **Inactive Requesters:** The Mock Login selector should explicitly hide or disable selection of requesters marked as `inactive` in the database.
- **Empty States:** The UI must handle cases where a requester has 0 tickets or a search yields 0 results with distinct messages.
- **Ticket-Detail Access:** A requester cannot view another requester's ticket details via URL guessing.
- **Lab 3 Transition:** The mock login system is strictly temporary and must be cleanly isolated so it can be swapped for a real authentication context (like JWT) in Lab 3.

## 4. Data Changes
The following models will be added/updated in the Prisma Schema (`schema.prisma`):
- `RequesterUser`: Represents an employee who can submit tickets.
- `Category`: Represents IT request categories (e.g., Software, Hardware).
- `RelatedSystem`: Represents IT systems (e.g., ERP, Email).
- `Ticket`: Core entity containing requesterId, categoryId, systemId, subject, description, and status.
- `Attachment`: Links to a Ticket. Includes filename, path, size, mimeType, and `isDeleted` flag (for soft removal) along with `deletedAt` and `removalReason`.

## 5. API Contracts
Detailed in `api-spec.md`. Required endpoints:
- `GET /api/requesters`
- `GET /api/categories`
- `GET /api/systems`
- `POST /api/tickets`
- `GET /api/tickets`
- `GET /api/tickets/:id`
- `GET /api/attachments/:id`
- `POST /api/tickets/:id/attachments`
- `DELETE /api/attachments/:id`
- `GET /api/attachments/:id/download`

## 6. Acceptance Criteria
*   **AC-01 (Login):** When a user selects a name from the Mock Login dropdown, the app saves this ID globally.
*   **AC-02 (Create Valid Ticket):** When a user fills the Create form correctly and clicks Submit, the button shows a loading state, disables itself, and upon success displays the generated ticket number.
*   **AC-03 (Create Invalid Ticket):** When a user submits an invalid form, they see validation errors and their entered data is preserved.
*   **AC-04 (List Tickets):** When a user visits My Tickets, they see exactly their tickets, paginated.
*   **AC-05 (Cross-Requester Security):** When User A tries to `GET /api/tickets/<User B's Ticket ID>`, the server returns an error.
*   **AC-06 (Attachment Limits):** When a user tries to upload a 6MB file, the upload is rejected.

## 7. Definition of Done
### Product Completion
- [ ] Code is written and satisfies all Acceptance Criteria.
- [ ] Unit, API, and UI tests pass.
- [ ] No regression of Lab 1 features.
- [ ] UI accurately matches the Zen Green Theme.
### Course Delivery Requirements
- [ ] Code is pushed to `lab2-staging`.
- [ ] All requested documentation (`specification.md`, `tests.md`, etc.) is committed.
- [ ] Screenshots are captured correctly in `artifacts/lab-02/screenshots/`.
- [ ] Final PDF is generated.

## 8. Assumptions & Decisions
- **HTTP Success/Error Statuses:** We will strictly use `200 OK`, `201 Created` for success. `400 Bad Request` for validation failures. `403 Forbidden` for ownership failures. `404 Not Found` for missing resources. `500 Internal Server Error` for safe unexpected errors (never leaking stack traces).
- **Storage:** File attachments will be stored locally on the disk (in a secure, non-public directory) rather than S3 for MVP simplicity. The `Attachment` model will store the absolute or relative file path.
- **Attachment Deletion:** Because deletion is a soft-delete, the physical file will remain on disk for auditing purposes, but `GET /api/attachments/:id/download` will explicitly block downloads if `isDeleted` is true.
