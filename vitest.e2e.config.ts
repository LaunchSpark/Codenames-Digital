import { defineConfig } from 'vitest/config'

// End-to-end checks: the real server plus headless Chromium phones. Run with `npm run e2e`.
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
