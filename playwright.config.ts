import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // All e2e specs share one Postgres test database, and each test's
  // beforeEach calls resetDb(), which TRUNCATEs the shared tables. Running
  // spec files in parallel workers (Playwright's default) lets one file's
  // TRUNCATE fire mid-test in another file's worker, corrupting or wiping
  // data an in-flight test still depends on — this surfaced as a unique
  // constraint collision between two files' same-named fixture users
  // created milliseconds apart. Forcing a single worker serializes every
  // test against the shared database.
  workers: 1,
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
    },
  },
  use: { baseURL: 'http://localhost:3000' },
})
