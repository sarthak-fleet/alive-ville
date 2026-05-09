import { defineVitestConfig } from "@saas-maker/test-config/vitest";

export default defineVitestConfig({
  include: ["tests/**/*.test.ts"],
  environment: "node",
  test: {
    pool: "forks",
    reporters: process.env.CI ? "default" : ["default"],
    testTimeout: 10000,
  },
});
