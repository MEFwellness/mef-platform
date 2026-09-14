#!/usr/bin/env node
/**
 * THE LIVE RUN FOR MIGRATION 239, ON PRODUCTION.
 *
 * It creates ONE throwaway account, signs in as that account on
 * app.mefwellness.com, walks enough of the real app to write rows in
 * several tables, deletes the account through the SAME admin endpoint the
 * Supabase dashboard's Delete button calls, and then asks the database
 * whether anything at all is left.
 *
 * The account is given a coach before it is deleted, because
 * coach_client_assignments.client_id is the reference that blocked every
 * assigned member and is therefore the one this run has to put back.
 *
 * It then signs in as the standing test member and walks Home, the Daily
 * Reset and Progress, capturing console and page errors on each, because a
 * migration that changed 42 constraints has to be shown not to have broken
 * the ordinary day.
 *
 * IT NEVER DELETES AN ACCOUNT IT DID NOT CREATE.
 *
 * Usage:
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   TEST_MEMBER_EMAIL=... node scripts/verify-account-deletion-live.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.VERIFY_BASE_URL ?? 'https://app.mefwellness.com';
const STANDING_MEMBER = process.env.TEST_MEMBER_EMAIL;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -- ${detail}`}`);
}

function keyFrom(envName) {
  return readFileSync(process.env[envName], 'utf8').trim();
}

function service() {
  return createClient(process.env.PROD_SUPABASE_URL, keyFrom('PROD_SERVICE_KEY_FILE'), {
    auth: { persistSession: false },
  });
}

function watch(page, errors) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const email = `delete-test-${stamp}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `Throwaway${Math.random().toString(36).slice(2, 10)}!A1`;

  const admin = service();
  const browser = await chromium.launch();
  let throwawayId = null;
  let mintedStanding = null;

  try {
    // =================================================================
    // 1. A BRAND NEW ACCOUNT, MADE BY THIS SCRIPT
    // =================================================================
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    check('a throwaway account was created', !createError, createError?.message ?? '');
    if (createError) throw createError;
    throwawayId = created.user.id;
    console.log(`      throwaway id ${throwawayId}`);

    // =================================================================
    // 2. SIGN IN AS IT, ON THE REAL SITE, AND USE THE APP
    // =================================================================
    const minted = await mintSessionContext(browser, email, {
      baseUrl: BASE,
      viewport: { width: 414, height: 900 },
    });
    check('the throwaway account can hold a real session on production', Boolean(minted));
    if (!minted) throw new Error('could not sign in as the throwaway account');

    const page = await minted.context.newPage();
    const throwawayErrors = [];
    watch(page, throwawayErrors);

    for (const path of ['/dashboard', '/checkin', '/today', '/progress']) {
      const response = await page.goto(`${BASE}${path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(2500);
      check(`the throwaway account can open ${path}`, (response?.status() ?? 0) < 400, page.url());
    }

    // THE ROW THAT CAUSED THE BUG. A member with a coach was exactly the
    // member who could not be deleted, so this run makes one. The coach is
    // the SEEDED TEST coach, never a real one, and the assignment goes with
    // the throwaway account when it is deleted below.
    const { data: accounts } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const testCoach = accounts.users.find((u) => u.email === 'test.coach@example.test');
    check('the seeded test coach was found to assign against', Boolean(testCoach));
    if (testCoach) {
      const { error: assignError } = await admin.from('coach_client_assignments').insert({
        coach_id: testCoach.id,
        client_id: throwawayId,
        assigned_by: testCoach.id,
      });
      check('the throwaway account was given a coach', !assignError, assignError?.message ?? '');
    }

    await admin.from('daily_checkins').insert({
      user_id: throwawayId,
      local_date: new Date().toISOString().slice(0, 10),
      timezone: 'America/New_York',
    });

    // Count what this account now owns, one table at a time, through
    // PostgREST (production has no SQL endpoint and none is added for a
    // verification run).
    const OWNED = [
      ['profiles', 'id'],
      ['coach_client_assignments', 'client_id'],
      ['daily_checkins', 'user_id'],
      ['user_roles', 'user_id'],
      ['member_subscriptions', 'member_id'],
    ];
    let ownedBefore = 0;
    for (const [table, column] of OWNED) {
      const { count } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(column, throwawayId);
      ownedBefore += count ?? 0;
      console.log(`      ${table}.${column}: ${count ?? 0}`);
    }
    check(
      'the throwaway account owns real rows in several tables',
      ownedBefore >= 4,
      `${ownedBefore} rows`
    );

    await page.close();
    await minted.context.close();

    // =================================================================
    // 3. DELETE IT, THE WAY THE DASHBOARD DOES
    // =================================================================
    const { error: deleteError } = await admin.auth.admin.deleteUser(throwawayId);
    check(
      'deleting the account through the admin API succeeds, with no database error',
      !deleteError,
      deleteError?.message ?? ''
    );
    if (!deleteError) throwawayId = null;

    // =================================================================
    // 4. NOTHING IS LEFT
    // =================================================================
    const deletedId = created.user.id;
    const { data: stillThere } = await admin.auth.admin.getUserById(deletedId);
    check('the account is gone from Authentication > Users', !stillThere?.user);

    let leftovers = 0;
    for (const [table, column] of OWNED) {
      const { count, error } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(column, deletedId);
      if (error) continue;
      if ((count ?? 0) > 0) console.log(`      LEFTOVER ${table}.${column}: ${count}`);
      leftovers += count ?? 0;
    }
    check(
      'no row for the deleted account is left in any of its tables',
      leftovers === 0,
      `${leftovers} rows`
    );

    check(
      'no console or page error on any screen the throwaway account saw',
      throwawayErrors.length === 0,
      throwawayErrors.slice(0, 3).join(' | ')
    );

    // =================================================================
    // 5. THE STANDING TEST MEMBER'S ORDINARY DAY STILL WORKS
    // =================================================================
    if (!STANDING_MEMBER) {
      check('TEST_MEMBER_EMAIL is set so the standing member can be walked', false);
    } else {
      mintedStanding = await mintSessionContext(browser, STANDING_MEMBER, {
        baseUrl: BASE,
        viewport: { width: 414, height: 900 },
      });
      check('the standing test member can sign in', Boolean(mintedStanding));

      if (mintedStanding) {
        const memberPage = await mintedStanding.context.newPage();
        const memberErrors = [];
        watch(memberPage, memberErrors);

        for (const [path, label] of [
          ['/dashboard', 'Home'],
          ['/checkin', 'the Daily Reset'],
          ['/progress', 'Progress'],
          ['/today', 'Today'],
        ]) {
          const response = await memberPage.goto(`${BASE}${path}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
          });
          await memberPage.waitForTimeout(3500);
          const body = await memberPage.evaluate(() => document.body.innerText);
          check(
            `${label} loads for the standing test member`,
            (response?.status() ?? 0) < 400 && body.trim().length > 40,
            `${response?.status()} ${memberPage.url()} ${body.trim().length} chars`
          );
        }

        check(
          'no console or page error on any screen the standing test member saw',
          memberErrors.length === 0,
          memberErrors.slice(0, 3).join(' | ')
        );
        await memberPage.close();
      }
    }
  } finally {
    // The throwaway account is removed even if the run threw before it got
    // there. Nothing else is ever touched.
    if (throwawayId) {
      await admin.auth.admin.deleteUser(throwawayId).catch(() => {});
      console.log('      cleanup: throwaway account removed');
    }
    if (mintedStanding) await retireSession(mintedStanding).catch(() => {});
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}  ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
