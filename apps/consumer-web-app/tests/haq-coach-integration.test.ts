/**
 * THE COACH'S READING, THE MEMBER'S RESULTS, AND A RETAKE, against the real
 * database through the real server actions under real row level security.
 *
 * Only the two things a test runner cannot supply are stood in for: the
 * request's Supabase client is the signed in test client, and a redirect is
 * recorded instead of thrown into Next's router.
 *
 * WHAT THIS PROVES, and a unit test cannot:
 *   coach numbers   every raw total, colour, label, priority and hidden
 *                   value on his screen equals the row the database stored
 *   drivers first   the answers of a section arrive highest value first
 *   access          an unassigned coach reads nothing, and a MEMBER session
 *                   reads zero rows from every table holding a number
 *   her results     colours and labels only, Red then Yellow then Green,
 *                   counts summing to 21, and no number in the payload
 *   retake          a second sitting is a second instance, and the first one
 *                   is byte for byte what it was through assignment, taking
 *                   and completion
 *   trend           two sittings produce Quieter, Unchanged and Louder on
 *                   both her page and his, from real stored colours
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
const { getClientHaqPanelAction, getClientHaqSittingAction } = await import('../app/actions/haqCoachReading');
const { buildHaqState } = await import('../lib/haq/service');
const { buildHaqMemberResults, haqResultCounts } = await import('../lib/haq/results');
const { HAQ_KEY } = await import('../lib/haq/constants');
const { HAQ_QUESTIONS, HAQ_SECTIONS } = await import('../lib/haq/questionBank');
const { getUnifiedAssessmentDefinitionByKey } = await import('../lib/assessment-foundation/repository');
const { answersForSectionTotals } = await import('./haq-fixture');
const { clearHaqLedger } = await import('./haq-ledger-fixture');
const { SPEC_BOUNDARIES } = await import('./haq-spec');

const memberId = TEST_USERS.memberOne.id;
const otherMemberId = TEST_USERS.memberTwo.id;

let member: SupabaseClient;
let coach: SupabaseClient;
let definitionId: string;
const questionIdByKey = new Map<string, string>();

/** The cutoffs, from the specification's own copy rather than from the code under test. */
const BOUNDARY = new Map(
  SPEC_BOUNDARIES.map(([sectionId, greenTop, yellowBottom, yellowTop, redBottom]) => [
    sectionId,
    { greenTop, yellowBottom, yellowTop, redBottom },
  ])
);

/**
 * THE SHAPE THE TEST MEMBER'S REAL SITTING HAS ON PRODUCTION: 13 Red, 1
 * Yellow, 7 Green, so the ordering and the counts are asserted against the
 * distribution the brief names.
 */
function firstSittingTotals(): Record<string, number> {
  const totals: Record<string, number> = {};
  HAQ_SECTIONS.forEach((section, index) => {
    const bounds = BOUNDARY.get(section.id)!;
    totals[section.id] = index < 13 ? bounds.redBottom : index === 13 ? bounds.yellowBottom : 0;
  });
  return totals;
}

/**
 * The retake, chosen so each of the three trends really occurs: the first
 * section drops from Red to Green (Quieter), the fourteenth rises from
 * Yellow to Red (Louder), and everything else stays where it was
 * (Unchanged).
 */
function secondSittingTotals(): Record<string, number> {
  const totals = firstSittingTotals();
  totals[HAQ_SECTIONS[0]!.id] = 0;
  totals[HAQ_SECTIONS[13]!.id] = BOUNDARY.get(HAQ_SECTIONS[13]!.id)!.redBottom;
  return totals;
}

async function as<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  currentClient = client;
  try {
    return await run();
  } finally {
    currentClient = null;
  }
}

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
  const { error } = await member
    .from('unified_assessment_answers')
    .upsert(rows, { onConflict: 'session_id,question_id' });
  if (error) throw new Error(error.message);
}

