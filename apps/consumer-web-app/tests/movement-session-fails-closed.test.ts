/**
 * Root Movement, Level 1 — the feature ships DORMANT where migration 153
 * has not been applied.
 *
 * This matters because the code deploys before the migration does. In
 * that window every table this feature reads is missing, and every query
 * against it errors. What must NOT happen is a thrown error reaching a
 * member's screen, or an entry point appearing that leads nowhere.
 *
 * A missing table is simulated with a stub Supabase client that errors on
 * every query, which is exactly what PostgREST returns for a relation
 * that does not exist. The real functions are exercised, not mocked.
 */

import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  appendSessionRunSkip,
  completeSessionRun,
  getSessionDetail,
  getSessionRun,
  getSessionTemplate,
  insertSessionRun,
  listActiveSessionTemplates,
  listSessionSummaries,
  listTemplateSlots,
} from '../lib/movement-sessions/data';

const MISSING_TABLE_ERROR = {
  code: '42P01',
  message: 'relation "public.movement_session_templates" does not exist',
  details: null,
  hint: null,
};

/**
 * Every terminal call resolves to { data: null, error }, and every
 * intermediate call returns the same chainable object, so any query shape
 * this module builds lands on the same error.
 */
function missingTablesClient(): SupabaseClient {
  const result = { data: null, error: MISSING_TABLE_ERROR };
  const chain: Record<string, unknown> = {};
  const chainable = () => chain;
  for (const method of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'in',
    'is',
    'order',
    'limit',
    'like',
    'or',
  ]) {
    chain[method] = chainable;
  }
  chain.single = async () => result;
  chain.maybeSingle = async () => result;
  // An awaited builder with no terminal call resolves the same way.
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);

  return { from: () => chain } as unknown as SupabaseClient;
}

describe('Root Movement fails closed before its migration is applied', () => {
  const supabase = missingTablesClient();

  it('shows no sessions rather than throwing', async () => {
    await expect(listActiveSessionTemplates(supabase)).resolves.toEqual([]);
    await expect(listSessionSummaries(supabase)).resolves.toEqual([]);
  });

  it('resolves no single session and no lineup', async () => {
    await expect(getSessionTemplate(supabase, 'morning_mobility')).resolves.toBeNull();
    await expect(listTemplateSlots(supabase, 'any-template-id')).resolves.toEqual([]);
    await expect(getSessionDetail(supabase, 'morning_mobility')).resolves.toBeNull();
  });

  it('records nothing, and reports that it recorded nothing', async () => {
    await expect(insertSessionRun(supabase, 'member-id', 'morning_mobility')).resolves.toBeNull();
    await expect(getSessionRun(supabase, 'member-id', 'run-id')).resolves.toBeNull();
    await expect(appendSessionRunSkip(supabase, 'member-id', 'run-id', 'ex-id')).resolves.toBeNull();
    await expect(completeSessionRun(supabase, 'member-id', 'run-id')).resolves.toBeNull();
  });

  it('never throws from any read or write path', async () => {
    // Belt and braces: the assertions above already prove each return
    // value, this proves none of them rejects on the way there.
    await expect(
      Promise.all([
        listActiveSessionTemplates(supabase),
        listSessionSummaries(supabase),
        getSessionDetail(supabase, 'recovery_day'),
        insertSessionRun(supabase, 'm', 'recovery_day'),
        completeSessionRun(supabase, 'm', 'r'),
      ])
    ).resolves.toBeDefined();
  });
});

describe('Root Movement entry point is gated on the sessions existing', () => {
  it('renders the Movement screen entry card only when there is at least one session', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const source = readFileSync(
      path.resolve(__dirname, '../app/movement/page.tsx'),
      'utf8'
    );

    // The suggestion comes from the same fail-closed read (it resolves to
    // null when the templates table is not there yet) and both the
    // suggestion card and the link to the full list are conditional on it.
    // Without that, a code-before-migration deploy would show a link to an
    // empty screen.
    expect(source).toMatch(/getSuggestedMovementSession\(supabase, user\.id\)/);
    expect(source).toMatch(/\{suggestion && \(/);
    expect(source).toMatch(/\{!suggestion && \(/);
  });
});
