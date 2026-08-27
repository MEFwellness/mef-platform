/**
 * The Visibility Layer — gathering what the rules read.
 *
 * One member, one batch of reads, one context object. Everything a rule
 * can look at is here, so no rule can accidentally cost a query and every
 * rule in the catalog is testable against a plain object.
 *
 * Two of the four rule inputs come from systems that already exist and are
 * deliberately NOT re-derived here:
 *
 *   findings and tiers  from lib/member-interpretation, which is
 *                       request-memoized, so Home asking for visibility and
 *                       Home asking for its Root Map cost one computation
 *                       between them. Reading canonical findings rather
 *                       than raw registry rows is the whole reason
 *                       visibility and interpretation cannot disagree.
 *   assessment facts    from lib/assessment-registry/facts.ts, the same
 *                       batched query the questionnaire catalog already
 *                       runs.
 *
 * Best effort throughout. A failed read leaves that signal at zero, which
 * hides rather than reveals, which is the safe direction for everything
 * except the safety-critical features, and those are never decided by a
 * rule at all.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssessmentKey } from '../assessment-registry/types';
import { getMemberAssessmentFacts } from '../assessment-registry/facts';
import { hasEverCompleted } from '../assessment-registry/status';
import { buildMemberInterpretation } from '../member-interpretation/service';
import { getMemberRestrictedTopics } from '../feed/data';
import { F } from './catalog';
import type { VisibilityContext, IntakeAnswerValue } from './rules';
import { emptyVisibilityContext } from './rules';
import type { BehaviorSignal, FeatureKey, TouchSignal } from './types';

/**
 * Her intake answers, by question key, from her most recent submission.
 *
 * The MOST RECENT and not the baseline, deliberately: if she has done the
 * intake again and now says her sleep is fine, the app should stop treating
 * sleep as the reason she is here. Only genuinely answered rows are
 * included, so "not sure" and "prefer not to answer" never satisfy a rule
 * about what she said.
 */
export async function fetchIntakeAnswers(
  supabase: SupabaseClient,
  memberId: string
): Promise<Map<string, IntakeAnswerValue>> {
  const { data: submission, error } = await supabase
    .from('onboarding_submissions')
    .select('id, assessment_version_id')
    .eq('user_id', memberId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !submission) return new Map();

  const [{ data: answerRows }, { data: questions }] = await Promise.all([
    supabase
      .from('onboarding_answers')
      .select('question_id, answer_status, value_numeric, value_enum, value_multi_select, value_boolean, value_free_text')
      .eq('submission_id', (submission as { id: string }).id),
    supabase
      .from('onboarding_questions')
      .select('id, question_key, answer_type')
      .eq('assessment_version_id', (submission as { assessment_version_id: string }).assessment_version_id),
  ]);

  const keyByQuestionId = new Map(
    (questions ?? []).map((q) => [
      (q as { id: string }).id,
      { key: (q as { question_key: string }).question_key, type: (q as { answer_type: string }).answer_type },
    ] as const)
  );

  const answers = new Map<string, IntakeAnswerValue>();
  for (const row of answerRows ?? []) {
    const typed = row as {
      question_id: string;
      answer_status: string;
      value_numeric: number | null;
      value_enum: string | null;
      value_multi_select: string[] | null;
      value_boolean: boolean | null;
      value_free_text: string | null;
    };
    if (typed.answer_status !== 'answered') continue;
    const question = keyByQuestionId.get(typed.question_id);
    if (!question) continue;

    const value: IntakeAnswerValue =
      question.type === 'numeric'
        ? typed.value_numeric
        : question.type === 'enum'
          ? typed.value_enum
          : question.type === 'multi_select'
            ? typed.value_multi_select
            : question.type === 'boolean'
              ? typed.value_boolean
              : typed.value_free_text;

    if (value === null || value === undefined) continue;
    answers.set(question.key, value);
  }

  return answers;
}

/**
 * One count, failing to zero. Zero hides rather than reveals, which is the
 * safe direction for every behaviour rule; the safety-critical features are
 * never decided by a rule at all, so a read failure can never take one of
 * those away.
 */
