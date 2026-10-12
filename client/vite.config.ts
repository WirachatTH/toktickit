import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Lab 3 D-11 — the browser talks only to this dev server; /api is proxied
    // to the API, so the session cookie is first-party everywhere. The page's
    // own Origin header is forwarded unchanged (only Host is rewritten).
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
    // Includes .test.ts too, not just .test.tsx — a non-JSX test file
    // (e.g. testing a pure function) would otherwise be silently skipped
    // rather than failed (review finding, message.txt).
    include: ["tests/**/*.test.{ts,tsx}"],
    // Lab 4, Issue 7 — the tests that render the whole app and type into it
    // take 2 to 5 s when every file runs at once on a many-core machine, which
    // left no margin under the 5 s default (PR #80 review). No assertion waits
    // this long: a missing element still fails at its own 1 to 5 s wait.
    testTimeout: 15000,
  },
});
