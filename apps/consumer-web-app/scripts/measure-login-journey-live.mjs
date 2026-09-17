#!/usr/bin/env node
/**
 * WHERE THE LOGIN JOURNEY'S SECONDS ACTUALLY GO.
 *
 * The login screen's bot check has its own stopwatch already
 * (measure-login-token-live.mjs) and Home has its own
 * (measure-home-speed-live.mjs). This is the middle of the journey, the
 * part neither of them can see: the account service's own answer, and each
 * round trip the app makes AFTER the password is accepted and BEFORE Home
 * is allowed to render.
 *
 * WHAT IT TIMES, against production, one member, several repeats:
 *
 *   auth exchange        POST /auth/v1/token?grant_type=password, the real
 *                        endpoint signIn() calls. Production enforces the
 *                        bot check on it, so a scripted call is REFUSED by
 *                        design (CLAUDE.md) — the number is therefore the
 *                        floor of that segment: network, TLS and the
 *                        service's own captcha verification, without the
 *                        password hash comparison that a real login also
 *                        pays. Reported as a floor, never as the total.
 *   getUser              supabase.auth.getUser(), the auth round trip
 *                        middleware makes on every request and the page's
 *                        own getCachedUser() makes again.
 *   role rpc             has_active_role, once per role.
 *   profile / consent /  the four data reads resolvePostLoginPath makes.
 *   onboarding
 *   timezone + insert    what the session_started analytics row costs.
 *   frame reads          the three the Home shell awaits, plus the daily
 *                        priority row it awaits AFTER them.
 *
 * Then it reports the two shapes: the waves the code makes today, and the
 * floor if every read in a wave really were asked at once. That difference
 * is the only part of this journey the app can spend or save.
 *
 * READ ONLY. Every query is a select or an RPC that reads; the one write
 * (the analytics row) is deliberately NOT performed, only the read in front
 * of it is timed. The session is minted and retired the standard way.
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   node scripts/measure-login-journey-live.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { selectAllRows } from '../lib/data/pagedSelect.ts';

const URL_ = process.env.PROD_SUPABASE_URL;
const ANON = readFileSync(process.env.PROD_ANON_KEY_FILE, 'utf8').trim();
const SERVICE = readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim();
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const RUNS = Number(process.env.RUNS ?? 5);

const ms = (v) => `${Math.round(v)}ms`;

async function timed(label, fn) {
  const t = performance.now();
  let ok = true;
  let note = '';
  try {
    const r = await fn();
    if (r && r.error) {
      ok = false;
      note = String(r.error.code ?? r.error.status ?? r.error.message ?? '').slice(0, 60);
    }
  } catch (e) {
    ok = false;
    note = String(e?.message ?? e).slice(0, 60);
  }
  return { label, ms: performance.now() - t, ok, note };
}

/** The password grant, called exactly as the app calls it and with no token. */
async function timeAuthExchange() {
  const t = performance.now();
  let status = 0;
  let code = '';
  try {
    const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      // Deliberately a nonexistent address: this measures the endpoint's
      // own latency, and the account whose journey we are profiling must
      // not have its sessions churned by a measuring script.
      body: JSON.stringify({ email: 'nobody.measurement@example.invalid', password: 'x'.repeat(24) }),
    });
    status = res.status;
    const body = await res.json().catch(() => ({}));
    code = String(body.error_code ?? body.code ?? body.msg ?? '').slice(0, 40);
  } catch (e) {
    code = String(e?.message ?? e).slice(0, 40);
  }
  return { ms: performance.now() - t, status, code };
}

const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const { data: linked, error: linkErr } = await service.auth.admin.generateLink({
  type: 'magiclink',
  email: EMAIL,
});
if (linkErr) {
  console.error('could not mint:', linkErr.message);
  process.exit(1);
}
const anonClient = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: verified, error: verifyErr } = await anonClient.auth.verifyOtp({
  type: 'magiclink',
  token_hash: linked.properties.hashed_token,
});
if (verifyErr) {
  console.error('could not redeem:', verifyErr.message);
  process.exit(1);
}
const token = verified.session.access_token;
const userId = verified.user.id;

/** A client that talks as the member, the way a request does. */
const asMember = () =>
  createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

const segments = [];
const authRows = [];

