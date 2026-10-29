import { defineConfig } from 'vitest/config';

// Inline rules-unit-testing so it shares the test's ESM copy of firebase/compat.
export default defineConfig({
  test: { dir: 'tests', server: { deps: { inline: ['@firebase/rules-unit-testing'] } }, testTimeout: 20000, fileParallelism: false },
});
