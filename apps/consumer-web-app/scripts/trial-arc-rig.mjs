#!/usr/bin/env node
/**
 * THE PERMANENT TRIAL ARC TEST RIG.
 *
 * ONE ACCOUNT, KEPT, NOT THROWN AWAY. Prompts 4 to 7 each need to watch the
 * arc happen on the live site, and each of them needs the same account in a
 * known state. Creating a fresh one per run would mean a fresh id, a fresh
 * entry in TRIAL_ARC_TEST_ACCOUNT_IDS and a fresh Vercel deploy every time,
 * so this creates it once and reuses it forever after.
 *
 * WHAT IT IS. An ordinary account, made the same way every other production
 * fixture is made (auth.admin.createUser with the email pre-confirmed, so
 * the signup trigger writes the same profile and the same trial row a real
 * signup would), flagged `is_test = true` immediately so it can never reach
 * a staff surface, a coach's caseload or an analytics figure, and named so
 * nobody has to guess what it is.
 *
 * WHY is_test DOES NOT STOP THE ARC HERE. It normally would: rule 2 of
 * lib/trial-arc/eligibility.ts refuses a seeded account. The rig is named in
 * TRIAL_ARC_TEST_ACCOUNT_IDS, which skips rules 1, 2 and 3 and nothing else.
 * See lib/trial-arc/config.ts.
 *
 * SUBCOMMANDS
 *   ensure                     create it if it does not exist, print its id
 *   show                       print its current arc-relevant state
 *   day <n>                    move ITS OWN trial_started_at so today is day n
 *   deliveries                 list its trial arc receipts
 *   reset-deliveries           delete its trial arc receipts
 *   reset-popups               delete its Root pop-up dismissals
 *   reset                      deliveries + pop-ups + check-ins + greetings
 *   checkin-gap <n>            give it one check-in n days ago and nothing since
 *   active-days <n>            give it a check-in on each of the last n days
 *   clear-checkins             remove its check-ins
 *   clear-greetings            remove its return-greeting claims
 *
 * EVERY WRITE IN THIS FILE IS SCOPED TO THE RIG'S OWN id, and every one of
 * them asserts that the account it is about to touch is flagged is_test
 * first. Nothing here can reach another member's row.
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... node scripts/trial-arc-rig.mjs ensure
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

export const RIG_EMAIL = 'oakomah66+trialarcrig@gmail.com';
export const RIG_DISPLAY_NAME = 'Trial Arc Rig (test)';
export const RIG_TIMEZONE = 'America/New_York';

const url = process.env.PROD_SUPABASE_URL;
const keyFile = process.env.PROD_SERVICE_KEY_FILE;
if (!url || !keyFile) throw new Error('PROD_SUPABASE_URL and PROD_SERVICE_KEY_FILE are required.');

export const service = createClient(url, readFileSync(keyFile, 'utf8').trim(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** The rig's auth user, or null. Looked up by email across every page of the user list. */
async function findRigUser() {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users ?? []).find((u) => u.email === RIG_EMAIL);
    if (hit) return hit;
    if ((data?.users ?? []).length < 200) return null;
  }
  return null;
}

/**
 * The rig's id, creating the account if it does not exist yet.
 *
 * THE ACCOUNT IS FLAGGED is_test BEFORE ANYTHING ELSE HAPPENS TO IT, in the
 * same call chain that created it, so there is no window in which a real
 * coach screen or an analytics query could see it as an ordinary member.
 */
