#!/usr/bin/env node
/**
 * Admin Analytics, live verification. READ ONLY: this script never writes,
 * updates or deletes anything.
 *
 * It does two independent things and prints them side by side:
 *
 *   1. Calls each analytics function (the SQL aggregation in migration 149).
 *   2. Pulls the RAW event rows for the same range and counts them in
 *      JavaScript, touching none of those functions.
 *
 * If the two columns disagree, one of them is wrong, and the whole point is
 * that they were computed by completely different code. A number that only
 * ever checks itself is not verified.
 *
 * It also proves the test-account toggle really works on live data, by
 * running the overview both ways and showing the difference.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   ANALYTICS_SUPABASE_URL=https://<ref>.supabase.co \
 *   ANALYTICS_SERVICE_ROLE_KEY=<Settings, API, service_role key> \
 *   node scripts/verify-analytics-live.mjs
 *
 * Against local Supabase, the two variables the rest of the repo already
 * uses are picked up automatically from .env.local:
 *
 *   node scripts/verify-analytics-live.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = path.resolve(here, '../.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadEnvLocal();

const URL = process.env.ANALYTICS_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.ANALYTICS_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error(
    'Set ANALYTICS_SUPABASE_URL and ANALYTICS_SERVICE_ROLE_KEY (or run against local Supabase with .env.local present).'
  );
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const END = process.env.ANALYTICS_END_DATE ?? new Date().toISOString().slice(0, 10);
function shift(date, days) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const START = process.env.ANALYTICS_START_DATE ?? shift(END, -89);

const MEANINGFUL = new Set([
  'session_started',
  'onboarding_started',
  'onboarding_completed',
  'surface_viewed',
  'daily_reset_started',
  'daily_reset_completed',
  'food_scan_performed',
  'food_entry_logged',
  'feature_engaged',
  'paywall_viewed',
  'priority_shown',
  'priority_action',
  're_entry_shown',
]);

const checks = [];
function compare(label, fromFunction, fromRawRows, note = '') {
  const match = JSON.stringify(fromFunction) === JSON.stringify(fromRawRows);
  checks.push({ label, fromFunction, fromRawRows, match, note });
}

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

/**
 * The independent path. Pulls the raw rows and works them out in
 * JavaScript, deliberately using none of the analytics functions. Paged, so
 * PostgREST's default row cap cannot silently truncate the answer and make
 * a wrong number look right.
 */
