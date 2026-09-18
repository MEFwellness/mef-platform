/**
 * EVERY HAQ READ THE COACH SIDE MAKES, and none of them is on the member's
 * import graph.
 *
 * A SEPARATE FILE FROM lib/haq/data.ts ON PURPOSE, the reason
 * app/actions/haqCoach.ts gives for itself: the member's own screens import
 * that module, so anything placed in it travels with them, and these reads
 * return the totals and the hidden values she must never receive.
 * tests/haq-member-safety.test.ts fails if a member file ever reaches this
 * one.
 *
 * THE COACH'S OWN SESSION IS THE PERMISSION. Every function takes the signed
 * in coach's client, so migration 262's policies decide what exists for him:
 * an active coach role AND an active assignment to this member
 * (`is_active_coach_for`), or an administrator. There is no service role
 * anywhere in this file and no second, softer check in TypeScript that could
 * disagree with the database.
 *
 * NOTHING HERE WRITES. A completed instance is write once (migration 262),
 * and reading one must never be able to disturb it: a retake is a brand new
 * instance and every earlier sitting stays byte for byte as it was.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllRows } from '@/lib/data/pagedSelect';
import { HAQ_BODY_MAP_MARK_LIMIT, isHaqBodyIssueType, isHaqBodySide, type HaqBodyMark } from './bodyMap';
import { HAQ_QUESTION_COUNT, HAQ_SECTION_COUNT } from './constants';
import type {
  HaqMemberResultLabel,
  HaqOriginalPriority,
  HaqResponseType,
  HaqResultColor,
} from './types';

/** One finished sitting's identity. A retake never replaces one, so this list only grows. */
export type HaqCoachInstance = {
  sessionId: string;
  memberId: string;
  completedAt: string | null;
  /** The instrument version this sitting was taken under, as `haq_v1`. */
  haqVersion: string;
};

/** One stored section result, exactly as the database holds it. */
export type HaqCoachSectionResultRow = {
  sessionId: string;
  sectionId: string;
  rawTotal: number;
  resultColor: HaqResultColor;
  memberResultLabel: HaqMemberResultLabel;
  originalPriority: HaqOriginalPriority;
  haqVersion: string;
};

/** One stored answer record, with the value it was worth. */
export type HaqCoachQuestionResponseRow = {
  sectionId: string;
  questionKey: string;
  /** Which wording she was asked: a reworded question keeps its key and gains a version. */
  questionVersion: number;
  responseType: HaqResponseType;
  selectedResponse: string;
  hiddenValue: number;
  answeredAt: string;
};

function versionOf(assessmentVersion: unknown): string {
  return `haq_v${typeof assessmentVersion === 'number' ? assessmentVersion : 1}`;
}

/**
 * Every finished HAQ sitting this client has, newest first.
 *
 * Paged, because a member who is sent the Health Appraisal every quarter for
 * years accumulates rows and a read that wants all of them must ask for all
 * of them. The order ends on the id so two pages can neither overlap nor
 * skip when two sittings share a completion instant.
 */