/** A whole sitting, from the coach's Assign to her Complete, exactly as the product does it. */
async function completeOneSitting(totals: Record<string, number>): Promise<string> {
  expect(await as(coach, () => assignHaqAction(memberId))).toEqual({ ok: true });
  expect(await as(member, () => redirectOf(() => actions.beginHaqAction()))).toBe('/health-appraisal');
  const state = await buildHaqState(member, memberId);
  if (!state || state.status !== 'in_progress') throw new Error('no open instance');
  await answerDirectly(state.sessionId, answersForSectionTotals(totals));
  expect(await as(member, () => actions.completeHaqAction())).toEqual({ ok: true });
  return state.sessionId;
}

/**
 * Everything the database holds about one sitting, ordered, as one string.
 * Two of these being equal is what "byte for byte identical" means here.
 */
async function fingerprint(sessionId: string): Promise<string> {
  const service = serviceRoleClient();
  const [session, responses, results, marks, answers] = await Promise.all([
    service
      .from('unified_assessment_sessions')
      .select('id, member_id, assessment_definition_id, assessment_version, status, started_at, completed_at')
      .eq('id', sessionId)
      .single(),
    service
      .from('haq_question_responses')
      .select('question_key, part_id, section_id, question_version, response_type, selected_response, hidden_value, answered_at')
      .eq('session_id', sessionId)
      .order('question_key'),
    service
      .from('haq_section_results')
      .select('section_id, raw_total, result_color, member_result_label, original_priority, haq_version, computed_at')
      .eq('session_id', sessionId)
      .order('section_id'),
    service
      .from('haq_body_map_entries')
      .select('body_location, body_side, issue_type, created_at')
      .eq('session_id', sessionId)
      .order('created_at')
      .order('id'),
    service
      .from('unified_assessment_answers')
      .select('question_id, value')
      .eq('session_id', sessionId)
      .order('question_id'),
  ]);
  return JSON.stringify({
    session: session.data,
    responses: responses.data,
    results: results.data,
    marks: marks.data,
    answers: answers.data,
  });
}

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

