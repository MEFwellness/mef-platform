/**
 * The Health Appraisal member experience against the real database: the real
 * server actions, the real route handlers and the real page, run as the
 * signed in member (or coach) through her own session under real RLS.
 *
 * Only the two things a test runner cannot supply are stood in for: the
 * request's Supabase client is the signed in test client, and a redirect is
 * recorded instead of thrown into Next's router.
 *
 * WHAT THIS PROVES, and a component test cannot:
 *   gating         locked with no assignment (state, page, Begin, writes and
 *                  the database itself all refuse), open after the coach's
 *                  own Assign action, closed again by completion
 *   answers        a changed answer replaces the stored response
 *   resume         the page hands back her answers and the screen she left
 *   body map       marks store area, view and category; removal works; a
 *                  duplicate is one mark; zero marks never blocks completion;
 *                  no mark ever reaches a section total
 *   payloads       nothing the member's page or routes return carries a value
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';

let currentClient: SupabaseClient | null = null;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => currentClient,
  getRequestClient: () => currentClient,
}));

const redirects: string[] = [];
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirects.push(url);
    throw new Error(`REDIRECT:${url}`);
  },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const actions = await import('../app/actions/haq');
const { assignHaqAction } = await import('../app/actions/haqCoach');
const { POST: answerRoute } = await import('../app/api/haq/answer/route');
const { POST: bodyMapRoute } = await import('../app/api/haq/body-map/route');
const { buildHaqState } = await import('../lib/haq/service');
const { buildHaqPageProps } = await import('../lib/haq/pageProps');
const { HAQ_DEFINITION_ID, HAQ_KEY, HAQ_LABEL } = await import('../lib/haq/constants');
const { buildHaqScreens, resumeHaqScreenIndex } = await import('../lib/haq/walk');
const { getUnifiedAssessmentDefinitionByKey } = await import('../lib/assessment-foundation/repository');
const { listAssignableTemplates } = await import('../lib/assignments/assignableCatalog');
const { assignmentNameFor } = await import('../lib/assignments/experienceNames');
const { allZeroAnswers } = await import('./haq-fixture');
const { clearHaqLedger } = await import('./haq-ledger-fixture');

const memberId = TEST_USERS.memberOne.id;
const otherMemberId = TEST_USERS.memberTwo.id;
const screens = buildHaqScreens();

let member: SupabaseClient;
let coach: SupabaseClient;
let definitionId: string;
const questionIdByKey = new Map<string, string>();

async function clearEverything() {
  const service = serviceRoleClient();
  const { error } = await service
    .from('unified_assessment_sessions')
    .delete()
    .in('member_id', [memberId, otherMemberId])
    .eq('assessment_definition_id', definitionId);
  if (error) throw new Error(error.message);
  await clearHaqLedger([memberId, otherMemberId]);
}

async function as<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  currentClient = client;
  try {
    return await run();
  } finally {
    currentClient = null;
  }
}

/** Runs something that ends in a redirect, and returns where it went. */
async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  redirects.length = 0;
  await expect(run()).rejects.toThrow(/^REDIRECT:/);
  return redirects.at(-1)!;
}

async function answerDirectly(sessionId: string, answers: Record<string, string>) {
  const rows = Object.entries(answers).map(([key, value]) => ({
    session_id: sessionId,
    question_id: questionIdByKey.get(key)!,
    value,
  }));
  const { error } = await member.from('unified_assessment_answers').upsert(rows, { onConflict: 'session_id,question_id' });
  if (error) throw new Error(error.message);
}

function answersForScreens(count: number): Record<string, string> {
  const zero = allZeroAnswers();
  const out: Record<string, string> = {};
  for (const screen of screens.slice(0, count)) for (const q of screen.questions) out[q.key] = zero[q.key]!;
  return out;
}

async function openState() {
  const state = await buildHaqState(member, memberId);
  expect(state?.status).toBe('in_progress');
  return state as Extract<NonNullable<typeof state>, { status: 'in_progress' }>;
}

