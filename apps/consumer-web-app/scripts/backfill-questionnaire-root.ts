#!/usr/bin/env npx tsx
/**
 * Lets Root read every Body Systems Survey a member has already completed.
 *
 * The whole job is lib/cross-system-root/questionnaireBackfill.ts, which
 * runs the same ingestion and the same lookup a live submit runs. This file
 * only builds the connection and prints what happened.
 *
 * SAFE TO RUN TWICE. The second run files no signal and rewrites no
 * finding, and says so ("unchanged").
 *
 * REAL MEMBERS ONLY BY DEFAULT. A seeded is_test account is skipped unless
 * --include-test is passed, or unless it is the one member id named.
 *
 * Usage (keys by FILE PATH, so no key ever reaches a command line):
 *   SIGNALS_SUPABASE_URL=... SIGNALS_SUPABASE_SERVICE_ROLE_KEY_FILE=/path/to/key \
 *     npx tsx scripts/backfill-questionnaire-root.ts [memberId] [--include-test] [--dry-run]
 *
 * SIGNALS_SUPABASE_SERVICE_ROLE_KEY is still accepted for a local run.
 */
import * as fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { backfillQuestionnaireRoot } from '../lib/cross-system-root/questionnaireBackfill';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}.`);
    process.exit(1);
  }
  return value;
}

function serviceKey(): string {
  const file = process.env.SIGNALS_SUPABASE_SERVICE_ROLE_KEY_FILE;
  if (file) return fs.readFileSync(file, 'utf8').trim();
  return requiredEnv('SIGNALS_SUPABASE_SERVICE_ROLE_KEY');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const includeTest = args.includes('--include-test');
  const dryRun = args.includes('--dry-run');
  const memberId = args.find((arg) => !arg.startsWith('--')) ?? null;

  const supabase = createClient(requiredEnv('SIGNALS_SUPABASE_URL'), serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await backfillQuestionnaireRoot({
    client: supabase,
    memberId,
    includeTest,
    dryRun,
    onMember: (member) => {
      const who = `${member.memberId.slice(0, 8)}${member.isTest ? ' (test account)' : ''}`;
      if (member.skippedAsTest) {
        console.log(`  ${who}: skipped, test account (pass --include-test to walk it)`);
        return;
      }
      if (!member.lookup) {
        console.log(`  ${who}: would walk ${member.sittingIds.length} completed sittings`);
        return;
      }
      const lookup = member.lookup;
      const state = lookup.skipped
        ? `lookup skipped (${lookup.skipped})`
        : lookup.unchanged
          ? `unchanged, ${lookup.findings} findings already stored`
          : `${lookup.findings} findings stored`;
      console.log(
        `  ${who}: ${member.sittingIds.length} sittings, ${member.signalsWritten} signals filed, ` +
          `${lookup.activeSignals} active answers on the newest sitting, ${state}`
      );
    },
  });

  console.log(
    `Done${dryRun ? ' (dry run, nothing written)' : ''}. ${result.sittingsRead} completed sittings read, ` +
      `${result.members.length} members, ${result.signalsWritten} signals filed, ` +
      `${result.findingsWritten} findings written, ${result.membersUnchanged} members unchanged.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
