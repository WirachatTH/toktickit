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
  },
});