try {
  for (let run = 1; run <= RUNS; run++) {
    const sb = asMember();
    authRows.push(await timeAuthExchange());

    const row = {};
    const record = async (label, fn) => {
      const r = await timed(label, fn);
      row[label] = r.ms;
      if (!r.ok) row[`${label}:note`] = r.note;
      return r;
    };

    await record('getUser', () => sb.auth.getUser());
    await record('role.coach', () => sb.rpc('has_active_role', { p_user: userId, p_role: 'coach' }));
    await record('role.admin', () =>
      sb.rpc('has_active_role', { p_user: userId, p_role: 'platform_administrator' })
    );
    await record('profiles', () =>
      sb
        .from('profiles')
        .select('display_name, welcome_flow_eligible, welcome_flow_completed_at')
        .eq('id', userId)
        .maybeSingle()
    );
    await record('consent', () =>
      selectAllRows(() =>
        sb
          .from('consent_records')
          .select('consent_type')
          .eq('user_id', userId)
          .is('revoked_at', null)
          .order('id', { ascending: true })
      )
    );
    await record('onboarding', () =>
      sb.from('onboarding_submissions').select('id').eq('user_id', userId).limit(1)
    );
    await record('profileCore(tz)', () =>
      sb.from('profiles').select('display_name, timezone').eq('id', userId).maybeSingle()
    );
    await record('checkinCount', () =>
      sb
        .from('daily_checkins_current')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
    );
    await record('dailyPriority', () =>
      sb
        .from('member_daily_priorities')
        .select('*')
        .eq('member_id', userId)
        .eq('local_date', new Date().toISOString().slice(0, 10))
        .maybeSingle()
    );

    // The two shapes, measured rather than added up: one wave holding
    // everything the routing decision and the analytics row need, against
    // the two waves the code makes today.
    const parallelAll = await timed('shape:oneWave', () =>
      Promise.all([
        sb.rpc('has_active_role', { p_user: userId, p_role: 'coach' }),
        sb.rpc('has_active_role', { p_user: userId, p_role: 'platform_administrator' }),
        sb
          .from('profiles')
          .select('display_name, timezone, welcome_flow_eligible, welcome_flow_completed_at')
          .eq('id', userId)
          .maybeSingle(),
        selectAllRows(() =>
          sb
            .from('consent_records')
            .select('consent_type')
            .eq('user_id', userId)
            .is('revoked_at', null)
            .order('id', { ascending: true })
        ),
        sb.from('onboarding_submissions').select('id').eq('user_id', userId).limit(1),
      ])
    );
    row['shape:oneWave'] = parallelAll.ms;

    const twoWaves = await timed('shape:twoWaves', async () => {
      await Promise.all([
        sb.rpc('has_active_role', { p_user: userId, p_role: 'coach' }),
        sb.rpc('has_active_role', { p_user: userId, p_role: 'platform_administrator' }),
        sb
          .from('profiles')
          .select('display_name, welcome_flow_eligible, welcome_flow_completed_at')
          .eq('id', userId)
          .maybeSingle(),
      ]);
      await Promise.all([
        selectAllRows(() =>
          sb
            .from('consent_records')
            .select('consent_type')
            .eq('user_id', userId)
            .is('revoked_at', null)
            .order('id', { ascending: true })
        ),
        sb.from('onboarding_submissions').select('id').eq('user_id', userId).limit(1),
      ]);
    });
    row['shape:twoWaves'] = twoWaves.ms;

    const frameToday = await timed('frame:today', async () => {
      await Promise.all([
        sb.from('profiles').select('display_name, timezone').eq('id', userId).maybeSingle(),
        sb
          .from('daily_checkins_current')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        sb.rpc('has_active_role', { p_user: userId, p_role: 'coach' }),
      ]);
      await sb
        .from('member_daily_priorities')
        .select('*')
        .eq('member_id', userId)
        .eq('local_date', new Date().toISOString().slice(0, 10))
        .maybeSingle();
    });
    row['frame:today'] = frameToday.ms;

    const frameOneWave = await timed('frame:oneWave', () =>
      Promise.all([
        sb.from('profiles').select('display_name, timezone').eq('id', userId).maybeSingle(),
        sb
          .from('daily_checkins_current')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        sb.rpc('has_active_role', { p_user: userId, p_role: 'coach' }),
        sb
          .from('member_daily_priorities')
          .select('*')
          .eq('member_id', userId)
          .gte('local_date', '2020-01-01')
          .order('local_date', { ascending: false })
          .limit(3),
      ])
    );
    row['frame:oneWave'] = frameOneWave.ms;

    segments.push(row);
    console.log(
      `run ${run}: ` +
        Object.entries(row)
          .filter(([k]) => !k.includes(':note'))
          .map(([k, v]) => `${k}=${ms(v)}`)
          .join(' ')
    );
  }
} finally {
  await service.auth.admin.signOut(token, 'local').catch(() => {});
}

const keys = Object.keys(segments[0]).filter((k) => !k.includes(':note'));
console.log('\nMEDIANS');
for (const k of keys) {
  const vals = segments.map((s) => s[k]).sort((a, b) => a - b);
  console.log(`  ${k.padEnd(18)} ${ms(vals[Math.floor(vals.length / 2)])}`);
}
const a = authRows.map((r) => r.ms).sort((x, y) => x - y);
console.log(
  `\nauth exchange floor (refused by the bot check, by design): ${ms(a[Math.floor(a.length / 2)])}` +
    ` status=${authRows[0].status} code=${authRows[0].code}`
);
