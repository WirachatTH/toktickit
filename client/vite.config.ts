import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
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
