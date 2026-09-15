import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests sync real Postgres schemas; the first connection can take a few seconds.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
