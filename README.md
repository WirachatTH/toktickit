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

> **Status:** All nine Lab 2 issues (spec/data model/design system/requester
> selector/create ticket/attachment lifecycle/my tickets/ticket detail/responsive
> & E2E QA) are implemented and merged into `lab2-staging`. Every command below is
> currently true, not aspirational.

### Applying the Lab 2 database migration and seed
```bash
docker-compose exec server npx prisma migrate dev
docker-compose exec server npm run prisma:seed
```
*Expected result: adds `RequesterUser`, `RelatedSystem`, `Ticket`, and `Attachment`
tables; seed inserts ≥6 Related Systems, ≥4 active + ≥1 inactive Development
Requesters, and keeps the 4 existing Categories unchanged. Safe to re-run.*

### Running Lab 2 tests
```bash
# Backend (Vitest + Supertest) — server/tests/lab-02/
docker-compose exec server npm test

# Frontend (Vitest + Testing Library) — client/tests/lab-02/
docker-compose exec client npm test

# E2E (Playwright — e2e/lab-02/), all three viewport projects
docker-compose exec client npx playwright test
```

### Verifying the Requester ticketing flow
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

> **Since Lab 3 (Issue 4):** the Requester screens need a sign-in instead of a
> selection. Sign in as one of the seeded Requesters (see *Local development
> accounts* below) for step 1, and for step 3 log out and sign in as a different
> Requester instead of using "Change Requester".

## Lab 3 — Users, Roles, IT Staff Ticketing & Administration

Lab 3 replaces the Development Requester selector with real email/password sign-in
and server-enforced roles (Requester, IT Staff, Administrator), and adds the IT Staff
Ticket Queue, IT Staff Ticket Detail, and a minimal User Management screen. The
engineering contract lives in `docs/lab-03/` (`specification.md`, `api-spec.md`,
`ui-spec.md`, `tests.md`).

> **Status:** Issues 1–10 are in (contract; users, migration, and seed; sign-in;
> roles and the app shell; the Lab 2 Requester flows on sign-in; Public Comments
> and Internal Notes; the IT Staff Ticket Queue; the ticket workflow and IT Staff
> Ticket Detail; Administrator User Management; responsive QA and the Lab 3
> end-to-end suites). Every planned test in `docs/lab-03/tests.md` now passes;
> Issue 11 re-runs them on `main` for the release. The Lab 2 Development
> Requester selector, its header, and its list endpoint are gone: the Requester
> is always the signed-in user.

### Applying the Lab 3 migration and seed
Back up first if your database holds anything you care about — the migration is
written to keep every Lab 2 row, and a backup makes that a choice rather than a hope:
```bash
docker exec toktickit-db pg_dump -U toktickit -d toktickit -Fc > pre-lab3.dump
docker-compose exec server npx prisma migrate deploy
docker-compose exec server npm run prisma:seed
docker-compose restart server        # regenerates the Prisma client for the Lab 3 schema
```
*Expected result:* `migrate deploy` applies `…_lab3_users_roles_workflow`, which
renames `RequesterUser` to `User` **in place** (hand-written SQL — Prisma's own diff
would have dropped the table; `specification.md` D-05), so every Lab 2 ticket and
attachment keeps its Requester. Migrated accounts have no password until the seed or
an Administrator gives them one. The seed prints how many accounts and sample
tickets it created; a second run creates nothing. `npx prisma migrate diff
--from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma` then reports
*No difference detected.*

