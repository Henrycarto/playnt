import { defineConfig } from 'vitest/config';

export default defineConfig({
  // dist holds compiled copies of the tests after a full build; run the sources only.
  test: { testTimeout: 30_000, hookTimeout: 180_000, fileParallelism: false, exclude: ['**/node_modules/**', 'dist/**'] },
});
