import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    reporters: process.env.CI ? "default" : ["default"],
    testTimeout: 10000,
  },
});
