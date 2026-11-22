import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 240_000,
    include: ['test/**/*.test.ts'],
  },
});
