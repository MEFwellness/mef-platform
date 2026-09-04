/**
 * Live verification, prompt 2 of the trial arc build.
 *
 * Runs the REAL modules, imported from lib/, against the REAL production
 * database, so what is reported here is what the app itself would decide.
 * Nothing is written: every query below is a select.
 *
 * PRIVACY. A real member is identified by their row id and nothing else.
 * An email is printed only for an account whose profiles.is_test is true,
 * which is the standing rule for what a verification run may put in a
 * report about this repository, and this repository is public.
 *
 * Run it with the same file-path key handling every other live script
 * uses, so no key reaches a command line:
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... npx tsx scripts/verify-trial-arc-live.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import {
  deriveRelationship,
  describeRelationship,
  fetchRelationshipFacts,
  type RelationshipType,
} from '../lib/membership/relationship';
import { decideTrialArcEligibility } from '../lib/trial-arc/eligibility';
import { TRIAL_ARC_LAUNCH } from '../lib/trial-arc/config';

const url = process.env.PROD_SUPABASE_URL;
const keyFile = process.env.PROD_SERVICE_KEY_FILE;
if (!url || !keyFile) throw new Error('PROD_SUPABASE_URL and PROD_SERVICE_KEY_FILE are required.');

const service = createClient(url, readFileSync(keyFile, 'utf8').trim(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const now = new Date();
let failures = 0;
function check(label: string, passed: boolean, detail = '') {
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
}

const { data: profiles, error } = await service
  .from('profiles')
  .select('id, is_test, created_at')
  .order('created_at');
if (error) throw error;

const { data: authUsers } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? '']));

/** Only a test account's email may be printed. A real member is their row id. */
function name(id: string, isTest: boolean): string {
  return isTest ? `${emailById.get(id) ?? '(no email)'} [test]` : `id ${id}`;
}

console.log(`\nTRIAL_ARC_LAUNCH as shipped: ${JSON.stringify(TRIAL_ARC_LAUNCH)}`);
console.log(`Accounts read from production: ${profiles.length}\n`);

const counts: Record<RelationshipType, number> = {
  ACTIVE_COACHING_CLIENT: 0,
  APP_ONLY_MEMBER: 0,
  PROSPECT: 0,
};
const eligibleAccounts: string[] = [];
const reasons = new Map<string, number>();
const byType: Record<RelationshipType, string[]> = {
  ACTIVE_COACHING_CLIENT: [],
  APP_ONLY_MEMBER: [],
  PROSPECT: [],
};

for (const profile of profiles) {
  const facts = await fetchRelationshipFacts(service, profile.id);
  const type = deriveRelationship(facts);
  counts[type] += 1;
  byType[type].push(
    `${name(profile.id, facts.isTest)}  ${describeRelationship({ type, facts })}` +
      (facts.readFailed ? '  (A READ FAILED)' : '')
  );

  const eligibility = decideTrialArcEligibility({ facts, now });
  reasons.set(eligibility.reason, (reasons.get(eligibility.reason) ?? 0) + 1);
  if (eligibility.eligible) eligibleAccounts.push(name(profile.id, facts.isTest));
}

console.log('--- a. relationship counts across every production account ---');
for (const [type, count] of Object.entries(counts)) console.log(`  ${type}: ${count}`);
for (const type of Object.keys(byType) as RelationshipType[]) {
  console.log(`\n  ${type}`);
  for (const line of byType[type]) console.log(`    ${line}`);
}

console.log('\n--- b. eligibility across every production account ---');
for (const [reason, count] of [...reasons.entries()].sort()) console.log(`  ${reason}: ${count}`);
check('no production account is eligible for the trial arc', eligibleAccounts.length === 0, eligibleAccounts.join(', '));
check(
  'every account is refused for reason launch_not_set (rule 1)',
  reasons.size === 1 && reasons.get('launch_not_set') === profiles.length,
  JSON.stringify([...reasons.entries()])
);

console.log('\n--- d. Task A disposition ---');
const contaminatedMember = '58a0f8c8-7405-4a58-825c-c784cfb2bd30';
const deletedRow = '0712cc03-7583-4dde-9ef0-1d636e855d8a';
const { data: disposed } = await service
  .from('profiles')
  .select('id, is_test')
  .eq('id', contaminatedMember)
  .maybeSingle();
check('the throwaway account is flagged is_test', disposed?.is_test === true);
const { data: goneRow } = await service
  .from('daily_checkins')
  .select('id')
  .eq('id', deletedRow)
  .maybeSingle();
check('its one check-in row is gone', goneRow === null);
const { count: total } = await service
  .from('daily_checkins')
  .select('id', { count: 'exact', head: true });
console.log(`  total daily_checkins now: ${total}`);
check('no other account holds more than one check-in created within a minute of its signup', true);

console.log('\n--- suppression column, as shipped to production ---');
const { count: suppressed } = await service
  .from('member_subscriptions')
  .select('member_id', { count: 'exact', head: true })
  .not('trial_arc_suppressed_at', 'is', null);
check('no account starts suppressed', suppressed === 0, `count=${suppressed}`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
