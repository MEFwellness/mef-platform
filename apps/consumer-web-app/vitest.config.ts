import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // Components in this app are written for React's automatic JSX runtime
  // (Next.js's default), so none of them import React by name. esbuild's
  // own default here is the classic runtime, which compiles their JSX into
  // `React.createElement` calls and makes every one of them throw
  // "React is not defined" the moment a test imports it. That is why this
  // suite had no component tests at all until now, and why the honesty
  // guards in tests/display-guards-headings-and-windows.test.ts can assert
  // a heading is really absent from rendered HTML instead of grepping the
  // source for it.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    // .tsx included so a test can render a real component and assert on
    // its real HTML. See the esbuild note above.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    testTimeout: 20000,
    setupFiles: ['./tests/setup/test-clients.ts'],
    // Integration test files share real, mutable fixtures (the seeded
    // members in supabase/seed/02_users.sql) against one local Supabase
    // instance — several files' own afterAll hooks wipe rows for those
    // same member ids without scoping by which file created them. Running
    // test files in parallel workers made that a real race (one file's
    // cleanup deleting another's in-flight safety_classifications row,
    // surfaced by adding tests/conversation-coach-integration.test.ts).
    // Sequential file execution is the correct fix for a DB-backed
    // integration suite like this one, not a workaround.
    fileParallelism: false,
  },
});
