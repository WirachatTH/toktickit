# TokTickIT 

## Setup Instructions (Dockerized)

This project has been set up to run entirely via Docker Compose.

### Prerequisites
- Docker and Docker Compose installed on your system.

### Running the Application
1. Ensure your Docker daemon is running.
2. In the root directory, start the application by running:
   ```bash
   docker-compose up -d --build
   ```
3. This will spin up three containers:
   - **db**: PostgreSQL database (exposed on port 5432)
   - **server**: Node.js Express backend (exposed on port 3000)
   - **client**: React + Vite frontend (exposed on port 5173)

4. Once running, you can access the frontend at [http://localhost:5173](http://localhost:5173).

### Stopping the Application
To stop the application, run:
```bash
docker-compose down
```

### Running Tests
To run the automated tests inside the containers:

**Client Tests:**
```bash
docker-compose exec client npm test
```

**Server Tests:**
```bash
docker-compose exec server npm test
```

### Performing API Health Check

You can verify the backend API health in two ways:

1. **Via Browser:** 
   Navigate to [http://localhost:3000/api/health](http://localhost:3000/api/health). You should see a JSON response: `{"status":"ok","service":"TokTickIT API"}`.

2. **Via Supertest:**
   Run the backend test suite which includes a Supertest verification of the health endpoint:
   ```bash
   docker-compose exec server npm test
   ```

### Verifying Database & Seed Data

You can manually verify that the database table was created and the default categories were seeded correctly. 

1. **Verify Database Records:**
   Run a Prisma client query directly inside the server container to fetch and print all records. This avoids any SQL quoting issues across different terminal environments like PowerShell:
   ```bash
   docker-compose exec server npx tsx -e "import { PrismaClient } from '@prisma/client'; new PrismaClient().category.findMany().then(console.log)"
   ```
   *Expected result: A JSON array showing the four categories (Account and Access, Hardware, Software, Network) along with their IDs and timestamps.*

2. **Verify Seed Idempotency (Safe from Duplicates):**
   The seed script is designed to safely update or skip existing records without creating duplicates. Test this by running the seed script manually:
   ```bash
   docker-compose exec server npm run prisma:seed
   ```
   *Expected result: The script will output "Seeding complete". Running the Prisma query command from Step 1 again will confirm there are still exactly four records.*

3. **Verify Database Credentials Are Not Committed:**
   The project is designed to keep secrets out of version control. To verify this:
   - Check the `server/.env` file. This file contains your actual database credentials (like `DATABASE_URL`) but it is safely ignored by Git.
   - Run `git status` or look at `.gitignore` to confirm that `.env` is ignored. 
   - Check `server/.env.example`. This file is committed to Git but only contains safe placeholder values.

### Verifying IT Request Category List

To verify the implementation of the IT request category list feature:

1. **Verify Backend API (/api/categories):**
   Navigate to [http://localhost:3000/api/categories](http://localhost:3000/api/categories) in your browser. You should see a JSON array containing the 4 seeded categories with their `id` and `name` attributes, sorted by `id` ascending.

2. **Verify Frontend UI:**
   Navigate to [http://localhost:5173](http://localhost:5173). You should see the "Check System" button. Clicking it should briefly display a "Loading…" state, followed by an "Online" status and a list of the 4 seeded IT request categories fetched from the API.

3. **Verify Automated Tests:**
   The automated test suite verifies the API response and React UI states. Run the test suites via Docker to confirm:
   
   **Run Backend Tests (Vitest + Supertest):**
   ```bash
   docker-compose exec server npm test
   ```
   *Expected result: `health.test.ts` and `categories.test.ts` pass, using Supertest to verify the API returns HTTP 200 and the categories in order.*

   **Run Frontend Tests (Vitest):**
   ```bash
   docker-compose exec client npm test
   ```
   *Expected result: `App.test.tsx` passes with assertions for "Online", the seeded categories, and "Offline" error messages, verifying UI behavior through Vitest.*

---

## Lab 2 — Requester Ticketing MVP

Lab 2 builds on the same Docker Compose stack. Engineering contract lives in
`docs/lab-02/` (`specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md`).

> **Status:** Issue 1 (specification/test/UI/API docs) is drafted on
> `feature/1-doc-prep`. No Lab 2 database models, endpoints, or screens exist yet —
> this section is a scaffold and will be filled in with real verification steps as
> each subsequent issue (`feature/2-data-model` onward) lands. Treat any command
> below as "will work once that issue merges," not as currently true.

### Applying the Lab 2 database migration and seed (once Issue 2 lands)
```bash
docker-compose exec server npx prisma migrate dev
docker-compose exec server npm run prisma:seed
```
*Expected result: adds `RequesterUser`, `RelatedSystem`, `Ticket`, and `Attachment`
tables; seed inserts ≥6 Related Systems, ≥4 active + ≥1 inactive Development
Requesters, and keeps the 4 existing Categories unchanged. Safe to re-run.*

### Running Lab 2 tests (once the corresponding issue lands)
```bash
# Backend (Vitest + Supertest) — server/tests/lab-02/
docker-compose exec server npm test

# Frontend (Vitest + Testing Library) — client/tests/lab-02/
docker-compose exec client npm test

# E2E (Playwright, added in Issue 9) — e2e/lab-02/
docker-compose exec client npx playwright test ../e2e/lab-02/requester-ticket-flow.spec.ts
```

### Verifying the Requester ticketing flow (once implemented)
1. Open [http://localhost:5173](http://localhost:5173) — you'll land on the
   Development Requester Selection screen. Pick an active Requester and continue.
2. Create a ticket from the Create Ticket screen, attach a JPG/PNG/WEBP/PDF under
   5 MB, and submit — a backend-generated Ticket Number (`TCK-######`) is shown.
3. Open My Tickets — the ticket you just created appears; use search/filters/sort/
   pagination to confirm they work, then use "Change Requester" and confirm the
   ticket disappears for a different Requester.
4. Open the ticket's Detail screen, download the attachment, then soft-remove it
   with a reason and confirm it's no longer downloadable but its metadata remains.

Full traceability from each acceptance criterion to its automated test is in
`docs/lab-02/tests.md`.