async function countRows(
  supabase: SupabaseClient,
  table: string,
  column: string,
  memberId: string,
  filters: Array<[column: string, value: string]> = [],
  notNullColumn?: string
): Promise<number> {
  try {
    let query = supabase.from(table).select('id', { count: 'exact', head: true }).eq(column, memberId);
    for (const [name, value] of filters) query = query.eq(name, value);
    if (notNullColumn) query = query.not(notNullColumn, 'is', null);
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

type ProfileFacts = { created_at: string | null; reset_plan_granted_at: string | null };

async function fetchProfileFacts(
  supabase: SupabaseClient,
  memberId: string
): Promise<ProfileFacts | null> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('created_at, reset_plan_granted_at')
      .eq('id', memberId)
      .maybeSingle();
    return (data as ProfileFacts | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Everything the layer needs for one member, in one batch.
 *
 * `coachView` is passed through to the interpretation layer so that a
 * coach looking at a client's visibility screen sees what her rules
 * actually resolve to, rather than a safety-suppressed version of it.
 */
export async function buildVisibilityContext(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  options: { coachView?: boolean } = {}
): Promise<VisibilityContext> {
  const context = emptyVisibilityContext();

  const [
    intakeAnswers,
    interpretation,
    assessmentFacts,
    restrictedTopics,
    checkinDays,
    movementDays,
    foodEntries,
    wearables,
    profile,
    experiments,
    habits,
    weeklyReviews,
    rootScoreSnapshots,
  ] = await Promise.all([
    fetchIntakeAnswers(supabase, memberId).catch(() => new Map<string, IntakeAnswerValue>()),
    buildMemberInterpretation(
      supabase,
      memberId,
      localDate,
      options.coachView === undefined ? {} : { coachView: options.coachView }
    ).catch(() => null),
    getMemberAssessmentFacts(supabase, memberId).catch(() => null),
    getMemberRestrictedTopics(supabase, memberId).catch(() => [] as string[]),
    countRows(supabase, 'daily_checkins_current', 'user_id', memberId),
    countRows(supabase, 'daily_checkins_current', 'user_id', memberId, [], 'movement_today'),
    countRows(supabase, 'member_food_log', 'member_id', memberId),
    countRows(supabase, 'wearable_connections', 'member_id', memberId, [['status', 'connected']]),
    fetchProfileFacts(supabase, memberId),
    countRows(supabase, 'lifestyle_experiments', 'member_id', memberId),
    countRows(supabase, 'habits', 'user_id', memberId),
    countRows(supabase, 'member_weekly_reviews', 'member_id', memberId),
    countRows(supabase, 'root_score_snapshots', 'member_id', memberId),
  ]);

  context.intakeAnswers = intakeAnswers;

  if (interpretation) {
    context.findings = interpretation.findings;
    context.domainStates = new Map(
      interpretation.domains.map((d) => [d.domain, d.state] as const)
    );
  }

  const behavior: Record<BehaviorSignal, number> = {
    checkin_days: checkinDays,
    movement_days: movementDays,
    food_entries: foodEntries,
    assessments_completed: 0,
    wearables_connected: wearables,
    days_since_signup: profile?.created_at
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (24 * 60 * 60 * 1000))
        )
      : 0,
  };

  const coachAssigned = new Set<FeatureKey>();

  if (assessmentFacts) {
    for (const [key, facts] of assessmentFacts.entries()) {
      if (hasEverCompleted(facts)) {
        context.completedAssessmentKeys.add(key as AssessmentKey);
        behavior.assessments_completed += 1;
      }
      // "Started but not finished" is touching it too (rule 2), so an
      // in-progress draft counts for grandfathering exactly as a completed
      // attempt does.
      if (facts.completionStatus === 'in_progress') {
        context.completedAssessmentKeys.add(key as AssessmentKey);
      }
      if (facts.pendingAssignment || facts.pendingReassessmentSchedule) {
        coachAssigned.add(`assessment.${key}`);
        // The Home cards and the feature screens that front the same
        // assessment are assigned along with it, so a coach assignment
        // does not reveal the questionnaire while leaving its own card
        // hidden.
        if (key === 'body-assessment') {
          coachAssigned.add(F.homeMovementAssessmentCard);
          coachAssigned.add(F.featureBodyAssessment);
        }
        coachAssigned.add(F.homeInviteCards);
        coachAssigned.add(F.homeQuestionnairesCard);
        coachAssigned.add(F.featureQuestionnaires);
      }
    }
  }

  if (profile?.reset_plan_granted_at) {
    coachAssigned.add(F.homeResetPlan);
    coachAssigned.add(F.featureResetPlan);
  }

  // Assigned programs and workouts. A member with any assigned workout row
  // has a coach who put a program in front of her.
  const assignedWorkouts = await countRows(supabase, 'coach_assigned_workouts', 'member_id', memberId);
  if (assignedWorkouts > 0) {
    coachAssigned.add(F.homeAssignedPrograms);
    coachAssigned.add(F.featurePrograms);
  }

  context.behavior = behavior;
  context.coachAssignedFeatureKeys = coachAssigned;
  context.safetyActive = restrictedTopics.length > 0;

  const touch = new Set<TouchSignal>();
  if (profile?.reset_plan_granted_at) touch.add('has_reset_plan');
  if (experiments > 0) touch.add('has_active_experiment');
  if (weeklyReviews > 0) touch.add('has_weekly_review');
  if (rootScoreSnapshots > 0) touch.add('has_root_score_snapshot');
  if (habits > 0) touch.add('has_habit');
  if ((interpretation?.findings.length ?? 0) > 0) touch.add('has_registry_finding');
  context.touchSignals = touch;

  return context;
}
