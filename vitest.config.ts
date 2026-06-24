import { defineConfig } from 'vitest/config';

// Plain Vitest config (formerly @saas-maker/test-config/vitest factory).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.wrangler'],
    pool: 'forks',
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/index.ts',
        'node_modules',
        'dist',
        '.next',
        '.wrangler',
        'web3d/**',
      ],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