/** Every number anywhere inside a value, with the path it sits at. */
function numericLeaves(value: unknown, at = '$'): string[] {
  if (typeof value === 'number') return [at];
  if (Array.isArray(value)) return value.flatMap((item, index) => numericLeaves(item, `${at}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => numericLeaves(item, `${at}.${key}`));
  }
  return [];
}

const FORBIDDEN = /hidden_value|hiddenValue|raw_total|rawTotal|green_max|yellow_max|cutoff|result_color|resultColor|points|score/i;

beforeAll(async () => {
  member = await signInAs(TEST_USERS.memberOne);
  coach = await signInAs(TEST_USERS.coachOne);
  const service = serviceRoleClient();
  const definition = await getUnifiedAssessmentDefinitionByKey(service, HAQ_KEY);
  if (!definition) throw new Error('HAQ definition missing');
  definitionId = definition.id;
  const { data } = await service
    .from('unified_assessment_questions')
    .select('id, question_key')
    .eq('assessment_definition_id', definitionId)
    .order('id');
  for (const row of data ?? []) questionIdByKey.set(row.question_key as string, row.id as string);
  await clearEverything();
});

beforeEach(async () => {
  await clearEverything();
});

afterAll(async () => {
  await clearEverything();
});

describe('registration', () => {
  it('has a catalog row with its fixed id, bridged from the runtime definition', async () => {
    const service = serviceRoleClient();
    const { data: row } = await service.from('assessment_definitions').select('id, key, display_name').eq('id', HAQ_DEFINITION_ID).single();
    expect(row).toEqual({ id: HAQ_DEFINITION_ID, key: 'haq', display_name: 'Rooted Reset Health Appraisal Questionnaire' });
    const { data: def } = await service.from('unified_assessment_definitions').select('catalog_definition_id').eq('key', 'haq').single();
    expect(def?.catalog_definition_id).toBe(HAQ_DEFINITION_ID);
  });

  it('is in the coach assignable list by its own name, sent by its own action', () => {
    const row = listAssignableTemplates().find((t) => t.id === 'haq');
    expect(row).toMatchObject({ definitionId: HAQ_DEFINITION_ID, displayName: HAQ_LABEL, assignKey: null });
    expect(assignmentNameFor(HAQ_DEFINITION_ID)).toBe('Rooted Reset Health Appraisal Questionnaire');
  });
});

describe('gating: locked until a coach assigns it', () => {
  it('with no assignment: no state, the route sends her Home, Begin opens nothing, writes refuse, and so does the database', async () => {
    expect(await buildHaqState(member, memberId)).toBeNull();

    const page = (await import('../app/health-appraisal/page')).default;
    expect(await as(member, () => redirectOf(() => page()))).toBe('/dashboard');
    expect(await as(member, () => redirectOf(() => actions.beginHaqAction()))).toBe('/dashboard');
    expect(await as(member, () => actions.saveHaqAnswerAction('haq_p1_a_q1', 'often'))).toMatchObject({ ok: false });
    expect(await as(member, () => actions.completeHaqAction())).toMatchObject({ ok: false });
    expect(await as(member, () => actions.addHaqBodyMarkAction({ location: 'chest', side: 'front', issueType: 'pain' }))).toMatchObject({ ok: false });

    const { error } = await member.from('unified_assessment_sessions').insert({
      member_id: memberId,
      assessment_definition_id: definitionId,
      status: 'in_progress',
    });
    expect(error?.message).toMatch(/opens only when a coach assigns it/);

    const { count } = await serviceRoleClient()
      .from('unified_assessment_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .eq('assessment_definition_id', definitionId);
    expect(count).toBe(0);
  });

  it("the coach's own Assign action opens it, Begin opens one instance, and the route renders", async () => {
    expect(await as(coach, () => assignHaqAction(memberId))).toEqual({ ok: true });
    // A double tap is not a second assignment.
    expect(await as(coach, () => assignHaqAction(memberId))).toEqual({ ok: true });
    const { data: assignments } = await serviceRoleClient()
      .from('assessment_assignments')
      .select('status, assigned_by')
      .eq('member_id', memberId)
      .eq('assessment_definition_id', HAQ_DEFINITION_ID);
    expect(assignments).toEqual([{ status: 'pending', assigned_by: TEST_USERS.coachOne.id }]);

    expect((await buildHaqState(member, memberId))?.status).toBe('pending');
    expect(await as(member, () => redirectOf(() => actions.beginHaqAction()))).toBe('/health-appraisal');
    expect(await as(member, () => redirectOf(() => actions.beginHaqAction()))).toBe('/health-appraisal');
    const state = await openState();

    const { count } = await serviceRoleClient()
      .from('unified_assessment_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .eq('assessment_definition_id', definitionId);
    expect(count).toBe(1);

    const page = (await import('../app/health-appraisal/page')).default;
    const rendered = await as(member, () => page());
    expect(rendered).toBeTruthy();
    expect(state.sessionId).toBeTruthy();
  });

  it('a coach cannot assign it to a member who is not his client', async () => {
    const result = await as(coach, () => assignHaqAction(otherMemberId));
    expect(result.ok).toBe(false);
  });
});

describe('answers, resume and payloads', () => {
  beforeEach(async () => {
    await as(coach, () => assignHaqAction(memberId));
    await as(member, () => redirectOf(() => actions.beginHaqAction()));
  });

  it('changing an answer before completion replaces the stored response', async () => {
    const state = await openState();
    expect(await as(member, () => actions.saveHaqAnswerAction('haq_p1_a_q1', 'very_often'))).toEqual({ ok: true });
    expect(await as(member, () => actions.saveHaqAnswerAction('haq_p1_a_q1', 'sometimes'))).toEqual({ ok: true });

    const service = serviceRoleClient();
    const { data: responses } = await service
      .from('haq_question_responses')
      .select('question_key, selected_response')
      .eq('session_id', state.sessionId);
    expect(responses).toEqual([{ question_key: 'haq_p1_a_q1', selected_response: 'sometimes' }]);
    const { data: answers } = await service.from('unified_assessment_answers').select('value').eq('session_id', state.sessionId);
    expect(answers).toEqual([{ value: 'sometimes' }]);

    expect(await as(member, () => actions.saveHaqAnswerAction('haq_p1_a_q1', 'always'))).toMatchObject({ ok: false });
    expect(await as(member, () => actions.saveHaqAnswerAction('haq_p7_q31', 'often'))).toMatchObject({ ok: false });
    expect(await as(member, () => actions.saveHaqAnswerAction('not_a_question', 'often'))).toMatchObject({ ok: false });
  });

  it('exit midway through Part III and come back: her answers, the Part, the Section and the screen', async () => {
    const state = await openState();
    const partThree = screens.filter((s) => s.partNumber === 3);
    const stopAt = partThree[3]!;
    const answers = answersForScreens(stopAt.index);
    // One answer on the screen she stopped on, so she left partway through it.
    const firstOnScreen = stopAt.questions[0]!;
    answers[firstOnScreen.key] = firstOnScreen.responseType === 'frequency' ? 'often' : 'yes';
    await answerDirectly(state.sessionId, answers);

    const props = await buildHaqPageProps(member, memberId, await openState());
    expect(props.status).toBe('in_progress');
    expect(props.initialAnswers).toEqual(answers);
    expect(props.initialScreenIndex).toBe(stopAt.index);
    expect(resumeHaqScreenIndex(screens, props.initialAnswers)).toBe(stopAt.index);
    const screen = screens[props.initialScreenIndex]!;
    expect(screen.partNumber).toBe(3);
    expect(screen.section.partLabel).toBe('Part III');
    expect(screen.section.title).toBe(stopAt.section.title);
  });

  it('no member-facing payload carries a hidden value: the page props and every route response', async () => {
    const state = await openState();
    await answerDirectly(state.sessionId, answersForScreens(20));
    await as(member, () => actions.addHaqBodyMarkAction({ location: 'chest', side: 'front', issueType: 'pain' }));

    const props = await buildHaqPageProps(member, memberId, await openState());
    expect(numericLeaves(props)).toEqual(['$.initialScreenIndex']);
    expect(JSON.stringify(props)).not.toMatch(FORBIDDEN);

    const post = (body: unknown) =>
      new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

    const answered = await as(member, async () => (await answerRoute(post({ questionKey: 'haq_p5_a_q1', value: 'very_often' }))).json());
    expect(answered).toEqual({ ok: true });
    const refused = await as(member, async () => (await answerRoute(post({ questionKey: 'haq_p5_a_q1', value: 8 }))).json());
    expect(refused.ok).toBe(false);
    expect(numericLeaves(refused)).toEqual([]);

    const added = await as(member, async () =>
      (await bodyMapRoute(post({ action: 'add', location: 'lower_back', side: 'back', issueType: 'swelling' }))).json()
    );
    expect(Object.keys(added).sort()).toEqual(['mark', 'ok']);
    expect(Object.keys(added.mark).sort()).toEqual(['id', 'issueType', 'location', 'side']);
    expect(numericLeaves(added)).toEqual([]);
    const removed = await as(member, async () => (await bodyMapRoute(post({ action: 'remove', markId: added.mark.id }))).json());
    expect(removed).toEqual({ ok: true });

    // And what her own session can read of the instrument's rows: names and labels only.
    const { data: options } = await member.from('unified_assessment_questions').select('answer_options').eq('assessment_definition_id', definitionId);
    expect(options).toHaveLength(260);
    expect(numericLeaves(options)).toEqual([]);
    for (const table of ['haq_response_scale', 'haq_section_cutoffs', 'haq_question_responses', 'haq_section_results']) {
      const { data } = await member.from(table).select('*');
      expect(data, table).toEqual([]);
    }
  });
});

describe('the body map and completion', () => {
  beforeEach(async () => {
    await as(coach, () => assignHaqAction(memberId));
    await as(member, () => redirectOf(() => actions.beginHaqAction()));
  });

  it('marks store area, view and category; a duplicate is one mark; bad input is refused; removal works; nothing reaches a total', async () => {
    const state = await openState();
    const add = (input: { location: unknown; side: unknown; issueType: unknown }) => as(member, () => actions.addHaqBodyMarkAction(input));

    const knee = await add({ location: 'left_knee', side: 'front', issueType: 'swelling' });
    const back = await add({ location: 'lower_back', side: 'back', issueType: 'pain' });
    const shoulder = await add({ location: 'right_shoulder_back', side: 'back', issueType: 'skin_change' });
    const again = await add({ location: 'left_knee', side: 'front', issueType: 'swelling' });
    expect([knee.ok, back.ok, shoulder.ok, again.ok]).toEqual([true, true, true, true]);
    if (!knee.ok || !again.ok || !back.ok) throw new Error('unreachable');
    expect(again.mark.id).toBe(knee.mark.id);

    // An area the view does not carry, an unknown view, an unknown category.
    expect((await add({ location: 'lower_back', side: 'front', issueType: 'pain' })).ok).toBe(false);
    expect((await add({ location: 'chest', side: 'side', issueType: 'pain' })).ok).toBe(false);
    expect((await add({ location: 'chest', side: 'front', issueType: 'numbness' })).ok).toBe(false);

    expect(await as(member, () => actions.removeHaqBodyMarkAction(back.mark.id))).toEqual({ ok: true });

    const service = serviceRoleClient();
    const { data: rows } = await service
      .from('haq_body_map_entries')
      .select('body_location, body_side, issue_type, member_id')
      .eq('session_id', state.sessionId)
      .order('created_at');
    expect(rows).toEqual([
      { body_location: 'left_knee', body_side: 'front', issue_type: 'swelling', member_id: memberId },
      { body_location: 'right_shoulder_back', body_side: 'back', issue_type: 'skin_change', member_id: memberId },
    ]);

    await answerDirectly(state.sessionId, allZeroAnswers());
    expect(await as(member, () => actions.completeHaqAction())).toEqual({ ok: true });

    const { data: results } = await service.from('haq_section_results').select('raw_total, result_color').eq('session_id', state.sessionId);
    expect(results).toHaveLength(21);
    expect(results!.every((r) => r.raw_total === 0 && r.result_color === 'green')).toBe(true);

    // The marks she left stay, and a completed instance's marks cannot be removed.
    expect(await as(member, () => actions.removeHaqBodyMarkAction(knee.mark.id))).toMatchObject({ ok: false });
    const { count } = await service.from('haq_body_map_entries').select('id', { count: 'exact', head: true }).eq('session_id', state.sessionId);
    expect(count).toBe(2);
  });

  it('completes with zero marks, closes the assignment, and shows the completion from then on', async () => {
    const state = await openState();
    const partial = allZeroAnswers();
    delete partial.haq_p10_b_q9;
    await answerDirectly(state.sessionId, partial);

    // 259 of 260: refused, still open.
    expect(await as(member, () => actions.completeHaqAction())).toMatchObject({ ok: false });
    expect((await buildHaqState(member, memberId))?.status).toBe('in_progress');

    expect(await as(member, () => actions.saveHaqAnswerAction('haq_p10_b_q9', 'never_or_rarely'))).toEqual({ ok: true });
    expect(await as(member, () => actions.completeHaqAction())).toEqual({ ok: true });

    const service = serviceRoleClient();
    const { data: session } = await service.from('unified_assessment_sessions').select('status').eq('id', state.sessionId).single();
    expect(session?.status).toBe('completed');
    const { count: responses } = await service.from('haq_question_responses').select('id', { count: 'exact', head: true }).eq('session_id', state.sessionId);
    expect(responses).toBe(260);
    const { count: marks } = await service.from('haq_body_map_entries').select('id', { count: 'exact', head: true }).eq('session_id', state.sessionId);
    expect(marks).toBe(0);
    const { data: assignment } = await service
      .from('assessment_assignments')
      .select('status')
      .eq('member_id', memberId)
      .eq('assessment_definition_id', HAQ_DEFINITION_ID)
      .single();
    expect(assignment?.status).toBe('completed');

    const done = await buildHaqState(member, memberId);
    expect(done).toMatchObject({ status: 'completed', sessionId: state.sessionId });
    const props = await buildHaqPageProps(member, memberId, done!);
    expect(props).toEqual({ status: 'completed', initialAnswers: {}, initialMarks: [], initialScreenIndex: 0 });

    // Nothing more can be written to it, and Begin opens nothing without a new assignment.
    expect(await as(member, () => actions.saveHaqAnswerAction('haq_p1_a_q1', 'often'))).toMatchObject({ ok: false });
    expect(await as(member, () => redirectOf(() => actions.beginHaqAction()))).toBe('/health-appraisal');
    const { count: instances } = await service
      .from('unified_assessment_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .eq('assessment_definition_id', definitionId);
    expect(instances).toBe(1);
  });
});
