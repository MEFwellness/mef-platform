/**
 * Wellness Analysis Agent — analyzes onboarding, reassessments, and daily
 * check-ins for real, data-backed patterns and coaching priorities.
 *
 * Deliberately reuses the exact same calculation modules the member
 * dashboard and coach dashboard already use (calculateWellnessIndex,
 * WELLNESS_COACHING) rather than re-deriving "what's the priority area"
 * a second way — an insight this agent produces about a member's
 * priority area will always agree with what that member's own dashboard
 * shows them, by construction.
 */

import {
  calculateWellnessIndex,
  inputsFromCheckin,
  WELLNESS_METRIC_LABEL,
} from '../../wellness/wellness-index';
import { WELLNESS_COACHING } from '../../wellness/coaching';
import { buildComparison, buildProgressSummary } from '../../onboarding/comparison';
import {
  ruleMatchesToOutput,
  mergeAgentOutputs,
  type AgentContext,
  type AgentOutput,
} from './types';
import type { AiAgentDefinition } from './types';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { fetchBaselineAssessment, type BaselineAssessment } from '../../onboarding/baseline';
import { fetchLatestReassessment } from '../../onboarding/reassessment';
import { listNarrativeItems } from '../../narrative/data';
import { pickCoachingReferenceSentence } from '../../narrative/coachingReference';

/** "Today's priority" — only worth surfacing when the priority area is actually attention/poor, not on an ordinary good day (avoids noisy, unnecessary output). */
async function priorityInsightFromCheckin(context: AgentContext): Promise<AgentOutput> {
  const payload = context.event.payload as { checkin?: DailyCheckin };
  const checkin = payload.checkin;
  if (!checkin) return [];

  const index = calculateWellnessIndex(inputsFromCheckin(checkin));
  if (!index || !index.priority || index.priority.status === 'good') {
    return [];
  }

  const copy = WELLNESS_COACHING[index.priority.key];
  const supportingData = {
    priorityMetric: index.priority.key,
    priorityScore: index.priority.score,
    priorityStatus: index.priority.status,
    wellnessIndexScore: index.score,
  };

  // Milestone 2: weave in at most one safe, relevant narrative reference —
  // "Travel has made consistency harder for you before, so today's plan
  // is intentionally lighter," never a raw dump of everything the system
  // knows. Best-effort: a narrative lookup failure never blocks the
  // priority insight itself from being produced.
  let narrativeSentence: string | null = null;
  try {
    const narrativeItems = await listNarrativeItems(context.supabase, context.memberId, {
      statusFilter: ['active'],
    });
    narrativeSentence = pickCoachingReferenceSentence(
      narrativeItems,
      WELLNESS_METRIC_LABEL[index.priority.key]
    );
  } catch (narrativeError) {
    console.error('Narrative reference lookup failed in wellness-analysis agent', narrativeError);
  }

  const recommendationDescription = narrativeSentence
    ? `${copy.priorityAction} ${narrativeSentence}`
    : copy.priorityAction;

  return [
    {
      insight: {
        insightType: 'coaching_priority',
        title: copy.priorityTitle,
        description: copy.priorityWhy,
        supportingData,
        confidence: 0.7,
      },
      recommendation: {
        recommendationType: 'coaching_priority',
        title: copy.priorityTitle,
        description: recommendationDescription,
        supportingData,
        confidence: 0.7,
        priority: 'medium',
      },
      action: {
        actionType: 'todays_priority',
        reason: copy.priorityWhy,
        supportingData: { ...supportingData, action: copy.priorityAction },
        confidence: 0.7,
        requiresCoachApproval: false,
      },
    },
  ];
}

/** Reassessment analysis reuses buildComparison/buildProgressSummary verbatim (lib/onboarding/comparison.ts) — this is the exact same computation the member's own Progress & Reassessments page runs. */
async function comparisonInsightFromReassessment(context: AgentContext): Promise<AgentOutput> {
  const [baseline, latest] = await Promise.all([
    fetchBaselineAssessment(context.supabase, context.memberId),
    fetchLatestReassessment(context.supabase, context.memberId),
  ]);
  if (!baseline || !latest) return [];

  const metrics = buildComparison(baseline, latest);
  const summary = buildProgressSummary(metrics);
  if (!summary.biggestImprovement && !summary.needsAttention) {
    return [];
  }

  const output: AgentOutput = [];

  if (summary.biggestImprovement) {
    const supportingData = {
      metric: summary.biggestImprovement.key,
      comparison: summary.biggestImprovement,
    };
    output.push({
      insight: {
        insightType: 'reassessment_improvement',
        title: `${summary.biggestImprovement.label} improved`,
        description: `${summary.biggestImprovement.label} moved from ${summary.biggestImprovement.baseline?.displayValue} at baseline to ${summary.biggestImprovement.latest?.displayValue} at the latest reassessment.`,
        supportingData,
        confidence: 0.85,
      },
    });
  }

  if (summary.needsAttention) {
    const supportingData = {
      metric: summary.needsAttention.key,
      comparison: summary.needsAttention,
    };
    const description =
      summary.suggestedFocusAction ?? `${summary.needsAttention.label} remains a priority area.`;
    output.push({
      insight: {
        insightType: 'reassessment_attention',
        title: `${summary.needsAttention.label} still needs attention`,
        description,
        supportingData,
        confidence: 0.75,
      },
      recommendation: {
        recommendationType: 'reassessment_attention',
        title: `${summary.needsAttention.label} still needs attention`,
        description,
        supportingData,
        confidence: 0.75,
        priority: 'medium',
      },
      action: {
        actionType: 'follow_up_recommendation',
        reason: `Reassessment shows ${summary.needsAttention.label} is still ${summary.needsAttention.latest?.status ?? 'a concern'}.`,
        supportingData,
        confidence: 0.75,
        requiresCoachApproval: false,
      },
    });
  }

  return output;
}

async function onboardingInsight(context: AgentContext): Promise<AgentOutput> {
  const baseline: BaselineAssessment | null = await fetchBaselineAssessment(
    context.supabase,
    context.memberId
  );
  if (!baseline) return [];

  const primaryConcern = baseline.answers.find((a) => a.questionKey === 'primary_concern');

  return [
    {
      insight: {
        insightType: 'baseline_established',
        title: 'Baseline established',
        description: primaryConcern
          ? `Baseline completed — primary concern reported as "${String(primaryConcern.value)}".`
          : 'Baseline assessment completed.',
        supportingData: {
          submissionId: baseline.submissionId,
          primaryConcern: primaryConcern?.value ?? null,
        },
        confidence: 1,
      },
    },
  ];
}

export const wellnessAnalysisAgent: AiAgentDefinition = {
  key: 'wellness_analysis',
  respondsTo: [
    'member_completed_onboarding',
    'member_completed_checkin',
    'reassessment_completed',
    'pain_increased',
    'pain_decreased',
    'stress_increased',
    'stress_decreased',
    'sleep_declined',
    'movement_improved',
    'digestion_worsened',
    'wellness_index_changed_significantly',
  ],
  async handle(context: AgentContext): Promise<AgentOutput> {
    const outputs = [ruleMatchesToOutput(context.ruleMatches)];

    if (context.event.event_type === 'member_completed_checkin') {
      outputs.push(await priorityInsightFromCheckin(context));
    }
    if (context.event.event_type === 'reassessment_completed') {
      outputs.push(await comparisonInsightFromReassessment(context));
    }
    if (context.event.event_type === 'member_completed_onboarding') {
      outputs.push(await onboardingInsight(context));
    }

    return mergeAgentOutputs(outputs);
  },
};
