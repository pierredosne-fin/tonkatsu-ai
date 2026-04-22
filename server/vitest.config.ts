import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    // Generous timeouts for integration + Socket.IO tests
    testTimeout: 15000,
    hookTimeout: 15000,
    // Run each test file in a separate worker thread so module-level state
    // (agent Map, room Map) is fresh per file.
    // Note: 'forks' (child_process) breaks on Node >=25 with vitest 2.x due
    // to a serialisation incompatibility; 'threads' is the safe alternative.
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },
});