export async function ensureRig() {
  let user = await findRigUser();
  let created = false;

  if (!user) {
    const password = `rig-${crypto.randomUUID()}`;
    const { data, error } = await service.auth.admin.createUser({
      email: RIG_EMAIL,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    user = data.user;
    created = true;
  }

  // Immediately, and every run: the flag, the name and the timezone. The
  // timezone is pinned so a day boundary in a verification run is a fact
  // rather than a guess about where the machine is.
  const { error: profileError } = await service
    .from('profiles')
    .update({ is_test: true, display_name: RIG_DISPLAY_NAME, timezone: RIG_TIMEZONE })
    .eq('id', user.id);
  if (profileError) throw new Error(`flagging the rig failed: ${profileError.message}`);

  const { data: profile } = await service
    .from('profiles')
    .select('is_test, display_name, timezone')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_test) throw new Error('the rig is not flagged is_test, refusing to continue');

  return { id: user.id, email: RIG_EMAIL, created, profile };
}

/** Refuses to touch anything that is not the flagged rig. Every mutation below calls this first. */
async function assertRig(memberId) {
  const { data } = await service.from('profiles').select('is_test').eq('id', memberId).maybeSingle();
  if (!data?.is_test) throw new Error(`refusing to write: ${memberId} is not a flagged test account`);
}

/** A YYYY-MM-DD in the rig's own timezone, `back` days ago. */
export function rigLocalDate(back = 0, now = new Date()) {
  const wall = new Date(now.toLocaleString('en-US', { timeZone: RIG_TIMEZONE }));
  wall.setDate(wall.getDate() - back);
  const pad = (n) => String(n).padStart(2, '0');
  return `${wall.getFullYear()}-${pad(wall.getMonth() + 1)}-${pad(wall.getDate())}`;
}

/**
 * Moves the rig's own trial so that today is day `n` in its own timezone.
 *
 * Day 1 is signup day, so day n means the trial started n-1 days ago. The
 * instant is set to noon in the rig's zone, which is far enough from either
 * midnight that no daylight saving shift can move which calendar day it
 * lands on.
 */
export async function setRigDay(memberId, dayNumber) {
  await assertRig(memberId);
  const startLocal = rigLocalDate(dayNumber - 1);
  const startedAt = new Date(`${startLocal}T16:00:00.000Z`).toISOString();
  const endsAt = new Date(new Date(startedAt).getTime() + 7 * 86_400_000).toISOString();

  const { data: existing } = await service
    .from('member_subscriptions')
    .select('member_id')
    .eq('member_id', memberId)
    .maybeSingle();

  const row = {
    member_id: memberId,
    tier: 'trial',
    source: 'system',
    status: 'active',
    trial_started_at: startedAt,
    trial_ends_at: endsAt,
  };

  const { error } = existing
    ? await service.from('member_subscriptions').update(row).eq('member_id', memberId)
    : await service.from('member_subscriptions').insert(row);
  if (error) throw new Error(`setting the rig's trial day failed: ${error.message}`);
  return { dayNumber, startLocal, startedAt };
}

export async function listDeliveries(memberId) {
  const { data, error } = await service
    .from('member_trial_arc_deliveries')
    .select('message_key, day_number, pace_state, pointed_step, delivered_local_date, delivered_at, cta_tapped_at')
    .eq('member_id', memberId)
    .order('day_number');
  if (error) throw error;
  return data ?? [];
}

export async function resetDeliveries(memberId) {
  await assertRig(memberId);
  const { error } = await service.from('member_trial_arc_deliveries').delete().eq('member_id', memberId);
  if (error) throw error;
}

export async function resetPopups(memberId) {
  await assertRig(memberId);
  const { error } = await service.from('member_root_popup_dismissals').delete().eq('member_id', memberId);
  if (error) throw error;
}

/**
 * Clears ONLY the trial arc's own pop-up dismissals.
 *
 * resetPopups clears every dismissal this account has, which is right when a
 * stage wants a clean chain, and destructive when it does not: the arc reads
 * an experiment OFFER's dismissal as her decline, so wiping every row
 * silently un-declines her. That cost one live run, and this exists so it
 * cannot cost another.
 */
export async function resetArcPopups(memberId) {
  await assertRig(memberId);
  const { error } = await service
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', memberId)
    .like('message_key', 'trial_arc_day:%');
  if (error) throw error;
}

export async function clearCheckins(memberId) {
  await assertRig(memberId);
  const { error } = await service.from('daily_checkins').delete().eq('user_id', memberId);
  if (error) throw error;
}

export async function clearGreetings(memberId) {
  await assertRig(memberId);
  const { error } = await service.from('member_return_greetings').delete().eq('member_id', memberId);
  if (error) throw error;
}

/**
 * One check-in `back` days ago and nothing since, so classifyPresence sees a
 * real multi-day gap. Written through the ordinary table with the ordinary
 * columns; nothing here invents a shape the app does not already write.
 */
export async function seedCheckinGap(memberId, back) {
  await assertRig(memberId);
  await clearCheckins(memberId);
  await clearGreetings(memberId);
  const localDate = rigLocalDate(back);
  const { error } = await service.from('daily_checkins').insert({
    user_id: memberId,
    local_date: localDate,
    timezone: RIG_TIMEZONE,
    energy_level: 3,
    stress_level: 3,
    sleep_quality: 3,
  });
  if (error) throw new Error(`seeding the check-in gap failed: ${error.message}`);
  return localDate;
}

/**
 * A check-in on each of the last `days` days, today included.
 *
 * WHY A VERIFICATION RUN NEEDS THIS. The rig's whole trick is that its trial
 * START is moved backwards while everything it actually does happens today,
 * so its earlier trial days are genuinely empty and the engine correctly
 * reads it as STALLED from day 3 onward. That is the engine being right, and
 * it is the wrong setup for watching the ordinary pacing days, so those
 * stages give it a real history first.
 *
 * Written through the ordinary table with the ordinary columns. Nothing here
 * invents a shape the app does not already write.
 */
export async function seedActiveDays(memberId, days) {
  await assertRig(memberId);
  await clearCheckins(memberId);
  await clearGreetings(memberId);
  const dates = [];
  for (let back = 0; back < days; back += 1) dates.push(rigLocalDate(back));
  const { error } = await service.from('daily_checkins').insert(
    dates.map((local_date) => ({
      user_id: memberId,
      local_date,
      timezone: RIG_TIMEZONE,
      energy_level: 3,
      stress_level: 3,
      sleep_quality: 3,
    }))
  );
  if (error) throw new Error(`seeding active days failed: ${error.message}`);
  return dates;
}

/**
 * Removes today's Morning Brief, so the next visit is her FIRST open of the
 * day again.
 *
 * That is the only visit on which the return greeting is ever claimed, so a
 * verification run that wants to watch the arc yield to it has to put the
 * account back on that visit. Rig scoped, like everything else here.
 */
export async function clearMorningBriefs(memberId) {
  await assertRig(memberId);
  const { error } = await service.from('coach_morning_briefs').delete().eq('member_id', memberId);
  if (error) throw error;
}

/**
 * Moves an existing greeting claim back a day.
 *
 * The arc stays silent for the whole day a greeting is delivered on, which
 * is correct: the greeting is on her Home screen all day and two welcomes on
 * one screen is exactly what the rule forbids. Proving that it speaks again
 * AFTERWARDS needs the next day, and a verification run cannot wait for one,
 * so this puts the claim where it would be on that next morning. The same
 * device setRigDay uses for the trial clock.
 */
export async function backdateGreeting(memberId, days = 1) {
  await assertRig(memberId);
  const { data } = await service
    .from('member_return_greetings')
    .select('gap_start_local_date, shown_at')
    .eq('member_id', memberId);
  for (const row of data ?? []) {
    const moved = new Date(new Date(row.shown_at).getTime() - days * 86_400_000).toISOString();
    const { error } = await service
      .from('member_return_greetings')
      .update({ shown_at: moved })
      .eq('member_id', memberId)
      .eq('gap_start_local_date', row.gap_start_local_date);
    if (error) throw error;
  }
  return (data ?? []).length;
}

export async function resetAll(memberId) {
  await resetDeliveries(memberId);
  await resetPopups(memberId);
  await clearCheckins(memberId);
  await clearGreetings(memberId);
  await clearMorningBriefs(memberId);
}

export async function showRig(memberId) {
  const [{ data: profile }, { data: sub }, { data: assignments }, deliveries] = await Promise.all([
    service.from('profiles').select('is_test, display_name, timezone, created_at').eq('id', memberId).maybeSingle(),
    service.from('member_subscriptions').select('tier, source, status, trial_started_at, trial_arc_suppressed_at').eq('member_id', memberId).maybeSingle(),
    service.from('coach_client_assignments').select('status').eq('client_id', memberId),
    listDeliveries(memberId),
  ]);
  return { profile, subscription: sub, assignments: assignments ?? [], deliveries };
}

// --- CLI -------------------------------------------------------------
const isMain = process.argv[1] && process.argv[1].endsWith('trial-arc-rig.mjs');
if (isMain) {
  const [command, arg] = process.argv.slice(2);
  const rig = await ensureRig();
  console.log(`rig: ${rig.email}  id ${rig.id}${rig.created ? '  (created just now)' : ''}`);

  if (command === 'day') console.log(JSON.stringify(await setRigDay(rig.id, Number(arg)), null, 2));
  else if (command === 'show') console.log(JSON.stringify(await showRig(rig.id), null, 2));
  else if (command === 'deliveries') console.log(JSON.stringify(await listDeliveries(rig.id), null, 2));
  else if (command === 'reset-deliveries') { await resetDeliveries(rig.id); console.log('deliveries cleared'); }
  else if (command === 'reset-popups') { await resetPopups(rig.id); console.log('pop-up dismissals cleared'); }
  else if (command === 'reset-arc-popups') { await resetArcPopups(rig.id); console.log('trial arc pop-up dismissals cleared'); }
  else if (command === 'clear-checkins') { await clearCheckins(rig.id); console.log('check-ins cleared'); }
  else if (command === 'clear-greetings') { await clearGreetings(rig.id); console.log('return greetings cleared'); }
  else if (command === 'clear-briefs') { await clearMorningBriefs(rig.id); console.log('morning briefs cleared'); }
  else if (command === 'checkin-gap') console.log(`check-in seeded on ${await seedCheckinGap(rig.id, Number(arg))}`);
  else if (command === 'active-days') console.log(`check-ins seeded on ${(await seedActiveDays(rig.id, Number(arg))).join(', ')}`);
  else if (command === 'reset') { await resetAll(rig.id); console.log('deliveries, pop-ups, check-ins and greetings cleared'); }
  else if (command && command !== 'ensure') { console.error(`unknown command: ${command}`); process.exit(1); }
}
