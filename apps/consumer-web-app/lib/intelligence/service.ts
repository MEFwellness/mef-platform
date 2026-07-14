/**
 * The Personal Wellness Intelligence Engine's orchestrator — the one
 * place that gathers real longitudinal history, runs every detector, and
 * persists the result as `wellness_insights` rows. Every fetch here reuses
 * an existing, already-tested data source (lib/feed/data.ts,
 * lib/onboarding/*, lib/safety/data.ts) rather than a second, parallel
 * query path — same discipline lib/brain/service.ts already established
 * for the Coaching Brain.
 *
 * Recalculation is idempotent-by-content: each detector's `pattern_key`
 * is the dedup key (findActiveInsightByPatternKey). Re-running against
 * the same real history either leaves an unchanged conclusion alone
 * (just bumps last_confirmed_at), supersedes it with a fresh row when the
 * conclusion has genuinely changed, or leaves a coach-annotated insight
 * (coach_context set) untouched entirely — never silently overwritten,
 * same "coach correction must influence future intelligence" requirement
 * as section 9.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DailyCheckin,
  WellnessInsight,
  WellnessTrendState,
} from '@mef/shared-types-contracts';
import { fetchBaselineAssessment } from '../onboarding/baseline';
import { fetchLatestReassessment } from '../onboarding/reassessment';
import { buildComparison, buildProgressSummary } from '../onboarding/comparison';
import { listFeedHistory, getContentItem, getMemberRestrictedTopics } from '../feed/data';
import type { FeedHistoryPair } from '../feed/memory';
import { classifyAllMetricTrends } from './trendEngine';
import {
  checkinWeekdayPattern,
  categoryWeekdayDipPattern,
  repeatedSavedNotCompletedPattern,
  disruptionRecoveryPattern,
  repeatedInterventionSuccessPattern,
  categoryEngagementImbalancePattern,
  divergencePattern,
  contentFollowedByMetricImprovementPattern,
} from './patternEngine';
import {
  strongestAreaInsight,
  mostImprovedAreaInsight,
  longestConsistencyInsight,
  sustainableHabitInsight,
} from './strengthEngine';
import { sinceBaselineInsights } from './baselineEngine';
import { computePriorityIntelligence } from './priorityIntelligence';
import { gateDraftForSafety, isSeriousPattern, routeSeriousPatternToReview } from './safety';
import {
  findActiveInsightByPatternKey,
  insertWellnessInsight,
  supersedeWellnessInsight,
  touchInsightConfirmed,
} from './data';
import { WELLNESS_METRIC_AREAS } from './types';
import type { WellnessInsightDraft } from './types';
import {
  calculateWellnessIndex,
  inputsFromCheckin,
  type WellnessMetricKey,
} from '../wellness/wellness-index';

const HISTORY_WINDOW_DAYS = 95; // covers last_90_days with a small buffer

async function fetchHistoryCheckins(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<DailyCheckin[]> {
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('*')
    .eq('user_id', memberId)
    .lte('local_date', asOfLocalDate)
    .order('local_date', { ascending: false })
    .limit(HISTORY_WINDOW_DAYS);

  if (error) {
    console.error('fetchHistoryCheckins failed', error);
    return [];
  }
  return (data as DailyCheckin[]).reverse();
}

const RESOLVED_FROM: WellnessTrendState[] = ['declining', 'recurring_pattern'];
const RESOLVED_TO: WellnessTrendState[] = ['improving', 'stable'];

/** Reframes a fresh 'improving'/'stable' trend as a genuine resolution when it directly follows a previously-persisted declining/recurring_pattern insight for the same area — "digestion concerns have become less frequent" is exactly this transition, not just a quiet supersede. */
export function maybeReframeAsResolved(
  draft: WellnessInsightDraft,
  previous: WellnessInsight | null
): WellnessInsightDraft {
  if (!previous || !previous.trend_state || !draft.trendState) return draft;
  if (!RESOLVED_FROM.includes(previous.trend_state) || !RESOLVED_TO.includes(draft.trendState))
    return draft;

  return {
    ...draft,
    trendState: 'resolved_or_inactive',
    title: draft.title
      .replace('improving', 'become less frequent')
      .replace('stayed steady', 'settled down'),
    memberSummary: `${draft.memberSummary} This had been a concern before — it looks like that's easing.`,
    reasoningCodes: [...draft.reasoningCodes, 'RESOLVED_PREVIOUS_CONCERN'],
  };
}

