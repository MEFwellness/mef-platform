#!/usr/bin/env npx tsx
/**
 * Backfills the shared Signal Library from every completed sitting a
 * member already has.
 *
 * WHY IT EXISTS. Ingestion runs when a sitting completes, and the
 * assessments this library reads have been in production for months, so
 * every member's existing history would otherwise be invisible to it until
 * she happened to sit something again. This walks the SAME adapters, in
 * the same order, through the same engine, so a backfilled sitting and a
 * live one produce byte identical rows. There is no second mapping
 * implementation here and no signal this script can write that ingestion
 * could not.
 *
 * IT IS SAFE TO RUN AS MANY TIMES AS YOU LIKE. Every draft carries a
 * fingerprint naming its source, its sitting and the thing inside it, and
 * migration 240 has a unique index on it, so a second run writes nothing
 * and reports nothing written.
 *
 * OLDEST SITTING FIRST, which the engine handles, so a signal that has
 * settled is only carried across after it was first reported. See
 * ingestAllForMember.
 *
 * REAL MEMBERS ONLY BY DEFAULT. A seeded is_test account is skipped unless
 * --include-test is passed, because the point of the first run is to fill
 * the library for people a coach actually opens. The library itself has no
 * opinion about test accounts: the exclusion a COACH sees is applied at
 * her own read, through lib/staff/testAccounts.ts.
 *
 * Usage:
 *   SIGNALS_SUPABASE_URL=... SIGNALS_SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/backfill-cross-system-signals.ts [memberId] [--include-test] [--dry-run]
 *
 * With no member id it walks every profile. With one it does that member
 * only, whether or not she is a test account.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ingestAllForMember } from '../lib/cross-system-signals/service';
import { SIGNAL_ADAPTER_REGISTRY } from '../lib/cross-system-signals/adapters';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}.`);
    process.exit(1);
  }
  return value;
}

type Profile = { id: string; display_name: string | null; is_test: boolean | null };

async function listMembers(
  supabase: SupabaseClient,
  memberId: string | null,
  includeTest: boolean
): Promise<Profile[]> {
  let query = supabase.from('profiles').select('id, display_name, is_test');
  if (memberId) query = query.eq('id', memberId);
  else if (!includeTest) query = query.or('is_test.is.null,is_test.eq.false');
  const { data, error } = await query;
  if (error) {
    console.error('Could not list members:', error.message);
    process.exit(1);
  }
  return (data ?? []) as Profile[];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const includeTest = args.includes('--include-test');
  const dryRun = args.includes('--dry-run');
  const memberId = args.find((arg) => !arg.startsWith('--')) ?? null;

  const supabase = createClient(
    requiredEnv('SIGNALS_SUPABASE_URL'),
    requiredEnv('SIGNALS_SUPABASE_SERVICE_ROLE_KEY')
  );

  console.log(`Adapters registered: ${[...SIGNAL_ADAPTER_REGISTRY.keys()].join(', ')}`);

  const members = await listMembers(supabase, memberId, includeTest);
  console.log(`Members to walk: ${members.length}${dryRun ? ' (dry run, nothing will be written)' : ''}`);

  let total = 0;
  for (const member of members) {
    const who = `${member.display_name ?? 'unnamed'} (${member.id.slice(0, 8)})`;
    if (dryRun) {
      console.log(`  would walk ${who}`);
      continue;
    }
    const result = await ingestAllForMember({
      memberId: member.id,
      client: supabase,
      onSource: (sourceKey, sittings, written) => {
        if (sittings === 0 && written === 0) return;
        console.log(`  ${who}: ${sourceKey}, ${sittings} sittings, ${written} signals written`);
      },
    });
    total += result.written;
  }

  console.log(`Done. ${total} signal rows written.`);
}

void main();
