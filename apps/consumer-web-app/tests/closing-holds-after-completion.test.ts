/**
 * THE CLOSING IS HERS UNTIL SHE TAPS OUT OF IT (2026-09-05).
 *
 * FOUND ON A REAL PHONE. Finishing a Core Values Snapshot on production
 * did not leave the member on the taker's premium closing beat. Walked
 * three times: twice it went straight to the results screen, once the
 * closing drew and was replaced seconds later. Life Signal Check and the
 * Readiness Pulse had the identical shape.
 *
 * WHAT WAS RACING WHAT. Finishing calls a Server Action from the client
 * taker, and an App Router Server Action's response carries a re-render of
 * the route the member is standing on. The take route's own read sent a
 * FINISHED session to the results screen, so the re-render navigated her
 * off her own closing. Three different actions could fire that re-render
 * inside the same few seconds: the last answer's save, the completion
 * itself, and the closing's own reads. Which one landed first decided
 * whether she saw the closing at all, which is why it looked intermittent.
 *
 * THE FIX IS NOT TO STOP THE RE-RENDER, it is to make the re-render land
 * where she already is. These tests hold both halves of that:
 *
 *   1. The rule, in one place: a session finished within this sitting
 *      renders the closing, and one finished before it renders results.
 *   2. The write, exactly once: the same completion asked for twice, the
 *      way that race asked for it, stamps one row one time.
 *
 * The database half runs against real local Supabase and real RLS, in the
 * same fixture shape as tests/completed-experience-runtime-integration.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { serviceRoleClient } from './setup/test-clients';
import {
  completeSession,
  persistAnswer,
  startOrResumeSession,
} from '../lib/assessment-runtime';
import {
  CLOSING_BEATS,
  CLOSING_PARAM,
  CLOSING_WINDOW_MINUTES,
  FIRST_CLOSING_BEAT,
  decideFinishedSessionDestination,
  isWithinClosingWindow,
  parseClosingBeat,
} from '../lib/assessment-runtime/closing';

/** A fixed instant. Nothing here reads a clock, so nothing here can drift. */
const FINISHED_AT = '2026-09-05T18:30:00.000Z';
const finishedMs = new Date(FINISHED_AT).getTime();
const minutes = (n: number) => finishedMs + n * 60_000;

// --- 1. The rule -----------------------------------------------------

describe('guard 1 — a re-render during the completion call cannot bounce her to results', () => {
  /**
   * The three re-renders that could arrive in the seconds around a
   * completion, at the delays production actually showed (1.4 to 2.5
   * seconds for the same bug class, and the closing's own reads a few
   * seconds later).
   */
  const RE_RENDERS = [
    ['the last answer save landing after the completion', 0.02],
    ['the completion action re-rendering its own route', 0.05],
    ["the closing's own reads, seconds later", 8],
  ] as const;

  it.each(RE_RENDERS)('%s still lands on the closing', (_label, minutesLater) => {
    expect(
      decideFinishedSessionDestination({
        hasInFlowClosing: true,
        completedAt: FINISHED_AT,
        nowMs: minutes(minutesLater),
      })
    ).toBe('closing');
  });

  it('a clock that reads the completion as a moment in the future is still this sitting', () => {
    expect(isWithinClosingWindow(FINISHED_AT, minutes(-1))).toBe(true);
  });
});

describe('guard 2 — the closing survives an immediate reload', () => {
  it('a refresh mid-reveal is still the closing, not results', () => {
    expect(
      decideFinishedSessionDestination({
        hasInFlowClosing: true,
        completedAt: FINISHED_AT,
        nowMs: minutes(0.5),
      })
    ).toBe('closing');
  });

  it('the URL marker carries the exact beat back, so a reload does not restart the closing', () => {
    for (const beat of CLOSING_BEATS) {
      expect(parseClosingBeat(beat)).toBe(beat);
    }
  });

  it('a marker that says nothing valid asks for nothing, and the closing starts at its first beat', () => {
    expect(parseClosingBeat(undefined)).toBeNull();
    expect(parseClosingBeat('')).toBeNull();
    expect(parseClosingBeat('results')).toBeNull();
    expect(parseClosingBeat('screen1')).toBeNull();
    expect(parseClosingBeat(['close', 'learned'])).toBe('close');
    expect(FIRST_CLOSING_BEAT).toBe('learned');
  });

  it('the marker is a query parameter on the take route, not a second route to keep in step', () => {
    expect(CLOSING_PARAM).toBe('closing');
  });
});

