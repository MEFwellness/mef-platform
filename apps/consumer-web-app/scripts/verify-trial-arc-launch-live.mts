/**
 * THE LAUNCH: THE PRE-FLIP SAFETY PROOF, AND THE POST-FLIP CHECK.
 *
 * Prompt 7 of the trial arc build. Run TWICE, and it says something
 * different each time on purpose.
 *
 *   BEFORE THE DEPLOY, with the launch date staged locally, it is the
 *   safety proof the brief asks for: every account that exists in
 *   production today is refused, and the reason for each one is printed. If
 *   a single existing account came back eligible, the run fails and the
 *   deploy does not happen.
 *
 *   AFTER THE DEPLOY it is the same proof, and it still has to pass. The
 *   accounts it covers are the ones that existed before the launch instant,
 *   and rule 1 keeps refusing them forever. The post-launch reference rig
 *   created afterwards is expected to be eligible, and is reported
 *   separately rather than being counted as a failure.
 *
 * IT WRITES NOTHING. Not a row, not a flag. Eligibility is a derivation
 * over rows that already exist, and this script only asks it questions.
 *
 * PRIVACY. A real member is identified by their row id and nothing else. An
 * email is printed only for an account whose profiles.is_test is true. This
 * repository is public.
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... \
 *   npx tsx scripts/verify-trial-arc-launch-live.mts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { TRIAL_ARC_LAUNCH, trialArcLaunchInstant } from '../lib/trial-arc/config';
import { decideTrialArcEligibility, resolveTrialArcEligibility } from '../lib/trial-arc/eligibility';
import { fetchRelationshipFacts } from '../lib/membership/relationship';
import { resolveTrialArcDecision } from '../lib/trial-arc/engine';

const url = process.env.PROD_SUPABASE_URL;
const keyFile = process.env.PROD_SERVICE_KEY_FILE;
if (!url || !keyFile) throw new Error('PROD_SUPABASE_URL and PROD_SERVICE_KEY_FILE are required.');

const service = createClient(url, readFileSync(keyFile, 'utf8').trim(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
function check(label: string, passed: boolean, detail = '') {
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

const now = new Date();
const launch = trialArcLaunchInstant();

console.log('== The launch constant, as this checkout ships it ==');
console.log(`      TRIAL_ARC_LAUNCH = ${JSON.stringify(TRIAL_ARC_LAUNCH)}`);
console.log(`      parsed           = ${launch ? launch.toISOString() : 'null'}`);
console.log(`      now              = ${now.toISOString()}`);
check('the launch date is set and parseable', launch !== null, String(TRIAL_ARC_LAUNCH));
if (launch === null) {
  console.log('\nThe arc is launched for no one. Nothing below can be proved. Stopping.');
  process.exit(1);
}

// ---------------------------------------------------------------------
// 1. Every account that exists in production, one at a time.
// ---------------------------------------------------------------------
console.log('\n== Every account in production, against the staged launch ==');

const { data: profiles, error } = await service
  .from('profiles')
  .select('id, is_test, created_at')
  .order('created_at');
if (error) throw error;

const { data: authUsers } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? '']));
const label = (id: string, isTest: boolean) =>
  isTest ? `${emailById.get(id) ?? '(no email)'} [test]` : `id ${id}`;

/** Accounts created on or after the launch: these are the arc's own, and are reported apart. */
const preLaunch = profiles.filter((p) => new Date(p.created_at as string).getTime() < launch.getTime());
const postLaunch = profiles.filter((p) => new Date(p.created_at as string).getTime() >= launch.getTime());

console.log(`      ${profiles.length} accounts: ${preLaunch.length} created before the launch, ${postLaunch.length} on or after.\n`);

const reasons = new Map<string, number>();
const wronglyEligible: string[] = [];
const notPredating: string[] = [];

for (const profile of preLaunch) {
  const facts = await fetchRelationshipFacts(service, profile.id);
  // The list override is deliberately NOT passed: this asks the question the
  // deployed server asks, with the server's own environment. The rig is
  // named in Vercel, not here, so it answers by the ordinary rules.
  const eligibility = decideTrialArcEligibility({ facts, now, testAccounts: '' });
  reasons.set(eligibility.reason, (reasons.get(eligibility.reason) ?? 0) + 1);
  if (eligibility.eligible) wronglyEligible.push(label(profile.id, Boolean(profile.is_test)));
  if (eligibility.reason !== 'account_predates_launch') notPredating.push(`${label(profile.id, Boolean(profile.is_test))} -> ${eligibility.reason}`);
  console.log(
    `      ${eligibility.eligible ? 'ELIGIBLE' : 'refused '}  ${eligibility.reason.padEnd(24)} ${label(profile.id, Boolean(profile.is_test))}`
  );
}

console.log('\n      reasons: ' + [...reasons.entries()].map(([r, n]) => `${r}=${n}`).join(' '));

check(
  'NOT ONE account that existed before the launch is eligible',
  wronglyEligible.length === 0,
  wronglyEligible.join(', ')
);
check(
  'and every one of them is refused by rule 1, its own signup date, before any other rule is even reached',
  notPredating.length === 0,
  notPredating.join('; ')
);
check(
  "so the reason string is 'account_predates_launch' for all of them",
  reasons.size === 1 && reasons.get('account_predates_launch') === preLaunch.length,
  `${reasons.get('account_predates_launch') ?? 0}/${preLaunch.length}`
);

