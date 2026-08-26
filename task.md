# Issue 3: Create Ticket Flow

- [x] Update Prisma schema to include `Ticket` model (and `Attachment` if necessary for uploads).
- [x] Run Prisma migration to apply schema changes.
- [x] Implement backend API `POST /api/tickets` to handle ticket creation.
- [x] Implement backend API for ticket attachments (`POST /api/tickets/:id/attachments`).
- [x] Write backend tests for `POST /api/tickets` (success, validation failure, etc.).
- [x] Implement Create Ticket Screen UI (form fields, validation, busy state).
- [x] Implement Client-side attachment handling (Max 5MB, Max 5 files, file types).
- [x] Write frontend tests (Vitest) for Create Ticket flow.
- [ ] Add Playwright E2E tests for Issue 3 flow.
- [ ] Update `docs/lab-02/ai-use.md` and `docs/lab-02/reviewer.md` (optional, as I will just create the code first).
