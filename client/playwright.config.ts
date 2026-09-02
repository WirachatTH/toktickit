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
  testDir: "../e2e/lab-02",
  // Real tickets/attachments the journey test creates through the actual
  // app (no "delete a ticket" route exists to clean up through) — swept
  // once, after every project finishes, so repeated local runs don't pile
  // up garbage in the shared dev DB/uploads (globalTeardown.ts).
  globalTeardown: "../e2e/lab-02/globalTeardown.ts",
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
    // one a human uses via the host browser (5173, client/.env's
    // VITE_API_URL="http://localhost:3000"). A browser launched *inside*
    // the client container can't reach the host's port-mapped
    // localhost:3000 the way a real host browser can — nothing listens on
    // that port inside this container — so this instance is started with
    // VITE_API_URL pointed at the `server` service by its Docker Compose
    // name instead, resolvable over the compose network.
    command: "VITE_API_URL=http://server:3000 npm run dev -- --host --port 5174",
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
