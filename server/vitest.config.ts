import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // These tests hit one real, shared Postgres database with no per-test
    // transaction/sandbox isolation (see tests/lab-01 and tests/lab-02).
    // Vitest's default file parallelism would let e.g. categories.test.ts
    // and data-model.test.ts run concurrently against that same database,
    // so a transient row from one file's constraint test can flake an
    // unrelated count assertion in another file. Run files sequentially.
    fileParallelism: false,
  },
});
