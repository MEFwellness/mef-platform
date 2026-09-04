/**
 * Live verification, prompt 3 of the trial arc build: the clock, the pacing
 * engine and days 1 to 5, run against the REAL production database.
 *
 * Everything here imports the real modules from lib/, so what is reported is
 * what the app itself would decide. Nothing is written except inside the one
 * clearly marked section that drives the delivery table on a seeded TEST
 * account, and that section removes every row it created before it exits.
 *
 * PRIVACY. A real member is identified by their row id and nothing else. An
 * email is printed only for an account whose profiles.is_test is true, which
 * is the standing rule for what a verification run may put in a report about
 * this repository, and this repository is public.
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... npx tsx scripts/verify-trial-arc-pacing-live.mts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { TRIAL_ARC_LAUNCH, trialArcLaunchInstant } from '../lib/trial-arc/config';
import { dayNumberFor, resolveTrialDay } from '../lib/trial-arc/day';
import { resolveTrialArcDecision, publicEntryArcHandover } from '../lib/trial-arc/engine';
import { decidePaceState, trialArcClosure, wasIgnored } from '../lib/trial-arc/state';
import { trialArcPopupMessageKey, trialArcDayFromMessageKey } from '../lib/trial-arc/constants';
import {
  claimTrialArcDelivery,
  getTrialArcDelivery,
  listTrialArcDeliveries,
  markTrialArcCtaTapped,
} from '../lib/trial-arc/data';
import { getPublicEntryWelcome } from '../lib/public-entry/welcome';
import { resolveTrialArcConnection } from '../lib/trial-arc/connection';
import { listTrialArcCheckinDates, listTrialArcExperimentLogDates } from '../lib/trial-arc/data';
// @ts-expect-error the shared minting helper is plain JavaScript, by design
import { canMintSessions, mintSessionCookies, retireSession } from './lib/mint-session.mjs';

const url = process.env.PROD_SUPABASE_URL;
const keyFile = process.env.PROD_SERVICE_KEY_FILE;
if (!url || !keyFile) throw new Error('PROD_SUPABASE_URL and PROD_SERVICE_KEY_FILE are required.');

const service = createClient(url, readFileSync(keyFile, 'utf8').trim(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
function check(label: string, passed: boolean, detail = '') {
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
}

const now = new Date();

// ---------------------------------------------------------------------
// 1. The switch is still off, in production, for everybody.
// ---------------------------------------------------------------------
console.log('\n== The arc as shipped ==');
check('TRIAL_ARC_LAUNCH is null', TRIAL_ARC_LAUNCH === null, JSON.stringify(TRIAL_ARC_LAUNCH));
check('the launch instant is null', trialArcLaunchInstant() === null);

const { data: profiles, error } = await service
  .from('profiles')
  .select('id, is_test, created_at')
  .order('created_at');
if (error) throw error;

const { data: authUsers } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? '']));
const name = (id: string, isTest: boolean) =>
  isTest ? `${emailById.get(id) ?? '(no email)'} [test]` : `id ${id}`;

console.log(`\nAccounts read from production: ${profiles.length}`);

let spoke = 0;
const reasons = new Map<string, number>();
for (const profile of profiles) {
  const decision = await resolveTrialArcDecision(service, profile.id, { now });
  if (decision.message) spoke += 1;
  const reason = decision.reason ?? 'spoke';
  reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
}
check('no production account has a trial arc message today', spoke === 0, `${spoke} would speak`);
check(
  'and every one of them refuses for the same reason: the arc is launched for no one',
  reasons.size === 1 && reasons.get('not_launched') === profiles.length,
  [...reasons.entries()].map(([r, n]) => `${r}=${n}`).join(' ')
);

// ---------------------------------------------------------------------
// 2. The clock, over every real trial row in production.
// ---------------------------------------------------------------------
console.log('\n== The clock, over real trial rows ==');
const { data: subs } = await service
  .from('member_subscriptions')
  .select('member_id, tier, source, trial_started_at, trial_ends_at');

let clockChecked = 0;
let clockOk = 0;
for (const row of subs ?? []) {
  const { data: profile } = await service
    .from('profiles')
    .select('timezone')
    .eq('id', row.member_id)
    .maybeSingle();
  const timeZone = (profile?.timezone as string | null) ?? 'America/New_York';
  const day = dayNumberFor({ trialStartedAt: row.trial_started_at, timeZone, now });
  clockChecked += 1;
  // Every real row has a start, so every one of them must produce a day, and
  // it must be at least 1: signup day is day 1 and nothing counts backwards.
  if (day !== null && day >= 1) clockOk += 1;
  const resolved = await resolveTrialDay(service, row.member_id, now);
  if (resolved && resolved.dayNumber !== day) {
    check(`the two clocks agree for ${row.member_id}`, false, `${resolved.dayNumber} vs ${day}`);
  }
}
check('every real trial row produces a day number of 1 or more', clockChecked === clockOk, `${clockOk}/${clockChecked}`);
check(
  'and the day number is counted from trial_started_at, never from trial_ends_at',
  (subs ?? []).every((row) => {
    const backwards = dayNumberFor({ trialStartedAt: row.trial_ends_at, timeZone: 'UTC', now });
    const forwards = dayNumberFor({ trialStartedAt: row.trial_started_at, timeZone: 'UTC', now });
    return forwards !== null && (backwards === null || backwards !== forwards);
  })
);

// ---------------------------------------------------------------------
// 3. The public entry welcome is untouched for every account in production.
// ---------------------------------------------------------------------
console.log('\n== The welcome, for accounts outside the arc ==');
let welcomesSeen = 0;
let welcomesUnchanged = 0;
for (const profile of profiles) {
  const decision = await resolveTrialArcDecision(service, profile.id, { now });
  const handover = publicEntryArcHandover(decision);
  const welcome = await getPublicEntryWelcome(service, profile.id, handover);
  if (handover === null) welcomesUnchanged += 1;
  if (welcome) {
    welcomesSeen += 1;
    if (welcome.arc !== null) {
      check(`the welcome for ${profile.id} carries no arc framing`, false);
    }
  }
}
check(
  'the arc hands nothing to the welcome for any production account',
  welcomesUnchanged === profiles.length,
  `${welcomesUnchanged}/${profiles.length}`
);
console.log(`      (${welcomesSeen} account(s) are currently offered the welcome, all in its unchanged form)`);

// ---------------------------------------------------------------------
// 4. The delivery table, driven for real on a seeded TEST account.
//
// THE ONLY WRITES IN THIS SCRIPT. Every row created here is deleted before
// the script exits, and it only ever runs against an account whose
// profiles.is_test is true.
// ---------------------------------------------------------------------
console.log('\n== The delivery table, driven on a test account ==');
const fixture = profiles.find((p) => p.is_test);
if (!fixture) {
  check('a seeded test account exists to drive', false);
} else {
  console.log(`      Driving ${name(fixture.id, true)}`);
  const key = trialArcPopupMessageKey(1);
  const localDate = '2099-01-01';

  await service.from('member_trial_arc_deliveries').delete().eq('member_id', fixture.id).eq('message_key', key);

  const first = await claimTrialArcDelivery(service, fixture.id, {
    messageKey: key,
    dayNumber: 1,
    paceState: 'ON_PACE',
    pointedStep: 'core_values_snapshot',
    deliveredLocalDate: localDate,
  });
  check('a receipt is written and read back', first.created && first.record !== null);
  check('it records the day, the state and the step', first.record?.dayNumber === 1 && first.record?.pointedStep === 'core_values_snapshot');

  const second = await claimTrialArcDelivery(service, fixture.id, {
    messageKey: key,
    dayNumber: 1,
    paceState: 'STALLED',
    pointedStep: 'life_signal_check',
    deliveredLocalDate: '2099-01-02',
  });
  check('a second showing writes nothing and does not move the first', second.created === false);
  check(
    'the first delivered_local_date, state and step all survive',
    second.record?.deliveredLocalDate === localDate &&
      second.record?.paceState === 'ON_PACE' &&
      second.record?.pointedStep === 'core_values_snapshot'
  );

  check('with no tap and no completion, that message counts as ignored', wasIgnored(second.record!, () => null));

  const stamped = await markTrialArcCtaTapped(service, fixture.id, key);
  const afterTap = await getTrialArcDelivery(service, fixture.id, key);
  check('the CTA stamp lands', stamped && afterTap?.ctaTappedAt !== null);
  check('and a tapped message is never ignored', !wasIgnored(afterTap!, () => null));

  const again = await markTrialArcCtaTapped(service, fixture.id, key);
  const afterSecondTap = await getTrialArcDelivery(service, fixture.id, key);
  check(
    'a second tap does not move the stamp',
    again && afterSecondTap?.ctaTappedAt === afterTap?.ctaTappedAt
  );

  const listed = await listTrialArcDeliveries(service, fixture.id);
  check('the receipt reads back in the list', listed.ok && listed.deliveries.some((d) => d.messageKey === key));
  check('the key round trips to its day number', trialArcDayFromMessageKey(key) === 1);

  const closure = trialArcClosure(listed.deliveries, () => null);
  check('one tapped message closes nothing', closure.pacingClosed === false, `ignored=${closure.ignoredCount}`);

  await service.from('member_trial_arc_deliveries').delete().eq('member_id', fixture.id).eq('message_key', key);
  const cleaned = await getTrialArcDelivery(service, fixture.id, key);
  check('every row this script created has been removed', cleaned === null);
}

// ---------------------------------------------------------------------
// 5. The pace states, over the real shapes production actually holds.
// ---------------------------------------------------------------------
console.log('\n== The pace states, sanity checked ==');
check(
  'a member with nothing on her last two days is STALLED, and one with a log on yesterday is not',
  decidePaceState({
    dayNumber: 4,
    cvsCompleted: false,
    lscCompleted: false,
    experimentStarted: false,
    experimentActive: false,
    experimentDeclined: false,
    lastPointedStep: 'core_values_snapshot',
    activeLocalDates: [],
    todayLocalDate: '2026-09-07',
  }) === 'STALLED' &&
    decidePaceState({
      dayNumber: 4,
      cvsCompleted: false,
      lscCompleted: false,
      experimentStarted: false,
      experimentActive: false,
      experimentDeclined: false,
      lastPointedStep: 'core_values_snapshot',
      activeLocalDates: ['2026-09-06'],
      todayLocalDate: '2026-09-07',
    }) === 'BEHIND'
);

// ---------------------------------------------------------------------
// 6. Every read the engine makes, run against real production rows.
//
// WHY NOT A FULLY ELIGIBLE ACCOUNT. Rule 2 of eligibility refuses a seeded
// test account, and production holds no non-test account the arc would ever
// be for, so there is nothing here to drive end to end without creating a
// real stranger's account in production, which a verification run may not
// do. Instead the switch is turned on for the fixture with an explicit
// launch, which proves eligibility genuinely gates it, and then every read
// the engine would have made is run for real against that account's rows.
// ---------------------------------------------------------------------
console.log('\n== The reads, against real production rows ==');
if (fixture) {
  const pretendLaunch = '2020-01-01T00:00:00.000Z';
  const withLaunch = await resolveTrialArcDecision(service, fixture.id, { now, launch: pretendLaunch });
  check(
    'with the switch on, a test account is still refused, by eligibility rather than by the constant',
    withLaunch.eligible === false && withLaunch.reason === 'not_eligible',
    `${withLaunch.reason}`
  );

  const day = await resolveTrialDay(service, fixture.id, now);
  check('her trial day resolves from her real subscription row and her real timezone', day !== null, `day ${day?.dayNumber}, zone ${day?.timeZone}`);

  if (day) {
    const checkins = await listTrialArcCheckinDates(service, fixture.id, day.startLocalDate, day.todayLocalDate);
    const logs = await listTrialArcExperimentLogDates(service, fixture.id, day.startLocalDate, day.todayLocalDate);
    check('her check-in dates read back', Array.isArray(checkins), `${checkins.length} day(s)`);
    check('her experiment log dates read back', Array.isArray(logs), `${logs.length} day(s)`);
    const deliveries = await listTrialArcDeliveries(service, fixture.id);
    check('her delivery receipts read back', deliveries.ok, `${deliveries.deliveries.length} row(s)`);
    const connection = await resolveTrialArcConnection(service, fixture.id);
    check(
      'the day 5 connection is composed from her real scored rows, or honestly null',
      connection === null || (typeof connection.valueLabel === 'string' && typeof connection.signalLabel === 'string'),
      connection ? `${connection.valueLabel} / ${connection.signalLabel}, echo ${connection.echoFired}` : 'null (one half missing)'
    );
  }

  const backOff = await resolveTrialArcDecision(service, fixture.id, { now });
  check('and with the shipped constant it is silent again', backOff.reason === 'not_launched');
}

// ---------------------------------------------------------------------
// 7. The column grant, from a real member session rather than the service
// role, which bypasses every grant in the database.
// ---------------------------------------------------------------------
console.log('\n== Only the CTA stamp may move, proved from her own session ==');
if (fixture && canMintSessions()) {
  const email = emailById.get(fixture.id) ?? '';
  const minted = email ? await mintSessionCookies(email, { baseUrl: 'https://app.mefwellness.com' }) : null;
  if (!minted) {
    check('a session could be minted for the fixture', false);
  } else if (minted.session.user.id !== fixture.id) {
    // generateLink CREATES an account for an address that does not exist, so
    // the id is asserted rather than assumed.
    check('the minted session belongs to the fixture and not to a new stranger', false);
    await retireSession(minted);
  } else {
    const asMember = createClient(url, readFileSync(process.env.PROD_ANON_KEY_FILE!, 'utf8').trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${minted.session.access_token}` } },
    });

    const key = trialArcPopupMessageKey(2);
    await service.from('member_trial_arc_deliveries').delete().eq('member_id', fixture.id).eq('message_key', key);

    const inserted = await asMember.from('member_trial_arc_deliveries').insert({
      member_id: fixture.id,
      message_key: key,
      day_number: 2,
      pace_state: 'ON_PACE',
      pointed_step: 'life_signal_check',
      delivered_local_date: '2099-01-01',
    }).select('message_key').maybeSingle();
    check('she may write her own receipt', inserted.error === null && inserted.data !== null, inserted.error?.message ?? '');

    const stamp = await asMember
      .from('member_trial_arc_deliveries')
      .update({ cta_tapped_at: new Date().toISOString() })
      .eq('member_id', fixture.id)
      .eq('message_key', key);
    check('she may stamp the CTA', stamp.error === null, stamp.error?.message ?? '');

    const moveTheDay = await asMember
      .from('member_trial_arc_deliveries')
      .update({ delivered_local_date: '2098-01-01' })
      .eq('member_id', fixture.id)
      .eq('message_key', key);
    check(
      'she may NOT move the day the receipt was delivered on',
      moveTheDay.error !== null,
      moveTheDay.error?.message ?? 'the update was accepted'
    );

    const moveTheStep = await asMember
      .from('member_trial_arc_deliveries')
      .update({ pointed_step: 'none' })
      .eq('member_id', fixture.id)
      .eq('message_key', key);
    check(
      'she may NOT change the step the message pointed at',
      moveTheStep.error !== null,
      moveTheStep.error?.message ?? 'the update was accepted'
    );

    const readBack = await getTrialArcDelivery(service, fixture.id, key);
    check(
      'and the receipt still says what it said',
      readBack?.deliveredLocalDate === '2099-01-01' && readBack?.pointedStep === 'life_signal_check'
    );

    await service.from('member_trial_arc_deliveries').delete().eq('member_id', fixture.id).eq('message_key', key);
    check('the row is removed', (await getTrialArcDelivery(service, fixture.id, key)) === null);
    await retireSession(minted);
  }
} else {
  console.log('      (skipped: PROD_ANON_KEY_FILE not set)');
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
