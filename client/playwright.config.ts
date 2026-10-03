import { defineConfig, devices } from "@playwright/test";

// Issue 9 — e2e/lab-02 lives at the repo root, a sibling of client/ and
// server/, not inside either, so testDir below needs docker-compose.yml's
// /e2e mount to reach it from /app regardless of how the suite is
// invoked (docs/lab-02/tests.md §5's command is a bare
// `docker-compose exec client npx playwright test` — a path argument
// is matched as a regex against paths *relative to* testDir, so passing
// one written relative to the repo root, like `../e2e/lab-02/...`,
// matches nothing and finds zero tests).
export default defineConfig({
  // Lab 3, Issue 10: both labs' suites — e2e/lab-02 (the Requester journey)
  // and e2e/lab-03 (authentication, the staff ticket flow, user
  // administration). A path filter on the command line is matched against
  // paths relative to this folder, e.g. `npx playwright test lab-03/`.
  testDir: "../e2e",
  testMatch: /lab-0[23]\/.*\.spec\.ts$/,
  // Real tickets, attachments, and (Lab 3) users the suites create through
  // the actual app (no delete routes exist to clean up through) — swept
  // once, after every project finishes, so repeated local runs don't pile
  // up garbage in the shared dev DB/uploads (e2e/globalTeardown.ts runs
  // each lab's own sweep).
  globalTeardown: "../e2e/globalTeardown.ts",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
    // Alpine's musl libc can't run Playwright's own downloaded Chromium
    // build (glibc-only) — Dockerfile.dev installs Alpine's own chromium
    // package instead and this points Playwright at it, skipping
    // Playwright's browser download entirely (PLAYWRIGHT_SKIP_BROWSER_
    // DOWNLOAD=1, also set in Dockerfile.dev). Undefined outside Docker
    // lets Playwright fall back to its own managed browser on a normal
    // host machine.
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
  webServer: {
    // A dedicated Vite instance on its own port (5174), separate from the
    // one a human uses via the host browser (5173). Since Lab 3 (D-11) the
    // page only ever calls its own origin's /api, which this dev server
    // proxies to the `server` service by its Docker Compose name — so the
    // session cookie is first-party for the browser Playwright drives.
    command: "API_PROXY_TARGET=http://server:3000 npm run dev -- --host --port 5174",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 834, height: 1112 } },
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } },
    },
  ],
});
