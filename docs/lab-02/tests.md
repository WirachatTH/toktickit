# Lab 2: Test Plan

## 1. Test Strategy
We will employ a standard testing pyramid to ensure absolute coverage of the API contracts and business rules.

- **Unit Tests (Vitest):** Used for isolated frontend utility functions (e.g., date formatting, client-side validation logic). Located within the `client/` directory.
- **Integration/API Tests (Vitest + Supertest):** Used for the Express backend. These tests spin up the Express app in memory and hit the REST endpoints to verify HTTP statuses, JSON schemas, database inserts, and ownership rules. Located in `server/tests/lab-02/`.
- **UI Tests (Vitest + React Testing Library):** Used for frontend React components. These verify the DOM for correct CSS classes (Zen Green Theme), aria accessibility attributes, disabled button states, and conditional rendering (loading/empty states). Located in `client/.../lab-02 tests/`.
- **End-to-End Tests (Playwright):** Used for verifying the entire connected stack. A headless browser will navigate from the Mock Login through ticket creation and list viewing to ensure the user flow works end-to-end. Located in `e2e/lab-02/`.

## 2. Planned Tests Matrix

| Feature | Test Type | File Path / Location | Description |
| :--- | :--- | :--- | :--- |
| Mock Login | API | `server/tests/lab-02/requesters.test.ts` | Verifies `GET /api/requesters` returns only active requesters. |
| Mock Login | UI | `client/.../lab-02 tests/MockLogin.test.tsx` | Verifies dropdown hides inactive users, loading state, and handles API failure safely. |
| Create Ticket | API | `server/tests/lab-02/tickets.test.ts` | Verifies `POST /api/tickets` creates a DB record and returns 201. |
| Create Ticket | UI | `client/.../lab-02 tests/CreateTicket.test.tsx` | Verifies input validation, busy state disabled button, and preservation of data on failure. |
| My Tickets | API | `server/tests/lab-02/tickets.test.ts` | Verifies `GET /api/tickets` strictly filters by requester ID and handles pagination. |
| My Tickets | UI | `client/.../lab-02 tests/MyTickets.test.tsx` | Verifies responsive list, empty state messaging, and requester-switch list clearing. |
| Attachments | API | `server/tests/lab-02/attachments.test.ts` | Verifies upload rules (5MB, types), soft deletion, and download blocking. |
| Attachments | API | `server/tests/lab-02/tickets.test.ts` | Verifies cross-requester ticket/attachment fetching returns 403 Forbidden. |
| Full Journey | E2E | `e2e/lab-02/happy-path.spec.ts` | Simulates a full user login, ticket creation, list viewing, and attachment view. Explicitly captures responsive test evidence (Desktop/Tablet/Mobile screenshots). |

## 3. Acceptance-Criterion Traceability

- **AC-01 (Login)** -> `MockLogin.test.tsx`
- **AC-02 (Create Valid)** -> `tickets.test.ts` & `CreateTicket.test.tsx` & `happy-path.spec.ts`
- **AC-03 (Create Invalid)** -> `CreateTicket.test.tsx`
- **AC-04 (List Tickets)** -> `tickets.test.ts` & `MyTickets.test.tsx`
- **AC-05 (Cross-Requester Security)** -> `tickets.test.ts`
- **AC-06 (Attachment Limits)** -> `attachments.test.ts`

## 4. Expected Test Commands
- **Backend API:** `docker-compose exec server npm run test:lab2`
- **Frontend UI:** `docker-compose exec client npm run test:lab2`
- **E2E:** `docker-compose exec e2e npx playwright test lab-02`