export function isMeaningfullyDifferent(
  draft: WellnessInsightDraft,
  previous: WellnessInsight
): boolean {
  return draft.trendState !== previous.trend_state || draft.title !== previous.title;
}

/** Persists one draft, honoring dedup/supersede/coach-protection and safety gating/routing — the one write path every detector's output goes through. */
async function persistDraft(
  supabase: SupabaseClient,
  memberId: string,
  rawDraft: WellnessInsightDraft
): Promise<void> {
  const existing = await findActiveInsightByPatternKey(supabase, memberId, rawDraft.patternKey);

  // A coach's own added context protects an insight from being silently
  // replaced by recalculation — same "coach_protected" discipline
  // narrative_items already established.
  if (existing?.coach_context) return;

  const reframed = maybeReframeAsResolved(rawDraft, existing);
  if (existing && !isMeaningfullyDifferent(reframed, existing)) {
    await touchInsightConfirmed(supabase, existing.id); // unchanged conclusion — just re-confirmed, nothing new to say
    return;
  }

  const restrictedTopics = await getMemberRestrictedTopics(supabase, memberId);
  const gated = gateDraftForSafety(reframed, restrictedTopics);

  const safetyClassificationId = isSeriousPattern(gated)
    ? await routeSeriousPatternToReview(supabase, memberId, gated)
    : null;

  const created = await insertWellnessInsight(supabase, memberId, gated, {
    safetyClassificationId,
    supersedesId: existing?.id ?? null,
  });
  if (created && existing) {
    await supersedeWellnessInsight(supabase, existing.id, created.id);
  }
}

/**
 * Runs every detector against real history and persists the result.
 * Best-effort and non-throwing — recalculation must never break the
 * page/action that triggered it, same discipline as
 * lib/narrative/service.ts's updateNarrativeForEvent.
 */