// The explanation sentence itself, since an administrator will read it.
const sample = decideTrialArcEligibility({
  facts: await fetchRelationshipFacts(service, preLaunch[0].id),
  now,
  testAccounts: '',
});
check(
  'the sentence it hands an administrator names the reason plainly',
  sample.explanation === 'This account was created before the trial arc launched.',
  sample.explanation
);

// ---------------------------------------------------------------------
// 2. And nothing speaks. The engine, not just the eligibility rule.
// ---------------------------------------------------------------------
console.log('\n== The engine, over the same accounts ==');
let spoke = 0;
const engineReasons = new Map<string, number>();
for (const profile of preLaunch) {
  const decision = await resolveTrialArcDecision(service, profile.id, { now });
  if (decision.message) {
    spoke += 1;
    console.log(`      SPOKE  ${label(profile.id, Boolean(profile.is_test))}`);
  }
  const reason = decision.reason ?? 'spoke';
  engineReasons.set(reason, (engineReasons.get(reason) ?? 0) + 1);
}
console.log('      reasons: ' + [...engineReasons.entries()].map(([r, n]) => `${r}=${n}`).join(' '));
check('no pre-launch account has a trial arc message today', spoke === 0, `${spoke} would speak`);

// ---------------------------------------------------------------------
// 3. The other half: a hypothetical account created after the launch DOES
//    qualify. Without this the proof above could equally be describing an
//    arc that is simply broken.
// ---------------------------------------------------------------------
console.log('\n== The hypothetical post-launch signup ==');

const afterLaunch = new Date(launch.getTime() + 60_000).toISOString();
const hypothetical = {
  memberId: '00000000-0000-4000-8000-000000000001',
  activeCoachAssignment: false,
  everCoachAssigned: false,
  coachAssignmentStatuses: [] as string[],
  hasSubscription: true,
  tier: 'trial' as const,
  source: 'system' as const,
  status: 'active' as const,
  fullAccess: false,
  isTest: false,
  accountCreatedAt: afterLaunch,
  trialArcSuppressedAt: null,
  readFailed: false,
};

const wouldQualify = decideTrialArcEligibility({
  facts: hypothetical,
  now: new Date(launch.getTime() + 120_000),
  testAccounts: '',
});
check('an ordinary signup one minute after the launch IS eligible', wouldQualify.eligible, wouldQualify.reason);

const oneSecondBefore = decideTrialArcEligibility({
  facts: { ...hypothetical, accountCreatedAt: new Date(launch.getTime() - 1000).toISOString() },
  now: new Date(launch.getTime() + 120_000),
  testAccounts: '',
});
check(
  'the identical account created one second BEFORE the launch is refused',
  !oneSecondBefore.eligible && oneSecondBefore.reason === 'account_predates_launch',
  oneSecondBefore.reason
);

const atTheInstant = decideTrialArcEligibility({
  facts: { ...hypothetical, accountCreatedAt: launch.toISOString() },
  now: new Date(launch.getTime() + 120_000),
  testAccounts: '',
});
check('and one created in the launch instant itself is in, because the rule is "on or after"', atTheInstant.eligible, atTheInstant.reason);

// The three exclusions the arc is built around, each on a post-launch account.
for (const [name, patch, expected] of [
  ['a coached account', { activeCoachAssignment: true, everCoachAssigned: true, coachAssignmentStatuses: ['active'] }, 'ever_coach_assigned'],
  ['an account whose coach assignment was revoked years ago', { everCoachAssigned: true, coachAssignmentStatuses: ['revoked'] }, 'ever_coach_assigned'],
  ['a paying app member', { tier: 'monthly' as const }, 'not_on_trial'],
  ['a hand-assigned trial', { source: 'manual' as const }, 'trial_not_automatic'],
  ['a suppressed account', { trialArcSuppressedAt: '2026-09-05T17:00:00Z' }, 'suppressed'],
  ['a seeded test account', { isTest: true }, 'test_account'],
  ['an account whose facts could not be read', { readFailed: true }, 'facts_unavailable'],
] as const) {
  const result = decideTrialArcEligibility({
    facts: { ...hypothetical, ...(patch as object) },
    now: new Date(launch.getTime() + 120_000),
    testAccounts: '',
  });
  check(`post-launch, ${name} is still refused`, !result.eligible && result.reason === expected, result.reason);
}

// ---------------------------------------------------------------------
// 4. Accounts created after the launch, if any exist yet. Reported, never
//    counted as a failure: after the deploy the reference rig lives here.
// ---------------------------------------------------------------------
if (postLaunch.length > 0) {
  console.log('\n== Accounts created ON OR AFTER the launch (the arc\'s own) ==');
  for (const profile of postLaunch) {
    const eligibility = await resolveTrialArcEligibility(service, profile.id, { now, testAccounts: '' });
    console.log(
      `      ${eligibility.eligible ? 'ELIGIBLE' : 'refused '}  ${eligibility.reason.padEnd(24)} ${label(profile.id, Boolean(profile.is_test))}  created ${profile.created_at}`
    );
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
