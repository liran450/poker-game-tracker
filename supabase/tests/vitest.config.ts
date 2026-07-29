import { defineConfig } from 'vitest/config';

// A separate config from the app's root vitest.config.ts on purpose: these tests need a real
// local Postgres (supabase/tests/support/globalSetup.ts rebuilds poker_rls_test from the
// migrations before anything runs), so they run under their own `npm run test:db` — never
// folded into `npm run verify`/`npm test`, which stay usable with no database at all. See
// CLAUDE.md's Commands table.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['supabase/tests/**/*.test.ts'],
    globalSetup: ['./supabase/tests/support/globalSetup.ts'],
    setupFiles: ['./supabase/tests/support/setupFile.ts'],
    // The suite relies on transaction-per-test isolation (withTransaction rolls back), not
    // shared fixture state, so file-level parallelism is safe — but keep it off for now since
    // a handful of tests deliberately toggle RLS at the table level mid-transaction and a
    // concurrent worker reading pg_class for the same table could observe that momentarily.
    fileParallelism: false,
  },
});