export async function listHaqCoachInstances(
  supabase: SupabaseClient,
  memberId: string,
  definitionId: string
): Promise<HaqCoachInstance[]> {
  const { ok, rows, error } = await selectAllRows<{
    id: string;
    member_id: string;
    completed_at: string | null;
    assessment_version: number | null;
  }>(() =>
    supabase
      .from('unified_assessment_sessions')
      .select('id, member_id, completed_at, assessment_version')
      .eq('member_id', memberId)
      .eq('assessment_definition_id', definitionId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .order('id', { ascending: false })
  );

  if (!ok) {
    console.error('listHaqCoachInstances failed', error);
    return [];
  }
  return rows.map((row) => ({
    sessionId: row.id,
    memberId: row.member_id,
    completedAt: row.completed_at,
    haqVersion: versionOf(row.assessment_version),
  }));
}

type SectionResultRow = {
  session_id: string;
  section_id: string;
  raw_total: number;
  result_color: string;
  member_result_label: string;
  original_priority: string;
  haq_version: string;
};

function toSectionResult(row: SectionResultRow): HaqCoachSectionResultRow {
  return {
    sessionId: row.session_id,
    sectionId: row.section_id,
    rawTotal: row.raw_total,
    resultColor: row.result_color as HaqResultColor,
    memberResultLabel: row.member_result_label as HaqMemberResultLabel,
    originalPriority: row.original_priority as HaqOriginalPriority,
    haqVersion: row.haq_version,
  };
}

/**
 * Every section result this client has, across every sitting, so the history
 * list can say what each sitting read without one request per sitting.
 *
 * Paged for the same reason the sittings are: 21 rows per sitting, forever.
 */
export async function listHaqCoachSectionResults(
  supabase: SupabaseClient,
  memberId: string
): Promise<HaqCoachSectionResultRow[]> {
  const { ok, rows, error } = await selectAllRows<SectionResultRow>(() =>
    supabase
      .from('haq_section_results')
      .select('session_id, section_id, raw_total, result_color, member_result_label, original_priority, haq_version')
      .eq('member_id', memberId)
      .order('computed_at', { ascending: false })
      .order('id', { ascending: false })
  );

  if (!ok) {
    console.error('listHaqCoachSectionResults failed', error);
    return [];
  }
  return rows.map(toSectionResult);
}

/** The 21 stored results of one sitting. */
export async function readHaqCoachSectionResults(
  supabase: SupabaseClient,
  sessionId: string
): Promise<HaqCoachSectionResultRow[]> {
  // scale-exempt: one sitting's section results, exactly 21 rows, fixed by the instrument's 21 sections
  const { data, error } = await supabase
    .from('haq_section_results')
    .select('session_id, section_id, raw_total, result_color, member_result_label, original_priority, haq_version')
    .eq('session_id', sessionId)
    .limit(HAQ_SECTION_COUNT);

  if (error) {
    console.error('readHaqCoachSectionResults failed', error);
    return [];
  }
  return ((data ?? []) as SectionResultRow[]).map(toSectionResult);
}

/**
 * The 260 stored answer records of one sitting, each with the value it was
 * worth, so the coach never has to add anything up by hand.
 */
export async function readHaqCoachQuestionResponses(
  supabase: SupabaseClient,
  sessionId: string
): Promise<HaqCoachQuestionResponseRow[]> {
  // scale-exempt: one sitting's answer records, exactly 260 rows, fixed by the instrument's 260 questions
  const { data, error } = await supabase
    .from('haq_question_responses')
    .select('section_id, question_key, question_version, response_type, selected_response, hidden_value, answered_at')
    .eq('session_id', sessionId)
    .limit(HAQ_QUESTION_COUNT);

  if (error) {
    console.error('readHaqCoachQuestionResponses failed', error);
    return [];
  }
  return ((data ?? []) as Array<{
    section_id: string;
    question_key: string;
    question_version: number;
    response_type: string;
    selected_response: string;
    hidden_value: number;
    answered_at: string;
  }>).map((row) => ({
    sectionId: row.section_id,
    questionKey: row.question_key,
    questionVersion: row.question_version,
    responseType: row.response_type as HaqResponseType,
    selectedResponse: row.selected_response,
    hiddenValue: row.hidden_value,
    answeredAt: row.answered_at,
  }));
}

/** The marks the member left on one sitting's body map, oldest first, in the order she made them. */
export async function readHaqCoachBodyMarks(
  supabase: SupabaseClient,
  sessionId: string
): Promise<HaqBodyMark[]> {
  // scale-exempt: one sitting's body map marks, capped at HAQ_BODY_MAP_MARK_LIMIT by lib/haq/data.ts
  const { data, error } = await supabase
    .from('haq_body_map_entries')
    .select('id, body_location, body_side, issue_type')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(HAQ_BODY_MAP_MARK_LIMIT);

  if (error) {
    console.error('readHaqCoachBodyMarks failed', error);
    return [];
  }
  return ((data ?? []) as Array<{ id: string; body_location: string; body_side: string; issue_type: string }>)
    .filter((row) => isHaqBodySide(row.body_side) && isHaqBodyIssueType(row.issue_type))
    .map((row) => ({
      id: row.id,
      location: row.body_location,
      side: row.body_side as HaqBodyMark['side'],
      issueType: row.issue_type as HaqBodyMark['issueType'],
    }));
}
