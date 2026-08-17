#!/usr/bin/env node
/**
 * Live check, staff half: confirms a coach/administrator can still reach
 * the Exercise Library and the Movement Profile on app.mefwellness.com,
 * and that both are linked from the coach and admin dashboards.
 *
 * Mints a session for the real staff account without its password, via
 * generateLink + verifyOtp, then writes it as the app's own cookie. See
 * scripts/screenshots/verify-role-based-home-routing-live.mjs, which
 * established this technique. Reads and navigates only, and retires the
 * minted session locally at the end so no other session that account holds
 * is disturbed.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { stringToBase64URL } from '@supabase/ssr/dist/main/utils/base64url.js';
import { createChunks } from '@supabase/ssr/dist/main/utils/chunker.js';

const REF = 'piafgqstbibvllsnuike';
const BASE = 'https://app.mefwellness.com';
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? 'oakomah66@gmail.com';
const SHOTS = process.env.SHOTS_DIR ?? './live-shots';
mkdirSync(SHOTS, { recursive: true });

for (const line of readFileSync(process.env.PROD_KEYS_FILE, 'utf8').split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) process.env[line.slice(0, eq)] = line.slice(eq + 1).trim();
}

const service = createClient(`https://${REF}.supabase.co`, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(`https://${REF}.supabase.co`, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

let accessToken = null;
const browser = await chromium.launch();

try {
  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: STAFF_EMAIL,
  });
  if (linkErr) throw linkErr;

  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyErr) throw verifyErr;
  accessToken = verified.session.access_token;
  check('staff session minted without a password', true, STAFF_EMAIL);

  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const encoded = 'base64-' + stringToBase64URL(JSON.stringify(verified.session));
  await context.addCookies(
    createChunks(`sb-${REF}-auth-token`, encoded).map((c) => ({
      name: c.name,
      value: c.value,
      domain: 'app.mefwellness.com',
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    }))
  );
  const page = await context.newPage();

  for (const [path, label] of [
    ['/exercises', 'the Exercise Library'],
    ['/movement/profile', 'the Movement Profile'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    const landed = new URL(page.url()).pathname;
    await page.screenshot({ path: `${SHOTS}/s-${path.replace(/\W+/g, '-')}.png`, fullPage: true });
    check(`a coach/admin CAN open ${label}`, landed === path, `landed on ${landed}`);
  }

  for (const [path, label] of [
    ['/coach', 'coach dashboard'],
    ['/admin', 'admin dashboard'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    const text = await page.locator('body').innerText();
    await page.screenshot({ path: `${SHOTS}/s${path.replace(/\W+/g, '-')}.png`, fullPage: true });
    check(`the ${label} links to the Exercise Library`, /Exercise Library/i.test(text));
    check(`the ${label} links to the Movement Profile`, /Movement Profile/i.test(text));
  }

  await context.close();
} catch (err) {
  check('staff live check ran', false, String(err?.message ?? err));
} finally {
  if (accessToken) await service.auth.admin.signOut(accessToken, 'local').catch(() => {});
  await browser.close();
  console.log('\n---- SUMMARY ----');
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}`);
  const failed = results.filter((r) => !r.passed).length;
  console.log(`${results.length - failed}/${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}
