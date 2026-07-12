/**
 * A member's Baseline Assessment is their FIRST-EVER onboarding submission
 * — permanent, never overwritten. onboarding_submissions has no unique
 * constraint on user_id and a reserved (currently unused) superseded_at
 * column specifically so a future reassessment can insert a new row
 * without ever touching this one; "baseline" is always resolved as
 * `order by submitted_at asc limit 1`, not "the latest" or "the only,"
 * so this keeps working correctly once reassessments exist. Today only one
 * submission can exist per member (app/onboarding/page.tsx's own
 * already-submitted gate), so baseline and "the" submission are the same
 * row — but nothing here assumes that.
 *
 * Shared by both the member's own Baseline Assessment page and the coach's
 * client detail page — one query, one formatter, so a client's coach never
 * sees a different reading of the same original answers than the client
 * themselves would.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AnswerType,
  OnboardingAnswerRecord,
  OnboardingQuestion,
  OnboardingSubmission,
} from '@mef/shared-types-contracts';
import { numericRange } from './scale';

export type BaselineAnswer = {
  questionKey: string;
  promptText: string;
  domain: string;
  answerType: AnswerType;
  displayOrder: number;
  answerStatus: OnboardingAnswerRecord['answer_status'];
  value: string | number | boolean | string[] | null;
};

export type BaselineAssessment = {
  submissionId: string;
  submittedAt: string;
  localDate: string;
  timezone: string;
  answers: BaselineAnswer[];
};

export const DOMAIN_ORDER = [
  'all',
  'sleep',
  'mind_stress',
  'movement_energy',
  'nutrition_digestion',
  'pain_structural',
] as const;

export const DOMAIN_LABEL: Record<string, string> = {
  all: 'General',
  sleep: 'Sleep',
  mind_stress: 'Mind & Stress',
  movement_energy: 'Movement & Energy',
  nutrition_digestion: 'Nutrition & Digestion',
  pain_structural: 'Pain & Structure',
};

function resolveAnswerValue(
  row: OnboardingAnswerRecord,
  answerType: AnswerType
): string | number | boolean | string[] | null {
  if (row.answer_status !== 'answered') return null;
  switch (answerType) {
    case 'numeric':
      return row.value_numeric;
    case 'enum':
      return row.value_enum;
    case 'multi_select':
      return row.value_multi_select;
    case 'boolean':
      return row.value_boolean;
    case 'free_text':
      return row.value_free_text;
    default:
      return null;
  }
}

/** Pure assembly — no I/O, so it's trivially testable and reusable regardless of how the rows were fetched. */
export function buildBaselineAssessment(
  submission: OnboardingSubmission,
  questions: OnboardingQuestion[],
  answerRows: OnboardingAnswerRecord[]
): BaselineAssessment {
  const rowByQuestionId = new Map(answerRows.map((row) => [row.question_id, row]));

  const answers: BaselineAnswer[] = questions
    .map((question) => {
      const row = rowByQuestionId.get(question.id);
      if (!row) return null;
      return {
        questionKey: question.question_key,
        promptText: question.prompt_text,
        domain: question.domain,
        answerType: question.answer_type,
        displayOrder: question.display_order,
        answerStatus: row.answer_status,
        value: resolveAnswerValue(row, question.answer_type),
      };
    })
    .filter((a): a is BaselineAnswer => a !== null);

  return {
    submissionId: submission.id,
    submittedAt: submission.submitted_at,
    localDate: submission.local_date,
    timezone: submission.timezone,
    answers,
  };
}

/**
 * Fetches the caller's earliest onboarding submission plus every answer,
 * joined against the current question text/domain/order. Relies entirely
 * on RLS (member_read_own_submissions / coach_read_assigned_submissions,
 * migration 16) to decide whose baseline the caller is even allowed to
 * see — this function makes no role decision of its own; pass in a
 * supabase client authenticated as whoever is asking, and the query
 * simply returns nothing if they're not authorized.
 */
export async function fetchBaselineAssessment(
  supabase: SupabaseClient,
  userId: string
): Promise<BaselineAssessment | null> {
  const { data: submission, error: submissionError } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (submissionError || !submission) return null;

  const [{ data: answerRows }, { data: questions }] = await Promise.all([
    supabase.from('onboarding_answers').select('*').eq('submission_id', submission.id),
    supabase
      .from('onboarding_questions')
      .select('*')
      .eq('assessment_version_id', submission.assessment_version_id)
      .order('display_order', { ascending: true }),
  ]);

  return buildBaselineAssessment(
    submission as OnboardingSubmission,
    (questions ?? []) as OnboardingQuestion[],
    (answerRows ?? []) as OnboardingAnswerRecord[]
  );
}

export type BaselineDomainGroup = {
  domain: string;
  label: string;
  answers: BaselineAnswer[];
};

export function groupByDomain(answers: BaselineAnswer[]): BaselineDomainGroup[] {
  const byDomain = new Map<string, BaselineAnswer[]>();
  for (const answer of answers) {
    const bucket = byDomain.get(answer.domain);
    if (bucket) bucket.push(answer);
    else byDomain.set(answer.domain, [answer]);
  }

  const knownDomains = DOMAIN_ORDER.filter((domain) => byDomain.has(domain));
  const unknownDomains = [...byDomain.keys()].filter(
    (domain) => !(DOMAIN_ORDER as readonly string[]).includes(domain)
  );

  return [...knownDomains, ...unknownDomains].map((domain) => ({
    domain,
    label: DOMAIN_LABEL[domain] ?? domain,
    answers: [...byDomain.get(domain)!].sort((a, b) => a.displayOrder - b.displayOrder),
  }));
}

const STATUS_LABEL: Record<string, string> = {
  not_sure: 'Not sure',
  not_applicable: 'Not applicable',
  prefer_not_to_answer: 'Prefer not to answer',
};

/** Human-readable rendering of a single answer — the one place that knows how to turn a raw stored value back into words. */
export function formatAnswerValue(answer: BaselineAnswer): string {
  if (answer.answerStatus !== 'answered') {
    return STATUS_LABEL[answer.answerStatus] ?? answer.answerStatus;
  }

  const { value, answerType, questionKey } = answer;
  if (value === null) return '—';

  switch (answerType) {
    case 'numeric': {
      const { max } = numericRange(questionKey);
      return `${value} / ${max}`;
    }
    case 'enum':
      return typeof value === 'string' ? value.replaceAll('_', ' ') : String(value);
    case 'multi_select':
      return Array.isArray(value)
        ? value.map((item) => item.replaceAll('_', ' ')).join(', ')
        : String(value);
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'free_text':
      return String(value);
    default:
      return String(value);
  }
}