export async function recalculateWellnessIntelligence(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<void> {
  try {
    const [checkinsOldestFirst, feedHistory, baseline, latestReassessment] = await Promise.all([
      fetchHistoryCheckins(supabase, memberId, asOfLocalDate),
      listFeedHistory(supabase, memberId, 100),
      fetchBaselineAssessment(supabase, memberId),
      fetchLatestReassessment(supabase, memberId),
    ]);

    const pastFeedItems = feedHistory.filter((item) => item.local_date <= asOfLocalDate);
    const feedHistoryPairs: FeedHistoryPair[] = await Promise.all(
      pastFeedItems.map(async (feedItem) => ({
        feedItem,
        content: await getContentItem(supabase, feedItem.content_item_id),
      }))
    );

    // ---- Trends ----
    const trendDrafts = classifyAllMetricTrends(
      checkinsOldestFirst,
      asOfLocalDate,
      WELLNESS_METRIC_AREAS
    );
    const trendsByArea = new Map<WellnessMetricKey, string>(
      trendDrafts
        .filter(
          (
            d
          ): d is WellnessInsightDraft & { wellnessArea: WellnessMetricKey; trendState: string } =>
            d.wellnessArea !== null && d.trendState !== null
        )
        .map((d) => [d.wellnessArea, d.trendState!])
    );

    // ---- Patterns ----
    const latestCheckin = checkinsOldestFirst[checkinsOldestFirst.length - 1] ?? null;
    const currentIndex = calculateWellnessIndex(inputsFromCheckin(latestCheckin));
    const overallGoodOrImproving =
      currentIndex !== null &&
      (currentIndex.status === 'good' || trendsByArea.get('sleep') === 'improving');

    const patternDrafts: (WellnessInsightDraft | null)[] = [
      checkinWeekdayPattern(checkinsOldestFirst, asOfLocalDate),
      ...(['doctor_movement', 'doctor_diet', 'doctor_quiet', 'doctor_happiness'] as const).map(
        (category) => categoryWeekdayDipPattern(feedHistoryPairs, asOfLocalDate, category)
      ),
      repeatedSavedNotCompletedPattern(feedHistoryPairs),
      disruptionRecoveryPattern(checkinsOldestFirst, asOfLocalDate),
      repeatedInterventionSuccessPattern(feedHistoryPairs),
      categoryEngagementImbalancePattern(feedHistoryPairs, asOfLocalDate, overallGoodOrImproving),
      contentFollowedByMetricImprovementPattern(
        feedHistoryPairs,
        checkinsOldestFirst,
        'doctor_quiet',
        'stress'
      ),
      contentFollowedByMetricImprovementPattern(
        feedHistoryPairs,
        checkinsOldestFirst,
        'doctor_movement',
        'energy'
      ),
    ];
    const divergenceDrafts = divergencePattern(trendsByArea);

    // ---- Strengths ----
    const strengthDrafts: (WellnessInsightDraft | null)[] = [
      strongestAreaInsight(checkinsOldestFirst, asOfLocalDate, WELLNESS_METRIC_AREAS),
      mostImprovedAreaInsight(checkinsOldestFirst, asOfLocalDate, WELLNESS_METRIC_AREAS),
      longestConsistencyInsight(checkinsOldestFirst, asOfLocalDate),
      sustainableHabitInsight(feedHistoryPairs, asOfLocalDate),
    ];

    // ---- Since baseline / since reassessment ----
    const comparison = buildComparison(baseline, latestReassessment);
    const progressSummary = buildProgressSummary(comparison);
    const baselineDrafts = sinceBaselineInsights(
      progressSummary,
      baseline?.submissionId ?? null,
      latestReassessment?.submissionId ?? null
    );

    const validStrengthDrafts = strengthDrafts.filter((d): d is WellnessInsightDraft => d !== null);
    const allDrafts = [
      ...trendDrafts,
      ...patternDrafts.filter((d): d is WellnessInsightDraft => d !== null),
      ...divergenceDrafts,
      ...validStrengthDrafts,
      ...baselineDrafts,
    ];

    // ---- Priority Intelligence summary (section 6) ----
    const priority = computePriorityIntelligence(trendDrafts, validStrengthDrafts);
    const prioritySummaryDraft: WellnessInsightDraft = {
      insightType: 'priority_summary',
      wellnessArea: priority.primaryPriority,
      trendState: null,
      trendStrength: null,
      patternKey: 'priority_summary',
      title: 'Your current wellness priorities',
      memberSummary: priority.primaryPriority
        ? `Right now, ${priority.primaryPriority} is the area worth the most attention.`
        : 'Nothing urgent stands out right now — a steady stretch.',
      coachDetail: JSON.stringify(priority),
      confidence: 0.7,
      severity:
        priority.recommendedCoachAttentionLevel === 'priority'
          ? 'important'
          : priority.recommendedCoachAttentionLevel === 'discuss'
            ? 'notable'
            : 'info',
      timeWindow: 'last_30_days',
      evidenceRefs: [],
      reasoningCodes: ['PRIORITY_INTELLIGENCE_SUMMARY'],
      recommendedCoachingResponse: null,
      recommendedCoachAction:
        priority.recommendedCoachAttentionLevel === 'priority' ||
        priority.recommendedCoachAttentionLevel === 'discuss'
          ? 'Review the current priority picture at the next session.'
          : null,
      // Not an unconditionally coach-only row: nothing here is clinically
      // sensitive (it's a derived summary of the member's own areas), and
      // recalculation can run under the MEMBER's own session (see
      // app/actions/wellness-intelligence.ts's getMyWellnessPatterns) —
      // whose SELECT policy on wellness_insights requires member_visible.
      // Keeping this true lets findActiveInsightByPatternKey actually see
      // its own prior row to dedupe against; the member-facing action
      // layer still excludes insight_type 'priority_summary' from what it
      // renders. gateDraftForSafety still downgrades this to false when a
      // real safety restriction is open, same as any other insight.
      memberVisible: true,
    };

    for (const draft of [...allDrafts, prioritySummaryDraft]) {
      await persistDraft(supabase, memberId, draft);
    }
  } catch (err) {
    console.error(
      'recalculateWellnessIntelligence failed',
      err instanceof Error ? err.message : err
    );
  }
}
