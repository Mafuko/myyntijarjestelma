import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Integration tests share one real Postgres test DB and reset it via
    // TRUNCATE...CASCADE in beforeEach. Running test files in parallel (the
    // default) lets one file's reset truncate rows another file's test just
    // created, causing intermittent failures. Force sequential file
    // execution so DB-backed tests can't race each other.
    fileParallelism: false,
  },
})