describe('guard 3 — coming back to a finished experience lands on results', () => {
  it('a day later is a return, not a replay', () => {
    expect(
      decideFinishedSessionDestination({
        hasInFlowClosing: true,
        completedAt: FINISHED_AT,
        nowMs: minutes(24 * 60),
      })
    ).toBe('results');
  });

  it('the sitting is long enough to sit with, and shorter than a day', () => {
    expect(CLOSING_WINDOW_MINUTES).toBeGreaterThanOrEqual(60);
    expect(CLOSING_WINDOW_MINUTES).toBeLessThan(24 * 60);
    expect(isWithinClosingWindow(FINISHED_AT, minutes(CLOSING_WINDOW_MINUTES - 1))).toBe(true);
    expect(isWithinClosingWindow(FINISHED_AT, minutes(CLOSING_WINDOW_MINUTES + 1))).toBe(false);
  });

  it('a completion with no instant to measure from is a return', () => {
    expect(isWithinClosingWindow(null, finishedMs)).toBe(false);
    expect(isWithinClosingWindow('not a date', finishedMs)).toBe(false);
    expect(
      decideFinishedSessionDestination({ hasInFlowClosing: true, completedAt: null, nowMs: finishedMs })
    ).toBe('results');
  });

  it('an experience that ends ON its results screen is untouched by all of this', () => {
    expect(
      decideFinishedSessionDestination({
        hasInFlowClosing: false,
        completedAt: FINISHED_AT,
        nowMs: minutes(1),
      })
    ).toBe('results');
  });
});

// --- 2. The write ----------------------------------------------------

/**
 * ITS OWN MEMBER, NOT A SHARED ONE. Three other suites in this directory
 * clean up by deleting every `unified_assessment_sessions` row belonging
 * to the two seeded members, one of them after every single test, and
 * vitest runs test files in parallel. A completion this file is measuring
 * could then be deleted out from under it by an unrelated suite, which is
 * a failing test that says nothing true about the code. So this file makes
 * and destroys its own member, on the local database only.
 */
const FIXTURE_EMAIL = 'closing.holds.fixture@example.test';
const FIXTURE_PASSWORD = 'DevPassword123!';
const FIXTURE_KEY = 'closing-holds-fixture';

let memberId: string;
let definitionId: string;
let questionId: string;

