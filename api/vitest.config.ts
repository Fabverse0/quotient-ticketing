import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Each test file starts its own Postgres container; more at once than this
    // overloaded Docker Desktop until container starts timed out.
    maxWorkers: 4,
    globalSetup: ["tests/helpers/global-setup.ts"],
  },
});