/** Every number anywhere inside a value, with the path it sits at. */
function numericLeaves(value: unknown, at = '$'): string[] {
  if (typeof value === 'number') return [at];
  if (Array.isArray(value)) return value.flatMap((item, index) => numericLeaves(item, `${at}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => numericLeaves(item, `${at}.${key}`));
  }
  return [];
}

/* ------------------------------------------------------------------ */

let firstSessionId: string;
let firstFingerprint: string;
let secondSessionId: string;

beforeAll(async () => {
  member = await signInAs(TEST_USERS.memberOne);
  coach = await signInAs(TEST_USERS.coachOne);
  const service = serviceRoleClient();
  const definition = await getUnifiedAssessmentDefinitionByKey(service, HAQ_KEY);
  if (!definition) throw new Error('HAQ definition missing, has migration 262 been applied?');
  definitionId = definition.id;
  const { data } = await service
    .from('unified_assessment_questions')
    .select('id, question_key')
    .eq('assessment_definition_id', definitionId)
    // Active rows only: a reworded question keeps its key and gains a version.
    .eq('active', true)
    .order('id');
  for (const row of data ?? []) questionIdByKey.set(row.question_key as string, row.id as string);

  await clearEverything();

  // ONE SITTING, THE WHOLE WAY THROUGH, plus two body map marks.
  firstSessionId = await completeOneSitting(firstSittingTotals());
  // ONE AT A TIME, a moment apart, because that is how she makes them and
  // because the coach's list is "oldest first, in the order she made them".
  for (const mark of [
    { body_location: 'abdomen', body_side: 'front', issue_type: 'discomfort' },
    { body_location: 'right_shoulder_back', body_side: 'back', issue_type: 'skin_change' },
  ]) {
    const { error: markError } = await service
      .from('haq_body_map_entries')
      .insert({ session_id: firstSessionId, member_id: memberId, ...mark });
    if (markError) throw new Error(markError.message);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  firstFingerprint = await fingerprint(firstSessionId);
}, 180_000);

afterAll(async () => {
  await clearEverything();
});

describe('the coach reads exactly what the database stored', () => {
  it('every raw total, colour, member label and priority on his screen equals its own row', async () => {
    const service = serviceRoleClient();
    const { data: stored } = await service
      .from('haq_section_results')
      .select('section_id, raw_total, result_color, member_result_label, original_priority')
      .eq('session_id', firstSessionId);
    expect(stored).toHaveLength(21);

    const sitting = await as(coach, () => getClientHaqSittingAction(firstSessionId));
    expect(sitting).not.toBeNull();
    expect(sitting!.sections).toHaveLength(21);
    expect(sitting!.haqVersion).toBe('haq_v1');
    expect(sitting!.completedAt).toBeTruthy();

    const byId = new Map(stored!.map((row) => [row.section_id, row]));
    for (const section of sitting!.sections) {
      const row = byId.get(section.sectionId)!;
      expect(section.rawTotal, section.sectionId).toBe(row.raw_total);
      expect(section.resultColor, section.sectionId).toBe(row.result_color);
      expect(section.memberResultLabel, section.sectionId).toBe(row.member_result_label);
      expect(section.originalPriority, section.sectionId).toBe(row.original_priority);
    }

    // And the shape the brief names.
    const counts = { red: 0, yellow: 0, green: 0 };
    for (const section of sitting!.sections) counts[section.resultColor] += 1;
    expect(counts).toEqual({ red: 13, yellow: 1, green: 7 });

    const colors = sitting!.sections.map((section) => section.resultColor);
    expect(colors.lastIndexOf('red')).toBeLessThan(colors.indexOf('yellow'));
    expect(colors.lastIndexOf('yellow')).toBeLessThan(colors.indexOf('green'));
  });

  it('every answer carries the hidden value the database stored, drivers first, and the totals add up', async () => {
    const service = serviceRoleClient();
    const { data: stored } = await service
      .from('haq_question_responses')
      .select('question_key, section_id, selected_response, hidden_value')
      .eq('session_id', firstSessionId);
    expect(stored).toHaveLength(260);
    const byKey = new Map(stored!.map((row) => [row.question_key, row]));

    const sitting = (await as(coach, () => getClientHaqSittingAction(firstSessionId)))!;
    let seen = 0;
    for (const section of sitting.sections) {
      const expectedKeys = HAQ_QUESTIONS.filter((q) => q.sectionId === section.sectionId).map((q) => q.key);
      expect(section.questions.map((q) => q.questionKey).sort(), section.sectionId).toEqual([...expectedKeys].sort());

      const values = section.questions.map((question) => question.hiddenValue);
      // HIGHEST FIRST: the reason for the result is the first thing he reads.
      expect([...values], section.sectionId).toEqual([...values].sort((a, b) => b - a));
      // AND NOBODY ADDS ANYTHING UP BY HAND: the answers sum to the stored total.
      expect(values.reduce((sum, value) => sum + value, 0), section.sectionId).toBe(section.rawTotal);

      for (const question of section.questions) {
        const row = byKey.get(question.questionKey)!;
        expect(question.hiddenValue, question.questionKey).toBe(row.hidden_value);
        expect(question.selectedResponse, question.questionKey).toBe(row.selected_response);
      }
      seen += section.questions.length;
    }
    expect(seen).toBe(260);
  });

  it('shows the body map on the sitting, with each mark\'s own area and category', async () => {
    const sitting = (await as(coach, () => getClientHaqSittingAction(firstSessionId)))!;
    expect(sitting.marks.map((mark) => [mark.side, mark.location, mark.category])).toEqual([
      ['front', 'abdomen', 'Discomfort'],
      ['back', 'right_shoulder_back', 'Skin change'],
    ]);
  });

  it('lists the sitting on the client Detail card, by its completion date', async () => {
    const panel = await as(coach, () => getClientHaqPanelAction(memberId));
    expect(panel.memberId).toBe(memberId);
    expect(panel.sessions.map((sitting) => sitting.sessionId)).toEqual([firstSessionId]);
    expect(panel.sessions[0]!.counts).toEqual({ red: 13, yellow: 1, green: 7 });
    expect(panel.sessions[0]!.hasResults).toBe(true);
  });
});

describe('who may read it', () => {
  it('a coach who is not this member\'s coach reads nothing, by panel or by sitting', async () => {
    const otherPanel = await as(coach, () => getClientHaqPanelAction(otherMemberId));
    expect(otherPanel.sessions).toEqual([]);
  });

  it('the member\'s own session receives zero rows from every table holding a number', async () => {
    for (const table of [
      'haq_response_scale',
      'haq_section_cutoffs',
      'haq_question_responses',
      'haq_section_results',
    ]) {
      const { data } = await member.from(table).select('*');
      expect(data, table).toEqual([]);
    }
    // Including for her own finished sitting, named directly.
    const { data: mine } = await member.from('haq_section_results').select('*').eq('session_id', firstSessionId);
    expect(mine).toEqual([]);

    // And the coach's own reading, run as HER, hands back nothing.
    expect(await as(member, () => getClientHaqSittingAction(firstSessionId))).toBeNull();
    expect((await as(member, () => getClientHaqPanelAction(memberId))).sessions).toEqual([]);
  });

  it('the Part names are content, so she can read them', async () => {
    const { data } = await member.from('haq_parts').select('part_id, part_name').order('display_order');
    expect(data).toHaveLength(10);
    expect(data![0]).toEqual({ part_id: 'haq_p1', part_name: 'Gastrointestinal' });
    expect(data![9]).toEqual({ part_id: 'haq_p10', part_name: 'CNS & Brain' });
  });
});

describe('her own results page, from the real database', () => {
  it('is colours and labels only, Red then Yellow then Green, counting to 21, with no number in the payload', async () => {
    const results = await buildHaqMemberResults(member, memberId);
    expect(results).not.toBeNull();
    expect(results!.cards).toHaveLength(21);

    const counts = haqResultCounts(results!.cards);
    expect(counts).toEqual({ red: 13, yellow: 1, green: 7 });
    expect(counts.red + counts.yellow + counts.green).toBe(21);

    const colors = results!.cards.map((card) => card.resultColor);
    expect(colors.lastIndexOf('red')).toBeLessThan(colors.indexOf('yellow'));
    expect(colors.lastIndexOf('yellow')).toBeLessThan(colors.indexOf('green'));

    // NO NUMBER AT ALL travels with them.
    expect(numericLeaves(results)).toEqual([]);
    expect(JSON.stringify(results)).not.toMatch(/raw_total|rawTotal|hidden|cutoff|priority|score/i);

    // And her colours agree with the database's own, section by section.
    const { data: stored } = await serviceRoleClient()
      .from('haq_section_results')
      .select('section_id, result_color, member_result_label')
      .eq('session_id', firstSessionId);
    const byId = new Map(stored!.map((row) => [row.section_id, row]));
    for (const card of results!.cards) {
      expect(card.resultColor, card.sectionId).toBe(byId.get(card.sectionId)!.result_color);
      expect(card.memberResultLabel, card.sectionId).toBe(byId.get(card.sectionId)!.member_result_label);
    }
  });

  it('carries no trend and no comparison while she has only one sitting', async () => {
    const results = await buildHaqMemberResults(member, memberId);
    expect(results!.hasPrevious).toBe(false);
    expect(results!.cards.every((card) => card.trend === null)).toBe(true);
  });

  it('the completed card on her shelf opens the results page', async () => {
    const { buildCoachAssignedCatalogCard, COACH_ASSIGNED_QUESTIONNAIRES } = await import(
      '../lib/questionnaires/coachAssignedQuestionnaires'
    );
    const haq = COACH_ASSIGNED_QUESTIONNAIRES.find((q) => q.key === 'haq')!;
    const card = buildCoachAssignedCatalogCard(haq, {
      status: 'completed',
      session: { completedAt: '2026-09-17T14:00:00.000Z' },
    });
    expect(card.primaryHref).toBe('/health-appraisal/results');
    expect(card.resultHref).toBe('/health-appraisal/results');
  });
});

describe('a retake adds a sitting and changes nothing about the one before it', () => {
  it('completes a second instance, leaves the first exactly as it was, and shows both', async () => {
    // The whole journey again: the coach assigns, she begins, she answers, she completes.
    secondSessionId = await completeOneSitting(secondSittingTotals());
    expect(secondSessionId).not.toBe(firstSessionId);

    // BYTE FOR BYTE. Session row, 260 responses, 21 results, both body map
    // marks and every runtime answer, all exactly as they were before the
    // second assignment existed.
    expect(await fingerprint(firstSessionId)).toBe(firstFingerprint);
    // And the fingerprint really does tell two sittings apart, so "equal"
    // above is a claim and not an accident of an empty comparison.
    expect(await fingerprint(secondSessionId)).not.toBe(firstFingerprint);
    expect(firstFingerprint).toContain('haq_p1_a');

    const { count } = await serviceRoleClient()
      .from('unified_assessment_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .eq('assessment_definition_id', definitionId);
    expect(count).toBe(2);

    const panel = await as(coach, () => getClientHaqPanelAction(memberId));
    expect(panel.sessions.map((sitting) => sitting.sessionId)).toEqual([secondSessionId, firstSessionId]);
    expect(panel.sessions[1]!.counts).toEqual({ red: 13, yellow: 1, green: 7 });
  });

  it('the coach sees the previous colour and raw total beside the current ones, with the same three words', async () => {
    const sitting = (await as(coach, () => getClientHaqSittingAction(secondSessionId)))!;
    expect(sitting.previousSitting?.sessionId).toBe(firstSessionId);
    expect(sitting.sections.every((section) => section.previous !== null)).toBe(true);

    const find = (sectionId: string) => sitting.sections.find((section) => section.sectionId === sectionId)!;
    const quieter = find(HAQ_SECTIONS[0]!.id);
    expect(quieter.previous!.resultColor).toBe('red');
    expect(quieter.resultColor).toBe('green');
    expect(quieter.previous!.trend).toBe('quieter');
    expect(quieter.previous!.rawTotal).toBeGreaterThan(quieter.rawTotal);

    const louder = find(HAQ_SECTIONS[13]!.id);
    expect(louder.previous!.resultColor).toBe('yellow');
    expect(louder.resultColor).toBe('red');
    expect(louder.previous!.trend).toBe('louder');

    const unchanged = find(HAQ_SECTIONS[1]!.id);
    expect(unchanged.previous!.trend).toBe('unchanged');
    expect(unchanged.previous!.rawTotal).toBe(unchanged.rawTotal);

    // Every previous total equals what that sitting actually stored.
    const { data: stored } = await serviceRoleClient()
      .from('haq_section_results')
      .select('section_id, raw_total, result_color')
      .eq('session_id', firstSessionId);
    const byId = new Map(stored!.map((row) => [row.section_id, row]));
    for (const section of sitting.sections) {
      expect(section.previous!.rawTotal, section.sectionId).toBe(byId.get(section.sectionId)!.raw_total);
      expect(section.previous!.resultColor, section.sectionId).toBe(byId.get(section.sectionId)!.result_color);
    }

    // The first sitting itself still has nothing to compare with.
    const older = (await as(coach, () => getClientHaqSittingAction(firstSessionId)))!;
    expect(older.previousSitting).toBeNull();
    expect(older.sections.every((section) => section.previous === null)).toBe(true);
  });

  it('her results page now carries the comparison, and all three trends really occur', async () => {
    const results = await buildHaqMemberResults(member, memberId);
    expect(results!.hasPrevious).toBe(true);
    expect(results!.cards).toHaveLength(21);
    expect(results!.cards.every((card) => card.trend !== null)).toBe(true);
    expect(new Set(results!.cards.map((card) => card.trend))).toEqual(
      new Set(['quieter', 'unchanged', 'louder'])
    );

    const find = (sectionId: string) => results!.cards.find((card) => card.sectionId === sectionId)!;
    expect(find(HAQ_SECTIONS[0]!.id).trend).toBe('quieter');
    expect(find(HAQ_SECTIONS[13]!.id).trend).toBe('louder');
    expect(find(HAQ_SECTIONS[1]!.id).trend).toBe('unchanged');

    // Still no number of any kind.
    expect(numericLeaves(results)).toEqual([]);
    // The new sitting's own shape: the Red section that went Green left Red
    // for Green, and the one Yellow section became Red, so Red is still 13,
    // Yellow is empty and Green has gained one. Still 21 in total.
    const counts = haqResultCounts(results!.cards);
    expect(counts.red + counts.yellow + counts.green).toBe(21);
    expect(counts).toEqual({ red: 13, yellow: 0, green: 8 });
  });

  it('and the first sitting is still byte for byte what it was, after everything above', async () => {
    expect(await fingerprint(firstSessionId)).toBe(firstFingerprint);
  });
});