async function seedMember() {
  const service = serviceRoleClient();

  // A leftover from an interrupted run would otherwise fail createUser.
  const { data: existing } = await service.auth.admin.listUsers({ perPage: 200 });
  const stale = existing?.users?.find((u) => u.email === FIXTURE_EMAIL);
  if (stale) await service.auth.admin.deleteUser(stale.id);

  const { data, error } = await service.auth.admin.createUser({
    email: FIXTURE_EMAIL,
    password: FIXTURE_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('failed to create the fixture member');
  memberId = data.user.id;
}

/** Signed in as the fixture member, so every write below goes through real RLS. */
async function signInAsFixtureMember(): Promise<SupabaseClient> {
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { error } = await client.auth.signInWithPassword({
    email: FIXTURE_EMAIL,
    password: FIXTURE_PASSWORD,
  });
  if (error) throw new Error(`fixture sign-in failed: ${error.message}`);
  return client;
}

async function seedFixture() {
  const service = serviceRoleClient();

  const { data: definition, error: definitionError } = await service
    .from('unified_assessment_definitions')
    .insert({ key: FIXTURE_KEY, title: 'Closing Holds Fixture', assessment_type: 'test_fixture' })
    .select('id')
    .single();
  if (definitionError || !definition) throw definitionError ?? new Error('failed to seed definition');
  definitionId = definition.id;

  const { data: section, error: sectionError } = await service
    .from('unified_assessment_sections')
    .insert({ assessment_definition_id: definitionId, title: 'Only Section', display_order: 0 })
    .select('id')
    .single();
  if (sectionError || !section) throw sectionError ?? new Error('failed to seed section');

  const { data: question, error: questionError } = await service
    .from('unified_assessment_questions')
    .insert({
      question_key: 'closing_fixture_question',
      assessment_definition_id: definitionId,
      section_id: section.id,
      display_order: 0,
      prompt: 'Is this the only question?',
      answer_type: 'boolean',
    })
    .select('id')
    .single();
  if (questionError || !question) throw questionError ?? new Error('failed to seed question');
  questionId = question.id;
}

async function clearSessions() {
  const service = serviceRoleClient();
  await service
    .from('unified_assessment_sessions')
    .delete()
    .eq('member_id', memberId)
    .eq('assessment_definition_id', definitionId);
  await service
    .from('assessment_attempts')
    .delete()
    .eq('member_id', memberId)
    .eq('source_table', 'unified_assessment_sessions');
}

async function completedRows() {
  const service = serviceRoleClient();
  const { data } = await service
    .from('unified_assessment_sessions')
    .select('id, status, completed_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', definitionId)
    .eq('status', 'completed');
  return data ?? [];
}

beforeAll(async () => {
  await seedMember();
  await seedFixture();
});
beforeEach(clearSessions);
afterAll(async () => {
  await clearSessions();
  const service = serviceRoleClient();
  if (definitionId) await service.from('unified_assessment_definitions').delete().eq('id', definitionId);
  if (memberId) await service.auth.admin.deleteUser(memberId);
});

describe('guard 4 — one finish writes one completion, across the race the bug exposed', () => {
  it('the same completion asked for twice in a row stamps one row, one time', async () => {
    const client = await signInAsFixtureMember();
    const started = await startOrResumeSession(client, memberId, FIXTURE_KEY);
    if (started.status !== 'started') throw new Error(`expected a fresh session, got ${started.status}`);
    await persistAnswer(client, started.session.id, questionId, true);

    const first = await completeSession(client, started.session.id);
    const second = await completeSession(client, started.session.id);

    expect(first.session.completedAt).not.toBeNull();
    expect(second.session.completedAt).toBe(first.session.completedAt);

    const rows = await completedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.completed_at).toBe(first.session.completedAt);
  });

  it('two completions fired at once, the way one tap plus one re-render fired them, still stamp one row', async () => {
    const client = await signInAsFixtureMember();
    const started = await startOrResumeSession(client, memberId, FIXTURE_KEY);
    if (started.status !== 'started') throw new Error(`expected a fresh session, got ${started.status}`);
    await persistAnswer(client, started.session.id, questionId, true);

    const [a, b] = await Promise.all([
      completeSession(client, started.session.id),
      completeSession(client, started.session.id),
    ]);

    expect(a.session.completedAt).toBe(b.session.completedAt);

    const rows = await completedRows();
    expect(rows).toHaveLength(1);
  });

  it('the completion instant it hands back is the one really stored, so the sitting is measured from her finish', async () => {
    const client = await signInAsFixtureMember();
    const started = await startOrResumeSession(client, memberId, FIXTURE_KEY);
    if (started.status !== 'started') throw new Error(`expected a fresh session, got ${started.status}`);
    await persistAnswer(client, started.session.id, questionId, true);
    await completeSession(client, started.session.id);

    const reread = await startOrResumeSession(client, memberId, FIXTURE_KEY);
    expect(reread.status).toBe('already_completed');
    if (reread.status !== 'already_completed') return;

    const rows = await completedRows();
    expect(reread.latestCompletedAt).toBe(rows[0]!.completed_at);
    expect(
      decideFinishedSessionDestination({
        hasInFlowClosing: true,
        completedAt: reread.latestCompletedAt,
        nowMs: new Date(reread.latestCompletedAt!).getTime() + 1000,
      })
    ).toBe('closing');
  });
});