### Local development accounts
Seeded accounts for **local development only** — never reuse these anywhere else.
Every one uses the password **`TokTickIT-dev-2026`**. Sign in at
[http://localhost:5173/login](http://localhost:5173/login).

| Role | Account | Notes |
| :--- | :--- | :--- |
| Requester | `somchai.prasert@kmutt.ac.th`, `napassorn.chaiyasit@kmutt.ac.th`, `teerapat.wongsawat@kmutt.ac.th`, `kanyarat.suksawang@kmutt.ac.th`, `piyawat.chatchai@kmutt.ac.th` | the Lab 2 Requesters, carried over by the migration |
| Requester (inactive) | `ananya.ruangrit@kmutt.ac.th` | cannot sign in |
| Requester (must change password) | `first.login@kmutt.ac.th` | the only account forced to set a new password at first sign-in |
| IT Staff | `chanon.rattanakorn@kmutt.ac.th`, `pimchanok.srisuk@kmutt.ac.th`, `worawit.thongdee@kmutt.ac.th` | |
| IT Staff (inactive) | `suda.kaewmanee@kmutt.ac.th` | still owns a ticket — ownership survives deactivation |
| Administrator | `siriporn.boonmee@kmutt.ac.th`, `krit.wattana@kmutt.ac.th` | two, so the last-Administrator rule can be exercised |

The seed also creates 18 sample tickets covering all eight statuses, every priority,
assigned and unassigned ownership, Public Comments, and Internal Notes.

**The seed only adds.** It never overwrites a password, role, or activation state
that already exists, and never edits an existing ticket, so a demo's changes survive
a re-run. To restore every account and sample ticket to the state above:
`docker-compose exec server npx prisma migrate reset` (this empties the database
first, then migrates and seeds).

### Configuration and upgrading an existing Docker stack
The browser talks only to the Vite dev server, which proxies `/api` to the API, so
the session cookie works the same in local development and in the Playwright E2E
setup (`docs/lab-03/specification.md` D-11). New settings, all with working
defaults:

| Variable | Service | Default |
| :--- | :--- | :--- |
| `CLIENT_ORIGINS` | server | `http://localhost:5173,http://localhost:5174` |
| `API_PROXY_TARGET` | client | `http://localhost:3000` (`http://server:3000` in Docker) |

The server container keeps `node_modules` in an anonymous volume, so after pulling
Lab 3 it still has the Lab 2 packages (Lab 3 adds `cookie-parser`) and Prisma
client. Rebuild it once, and recreate the client so it picks up
`API_PROXY_TARGET`:
```bash
docker-compose up -d --build --renew-anon-volumes server
docker-compose up -d client
```

### Signing in
- Each role lands on its own home and sees only the screens it may open:
  Requester → *My Tickets* and *Create Ticket*; IT Staff → *Ticket Queue*;
  Administrator → *User Management* and *Ticket Queue*. The Ticket Queue is live
  (Administrators see it read-only), and each row opens IT Staff Ticket Detail, where
  IT Staff claim, assign, prioritise, and move tickets through the workflow. User
  Management lists every account (search by name or email, filter by role) and
  creates, edits, deactivates, and sets a new initial password for users. An
  Administrator can't change their own role or deactivate themselves, and the last
  active Administrator can't be removed. There is no delete: deactivate instead.
- Opening a screen your role may not use takes you to your home with "You don't
  have access to that page." The server refuses the same requests (`403`) whatever
  the screen shows.
- Five wrong passwords for one email within 15 minutes refuse further attempts for
  that email until the oldest failure is 15 minutes old — the right password
  included. Restarting the server clears this if you lock yourself out while
  testing (`docker-compose restart server`).
- `first.login@kmutt.ac.th` is sent straight to *Set a new password*. Changing it
  is permanent until `npx prisma migrate reset` (the seed never overwrites a
  password), so use another account if you want to keep the documented state.

### Running Lab 3 tests
```bash
docker-compose exec server npm test               # server/tests/lab-01..03
docker-compose exec client npm test               # client/tests/lab-01..03
docker-compose exec client npx playwright test --workers=1    # e2e/lab-02..03, three viewports
```
- The Playwright suites sign in with the local development accounts above and
  create their own tickets and users, which `e2e/globalTeardown.ts` removes when
  the run ends. One worker is the reliable setting on a modest machine; the
  default (three Chromiums beside the dev server in one container) can time out.
- `npx playwright test lab-03/` runs only the Lab 3 suites.
- A normal run writes no screenshots, so the committed evidence stays untouched.
  To recapture it, run `docker-compose exec -e CAPTURE_SCREENSHOTS=1 client npx
  playwright test --workers=1`. That rewrites `artifacts/lab-03/screenshots/` and
  the Lab 2 journey's `artifacts/lab-02/screenshots/`; restore the Lab 2 ones with
  `git checkout artifacts/lab-02` if you only meant to refresh Lab 3. Each spec file
  removes its own test data when it ends, so the screenshots show the seeded data.