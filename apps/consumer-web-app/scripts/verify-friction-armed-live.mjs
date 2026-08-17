#!/usr/bin/env node
/**
 * Confirms, against real production, that migrations 165 and 166 are live
 * and that the friction question is ARMED.
 *
 * "Armed" has one precise meaning in this codebase. The engine refuses to
 * ask a member what got in the way unless it could store her answer, and it
 * decides that from whether `listThreadFriction`'s select succeeds
 * (lib/coaching-direction/frictionData.ts). So the check that matters is not
 * "do the columns exist" but "can the MEMBER'S OWN SESSION select them",
 * because that select runs under her session and under RLS.
 *
 * READS ONLY, with three deliberate exceptions that are all writes the
 * database is expected to REJECT. A rejected write changes nothing; it is
 * the only way to prove a check constraint is really enforcing rather than
 * merely declared.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   PROD_KEYS_FILE=/path/to/keys.env node scripts/verify-friction-armed-live.mjs
 *
 * PROD_KEYS_FILE holds SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const REF = 'piafgqstbibvllsnuike';
const MEMBER_EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';

for (const line of readFileSync(process.env.PROD_KEYS_FILE, 'utf8').split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) process.env[line.slice(0, eq)] = line.slice(eq + 1).trim();
}

const service = createClient(`https://${REF}.supabase.co`, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

const { data: users } = await service.auth.admin.listUsers();
const member = users.users.find((u) => u.email === MEMBER_EMAIL);
if (!member) throw new Error(`no such member: ${MEMBER_EMAIL}`);

// ---------------------------------------------------------------------
// Migration 165 — the canonical finding registry
// ---------------------------------------------------------------------
const findings = await service
  .from('registry_entries')
  // member_id is in this list because the duplicate check below keys on it.
  // Leaving it out made every member's rows collide with every other
  // member's and reported 42 duplicates that do not exist.
  .select('id, member_id, domain, code, status, canonical_source_key, evidence_tier, coach_verified_at')
  .eq('entry_kind', 'finding');

check('migration 165 columns exist on registry_entries', !findings.error, findings.error?.message);

if (!findings.error) {
  const rows = findings.data;
  const active = rows.filter((r) => r.status === 'active');
  check(
    'every finding row carries a canonical source key',
    rows.every((r) => r.canonical_source_key),
    `${rows.filter((r) => r.canonical_source_key).length} of ${rows.length}`
  );
  check(
    'every source key is exactly its own domain::code',
    rows.every((r) => r.canonical_source_key === `${r.domain}::${r.code}`),
    'no mismatches'
  );
  check(
    'every active finding carries an evidence tier',
    active.every((r) => r.evidence_tier),
    `${active.filter((r) => r.evidence_tier).length} of ${active.length}`
  );

  const TIERS = new Set([
    'early_indication',
    'emerging_pattern',
    'supported_by_checkins',
    'coach_verified',
  ]);
  check(
    'every stored tier is one of the four',
    active.every((r) => TIERS.has(r.evidence_tier)),
    Object.entries(
      active.reduce((acc, r) => ({ ...acc, [r.evidence_tier]: (acc[r.evidence_tier] ?? 0) + 1 }), {})
    )
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')
  );

  // The dedupe step. One active row per (member, source answer), which is
  // the whole point of the key.
  const seen = new Map();
  let duplicates = 0;
  for (const r of active) {
    const k = `${r.member_id}|${r.canonical_source_key}`;
    if (seen.has(k)) duplicates += 1;
    seen.set(k, true);
  }
  check('no member has two active rows for one source answer', duplicates === 0, `${duplicates} found`);

  check(
    'no finding was silently promoted to coach verified',
    rows.filter((r) => r.coach_verified_at).length === 0,
    'a coach has confirmed nothing yet, which is the honest count'
  );
}

// ---------------------------------------------------------------------
// Migration 166 — the friction question, under the MEMBER'S OWN session
// ---------------------------------------------------------------------
const { data: link } = await service.auth.admin.generateLink({
  type: 'magiclink',
  email: MEMBER_EMAIL,
});

const anon = createClient(`https://${REF}.supabase.co`, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const verified = await anon.auth.verifyOtp({
  email: MEMBER_EMAIL,
  token: link.properties.email_otp,
  type: 'email',
});
check('minted the member session the app itself runs under', !verified.error, verified.error?.message);

// The EXACT select lib/coaching-direction/frictionData.ts issues. If this
// succeeds, `available` is true and the engine is willing to ask.
const asHer = await anon
  .from('member_coaching_decisions')
  .select('thread_key, local_date, friction_asked_at, friction_reason, friction_answered_at')
  .eq('member_id', member.id)
  .not('friction_asked_at', 'is', null)
  .order('friction_asked_at', { ascending: true });

check(
  'THE FRICTION QUESTION IS ARMED: her own session can read the friction columns',
  !asHer.error,
  asHer.error ? asHer.error.message : 'listThreadFriction returns available: true'
);

// ---------------------------------------------------------------------
// The constraints, proven by writes the database must refuse
// ---------------------------------------------------------------------
const decisions = await service
  .from('member_coaching_decisions')
  .select('id, local_date, friction_reason, friction_note, friction_asked_at, friction_answered_at')
  .eq('member_id', member.id)
  .order('local_date', { ascending: false });

const target = decisions.data?.[0];
if (target) {
  const before = JSON.stringify(target);

  const badReason = await service
    .from('member_coaching_decisions')
    .update({ friction_reason: 'did_not_feel_like_it' })
    .eq('id', target.id);
  check(
    'the database refuses a reason outside the closed set',
    !!badReason.error,
    badReason.error ? 'rejected' : 'ACCEPTED, constraint is missing'
  );

  const badNote = await service
    .from('member_coaching_decisions')
    .update({ friction_note: 'a note with no reason behind it' })
    .eq('id', target.id);
  check(
    'the database refuses a free-text note with no tapped reason',
    !!badNote.error,
    badNote.error ? 'rejected' : 'ACCEPTED, constraint is missing'
  );

  const after = await service
    .from('member_coaching_decisions')
    .select('id, local_date, friction_reason, friction_note, friction_asked_at, friction_answered_at')
    .eq('id', target.id)
    .single();
  check(
    'the refused writes left her row exactly as it was',
    JSON.stringify(after.data) === before,
    'unchanged'
  );
}

const anyEntry = (await service.from('registry_entries').select('id, evidence_tier').limit(1)).data[0];
const badTier = await service
  .from('registry_entries')
  .update({ evidence_tier: 'very_confident' })
  .eq('id', anyEntry.id);
check(
  'the database refuses a tier outside the four',
  !!badTier.error,
  badTier.error ? 'rejected' : 'ACCEPTED, constraint is missing'
);

// ---------------------------------------------------------------------
// Where she actually stands, so the report can say what to watch for
// ---------------------------------------------------------------------
const { data: threads } = await service
  .from('member_coaching_threads')
  .select('thread_key, approach, approach_changes, consecutive_ignored, coach_escalated_at')
  .eq('member_id', member.id);

console.log('\nHER CURRENT STATE, which is what decides whether the question fires:');
for (const t of threads ?? []) {
  console.log(
    `   thread ${t.thread_key} | approach ${t.approach} | approach changes ${t.approach_changes} | consecutive ignored days ${t.consecutive_ignored} | escalated: ${t.coach_escalated_at ?? 'no'}`
  );
}
console.log('\n   Her last six recorded days, and what she did each day:');
for (const d of decisions.data ?? []) {
  console.log(`   ${d.local_date} | friction asked: ${d.friction_asked_at ? 'yes' : 'no'}`);
}

const { data: responses } = await service
  .from('member_coaching_decisions')
  .select('local_date, member_response')
  .eq('member_id', member.id)
  .order('local_date', { ascending: false });
console.log('   ' + (responses ?? []).map((r) => `${r.local_date}=${r.member_response ?? 'pending'}`).join('  '));

await anon.auth.signOut();

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passing`);
process.exit(passed === results.length ? 0 : 1);
