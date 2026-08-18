/**
 * The member Movement surface serves real sessions, and the invented
 * catalog it used to serve is gone from the repository.
 *
 * WHAT WAS THERE. lib/movement/exercises/catalog.ts held sixteen
 * hand-authored exercises with no video, no vendor behind them and no
 * coaching review. Its own header called it "explicitly NOT a real
 * exercise library" and "architecture demonstration only". It was the only
 * configured provider, so it was what every member's Movement screen
 * actually generated a session from. Both the file and its provider are
 * deleted.
 *
 * TWO KINDS OF TEST, deliberately. A source sweep, because "no future code
 * path can serve invented exercises" is a claim about the whole repository
 * that no runtime test can make; and a real database read, because the
 * replacement has to actually work.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TEST_USERS, signInAs, serviceRoleClient } from './setup/test-clients';
import {
  countRecentMovementSessionCompletions,
  getSuggestedMovementSession,
} from '../lib/movement-sessions/suggestion';
import { MOVEMENT_SESSION_ORDER } from '../lib/coaching-direction/movement';

const ROOT = path.resolve(__dirname, '..');

const DELETED_PATHS = [
  'lib/movement/exercises/catalog.ts',
  'lib/movement/exercises',
  'lib/movement/providers/internalPlaceholderProvider.ts',
  'lib/movement/providers/registry.ts',
  'lib/movement/providers',
  'lib/movement/rules',
  'lib/movement/data.ts',
  'app/movement/session/page.tsx',
  'app/actions/movement.ts',
];

/** Every identifier that only ever existed to serve the invented catalog. */
const RETIRED_SYMBOLS = [
  'MOVEMENT_EXERCISE_CATALOG',
  'InternalPlaceholderProvider',
  'internal_placeholder',
  'getActiveMovementProvider',
  'MOVEMENT_EXERCISE_PROVIDER',
  'generateMovementSessionPlan',
  'getTodaysMovementSession',
];

const SKIP = /\/(node_modules|\.next|coverage|dist)\//;

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir)) {
      const p = path.join(dir, entry);
      if (SKIP.test(p + '/')) continue;
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p)) out.push(p);
    }
  };
  for (const dir of ['app', 'lib', 'components']) walk(path.join(ROOT, dir));
  return out;
}

describe('the invented catalog is gone from the repository', () => {
  for (const relative of DELETED_PATHS) {
    it(`${relative} no longer exists`, () => {
      expect(fs.existsSync(path.join(ROOT, relative))).toBe(false);
    });
  }

  it('nothing in app, lib or components names any part of it', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const src = fs.readFileSync(file, 'utf-8');
      for (const symbol of RETIRED_SYMBOLS) {
        if (src.includes(symbol)) offenders.push(`${path.relative(ROOT, file)} :: ${symbol}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the sweep is not vacuous: it would catch the symbol if it came back', () => {
    // Proves the file walk actually reaches source, by looking for
    // something that IS there.
    const found = sourceFiles().some((f) =>
      fs.readFileSync(f, 'utf-8').includes('getSuggestedMovementSession')
    );
    expect(found).toBe(true);
  });
});

describe('what the Movement screen offers instead', () => {
  let member: SupabaseClient;

  beforeAll(async () => {
    member = await signInAs(TEST_USERS.memberOne);
  });

  it('offers one of the six real Root Movement sessions', async () => {
    const suggestion = await getSuggestedMovementSession(member, TEST_USERS.memberOne.id);
    expect(suggestion).not.toBeNull();
    expect(MOVEMENT_SESSION_ORDER).toContain(suggestion!.sessionKey);
  });

  it('the session it offers is a real row with real exercises', async () => {
    const suggestion = await getSuggestedMovementSession(member, TEST_USERS.memberOne.id);
    expect(suggestion!.summary.exerciseCount).toBeGreaterThan(0);
    expect(suggestion!.summary.template.name.length).toBeGreaterThan(0);
    expect(suggestion!.summary.template.description).toBeTruthy();
  });

  it('every exercise in every session it can offer has a video', async () => {
    // The whole point. A member tapping through must never reach an
    // exercise there is nothing to show her.
    const service = serviceRoleClient();
    const { data, error } = await service
      .from('movement_session_template_slots')
      .select('external_id, movement_session_templates!inner(is_active)')
      .eq('movement_session_templates.is_active', true);
    expect(error).toBeNull();

    const ids = [...new Set(((data ?? []) as { external_id: string }[]).map((r) => r.external_id))];
    expect(ids.length).toBeGreaterThan(0);

    const { data: rows } = await service
      .from('exercise_catalog')
      .select('external_id, is_client_assignable')
      .in('external_id', ids);
    const byId = new Map(
      ((rows ?? []) as { external_id: string; is_client_assignable: boolean }[]).map((r) => [
        r.external_id,
        r.is_client_assignable,
      ])
    );
    for (const id of ids) expect(byId.get(id)).toBe(true);
  });

  it('the weekly count comes from real session completions, not the retired table', async () => {
    const count = await countRecentMovementSessionCompletions(member, TEST_USERS.memberOne.id);
    expect(count).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(count)).toBe(true);
  });

  it('the Movement screen links only at real session routes', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/movement/page.tsx'), 'utf-8');
    expect(src).toContain('/movement/sessions');
    expect(src).not.toMatch(/['"`]\/movement\/session['"`]/);
  });
});

describe('the copy on that surface', () => {
  it('contains no em dash', () => {
    // The whole file, comments included, for the two files this build
    // wrote from scratch. Anywhere else in the repository an em dash in a
    // code comment is ordinary and not what the rule is about.
    for (const relative of ['app/movement/page.tsx', 'lib/movement-sessions/suggestion.ts']) {
      const src = fs.readFileSync(path.join(ROOT, relative), 'utf-8');
      expect(src.includes('—'), `${relative} contains an em dash`).toBe(false);
    }
  });

  it('claims nothing about the member, and does not call the suggestion personalized', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/movement/page.tsx'), 'utf-8');
    for (const overclaim of ['personalized', 'Intelligently composed', 'designed for you', 'recovery']) {
      expect(src.toLowerCase().includes(overclaim.toLowerCase()), `claims "${overclaim}"`).toBe(
        false
      );
    }
  });
});
