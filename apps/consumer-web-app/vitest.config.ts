import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
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