async function fetchRawRows() {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('product_analytics_events')
      .select('member_id, event_type, local_date, occurred_at, payload, is_test')
      .gte('local_date', START)
      .lte('local_date', END)
      .order('occurred_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`raw rows: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

/** The same member scope the functions use: not a test account, no staff role grant. */
async function fetchMemberScope() {
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, display_name, created_at, is_test');
  if (pErr) throw new Error(`profiles: ${pErr.message}`);

  const { data: roles, error: rErr } = await supabase
    .from('user_roles')
    .select('user_id, role, revoked_at');
  if (rErr) throw new Error(`user_roles: ${rErr.message}`);

  const staff = new Set(
    roles
      .filter(
        (r) =>
          r.revoked_at === null &&
          ['coach', 'platform_administrator', 'clinician_reviewer'].includes(r.role)
      )
      .map((r) => r.user_id)
  );

  return profiles.filter((p) => !staff.has(p.id));
}

async function main() {
  console.log('Admin Analytics live verification (read only)');
  console.log(`  target : ${URL}`);
  console.log(`  range  : ${START} to ${END} (local_date, inclusive)`);
  console.log('');

  const scope = await fetchMemberScope();
  const realMembers = new Set(scope.filter((p) => !p.is_test).map((p) => p.id));
  const testMembers = new Set(scope.filter((p) => p.is_test).map((p) => p.id));

  const allRows = await fetchRawRows();
  const rows = allRows.filter((r) => realMembers.has(r.member_id));

  console.log(`  raw rows pulled for the range : ${allRows.length}`);
  console.log(`  of those, from real members   : ${rows.length}`);
  console.log(`  member accounts in scope      : ${realMembers.size} real, ${testMembers.size} test`);
  console.log('');

  // ---- Group A -------------------------------------------------------
  const overview = await rpc('analytics_overview', {
    p_start: START,
    p_end: END,
    p_include_test: false,
  });

  const activeDayPairs = new Set(
    rows.filter((r) => MEANINGFUL.has(r.event_type)).map((r) => `${r.member_id}|${r.local_date}`)
  );
  const activeMembers = new Set([...activeDayPairs].map((k) => k.split('|')[0]));

  compare('activeMembers', overview.activeMembers, activeMembers.size);
  compare('sessions (active member-days)', overview.sessions, activeDayPairs.size);
  compare(
    'signIns (session_started events)',
    overview.signIns,
    rows.filter((r) => r.event_type === 'session_started').length
  );
  compare(
    'dailyReset.startedEvents',
    overview.dailyReset.startedEvents,
    rows.filter((r) => r.event_type === 'daily_reset_started').length
  );
  compare(
    'dailyReset.completedEvents',
    overview.dailyReset.completedEvents,
    rows.filter((r) => r.event_type === 'daily_reset_completed').length
  );
  compare(
    'newMembers (signup_completed)',
    overview.newMembers,
    new Set(rows.filter((r) => r.event_type === 'signup_completed').map((r) => r.member_id)).size
  );
  compare(
    'paywallViews.events',
    overview.paywallViews.events,
    rows.filter((r) => r.event_type === 'paywall_viewed').length
  );

  const perDay = new Map();
  for (const key of activeDayPairs) {
    const day = key.split('|')[1];
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  compare('days with any activity', overview.dailyActiveSeries.length, perDay.size);

  // ---- Group C -------------------------------------------------------
  const usage = await rpc('analytics_feature_usage', {
    p_start: START,
    p_end: END,
    p_include_test: false,
  });
  const homeFromFunction = usage.features.find((f) => f.featureKey === 'home');
  compare(
    'feature home, total events',
    homeFromFunction?.totalEvents ?? 0,
    rows.filter((r) => r.event_type === 'surface_viewed' && r.payload?.surface === 'home').length
  );
  compare(
    'feature home, unique members',
    homeFromFunction?.uniqueMembers ?? 0,
    new Set(
      rows
        .filter((r) => r.event_type === 'surface_viewed' && r.payload?.surface === 'home')
        .map((r) => r.member_id)
    ).size
  );

  // ---- Group D -------------------------------------------------------
  const dropOff = await rpc('analytics_drop_off', {
    p_start: START,
    p_end: END,
    p_include_test: false,
  });
  const onboarding = dropOff.flows.find((f) => f.flowKey === 'onboarding');
  compare(
    'onboarding startedEvents',
    onboarding?.startedEvents ?? 0,
    rows.filter((r) => r.event_type === 'onboarding_started').length
  );

  // ---- Group E -------------------------------------------------------
  const facts = await rpc('analytics_member_engagement_facts', {
    p_end: END,
    p_include_test: false,
    p_member: null,
  });
  compare('members returned by engagement facts', facts.length, realMembers.size);

  // ---- The rest, shape only -----------------------------------------
  const funnel = await rpc('analytics_funnel', {
    p_start: START,
    p_end: END,
    p_include_test: false,
  });
  const trend = await rpc('analytics_feature_trend', {
    p_end: END,
    p_window_days: 14,
    p_include_test: false,
  });

  // ---- Test account toggle ------------------------------------------
  const withTest = await rpc('analytics_overview', {
    p_start: START,
    p_end: END,
    p_include_test: true,
  });
  const testActiveDayPairs = new Set(
    allRows
      .filter((r) => MEANINGFUL.has(r.event_type) && (realMembers.has(r.member_id) || testMembers.has(r.member_id)))
      .map((r) => `${r.member_id}|${r.local_date}`)
  );
  compare(
    'sessions with test accounts included',
    withTest.sessions,
    testActiveDayPairs.size,
    'the toggle on'
  );

  // ---- Report --------------------------------------------------------
  const width = Math.max(...checks.map((c) => c.label.length), 32);
  console.log('  SIDE BY SIDE');
  console.log(`  ${'metric'.padEnd(width)}  ${'from the function'.padStart(18)}  ${'from raw rows'.padStart(14)}   match`);
  console.log(`  ${'-'.repeat(width)}  ${'-'.repeat(18)}  ${'-'.repeat(14)}   -----`);
  for (const c of checks) {
    console.log(
      `  ${c.label.padEnd(width)}  ${String(c.fromFunction).padStart(18)}  ${String(c.fromRawRows).padStart(14)}   ${c.match ? 'yes' : 'NO'}${c.note ? `  (${c.note})` : ''}`
    );
  }

  console.log('');
  console.log('  TEST ACCOUNT TOGGLE');
  console.log(`  excluded (default) : ${overview.activeMembers} active members, ${overview.sessions} sessions`);
  console.log(`  included           : ${withTest.activeMembers} active members, ${withTest.sessions} sessions`);
  console.log(`  test accounts on the platform : ${testMembers.size}`);

  console.log('');
  console.log('  HONEST UNMEASURABLES');
  console.log(`  overview.purchases.measurable       : ${overview.purchases.measurable}`);
  const purchaseStage = funnel.stages.find((s) => s.key === 'completed_a_purchase');
  console.log(`  funnel purchase stage, measurable   : ${purchaseStage.measurable}, members: ${purchaseStage.members}`);
  const experience = dropOff.flows.find((f) => f.flowKey === 'experience');
  console.log(`  drop-off experience flow, measurable: ${experience.measurable}, started: ${experience.startedEvents}`);
  console.log(`  per-question drop-off, measurable   : ${dropOff.perQuestionDropOff.measurable}`);

  console.log('');
  console.log('  FUNNEL');
  console.log(`  cohort (signup events in range) : ${funnel.cohortSize}`);
  console.log(`  profiles created in range       : ${funnel.profilesCreatedInRange}`);
  for (const stage of funnel.stages) {
    console.log(`    ${stage.label.padEnd(38)} ${stage.measurable ? String(stage.members).padStart(5) : '  n/a'}`);
  }

  console.log('');
  console.log('  ENGAGEMENT STATES (facts only, classification happens in TypeScript)');
  for (const f of facts.slice(0, 10)) {
    console.log(
      `    ${String(f.displayName ?? f.memberId).slice(0, 24).padEnd(26)} last active ${String(f.lastActivityDate ?? 'never').padEnd(12)} recent ${String(f.recentActiveDays).padStart(2)}/14  baseline ${String(f.baselineActiveDays).padStart(2)}/28`
    );
  }
  if (facts.length > 10) console.log(`    ... and ${facts.length - 10} more`);

  console.log('');
  console.log('  PRIVACY');
  const serialized = JSON.stringify([overview, funnel, usage, dropOff, facts, trend]).toLowerCase();
  const forbidden = ['"text"', '"answer"', '"notes"', '"symptoms', '"pain', 'concern_flagged'];
  const hits = forbidden.filter((f) => serialized.includes(f));
  console.log(`  health-answer fields found in output : ${hits.length === 0 ? 'none' : hits.join(', ')}`);

  const failed = checks.filter((c) => !c.match);
  console.log('');
  if (failed.length > 0) {
    console.log(`  RESULT: ${failed.length} of ${checks.length} cross-checks DISAGREE.`);
    process.exit(1);
  }
  console.log(`  RESULT: all ${checks.length} cross-checks agree.`);
}

main().catch((error) => {
  console.error('verification failed:', error.message);
  process.exit(1);
});
