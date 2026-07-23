/**
 * Adaptive Coaching Selector (Prompt 13) — pure, no I/O. Turns already-
 * computed LongitudinalSignal[], a RootRouterOutcomeView, and
 * LifestyleExperiment[] into a ranked list of CoachingCandidate. Re-decides
 * nothing: signal states come from lib/longitudinal-intelligence/, the
 * next-investigation/reassessment pick comes from the Root Router, and
 * experiment status comes from lib/lifestyle-experiments/'s own read-time
 * derivation. This file only ranks and de-dupes what already exists, and
 * applies the member-personality adjustments (Prompt 13's own scope) on top.
 */

import type { LongitudinalSignal } from '@/lib/longitudinal-intelligence';
import type { RootRouterOutcomeView } from '@/lib/investigation-engine/routerOutcome';
import type { LifestyleExperiment } from '@/lib/lifestyle-experiments';
import { deriveEffectiveStatus } from '@/lib/lifestyle-experiments';
import type { CoachingCandidate, CoachingMessageRow, ConversationType, MemberEngagementProfile } from './types';
import { domainWordForSignal, topicLabelForSignal } from './topicLabel';

const NEW_TOPIC_TYPES = new Set<ConversationType>(['first_observation', 'repeated_signal', 'improving_trend']);

function daysBetween(fromIso: string, toLocalDate: string): number {
  const days = (new Date(toLocalDate).getTime() - new Date(fromIso).getTime()) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.round(days));
}

function wasEverShown(topicKey: string, recentMessages: CoachingMessageRow[]): boolean {
  return recentMessages.some((m) => m.topicKey === topicKey);
}

function signalCandidates(
  signals: LongitudinalSignal[],
  engagementProfile: MemberEngagementProfile,
  asOfLocalDate: string
): CoachingCandidate[] {
  const candidates: CoachingCandidate[] = [];

  for (const signal of signals) {
    let conversationType: ConversationType;
    let basePriority: number;
    switch (signal.state) {
      case 'conflicting':
        conversationType = 'conflicting_information';
        basePriority = 80;
        break;
      case 'worsening':
        conversationType = 'worsening_trend';
        basePriority = 60;
        break;
      case 'improving':
      case 'resolved':
        conversationType = 'improving_trend';
        basePriority = 55;
        break;
      case 'established_pattern':
      case 'emerging_pattern':
      case 'repeated_signal':
        conversationType = 'repeated_signal';
        basePriority = 45;
        break;
      case 'one_time_observation':
        conversationType = 'first_observation';
        basePriority = 30;
        break;
      // 'stable' / 'stale' / 'insufficient_data' never start a conversation —
      // nothing new or actionable to say, and staleness/thin data is already
      // handled honestly elsewhere (Insights page's "still learning" section).
      default:
        continue;
    }

    let priority = basePriority + (signal.tier ?? 0) * 2 + signal.confidence * 10;

    const domainWord = domainWordForSignal(signal);
    if (NEW_TOPIC_TYPES.has(conversationType) && domainWord && engagementProfile.deprioritizedTopicWords.has(domainWord)) {
      priority -= 20;
    }
    if (engagementProfile.hasUnfinishedExperimentPattern && conversationType === 'first_observation') {
      priority -= 10;
    }

    candidates.push({
      conversationType,
      topicKey: signal.signalKey,
      topicLabel: topicLabelForSignal(signal),
      priority,
      historyDepthDays: daysBetween(signal.firstObservedAt, asOfLocalDate),
      occurrenceCount: signal.occurrenceCount,
      sourceState: signal.state,
    });
  }

  return candidates;
}

function experimentCandidates(
  experiments: LifestyleExperiment[],
  recentMessages: CoachingMessageRow[],
  asOfLocalDate: string
): CoachingCandidate[] {
  const asOfDate = new Date(asOfLocalDate);
  const candidates: CoachingCandidate[] = [];

  for (const experiment of experiments) {
    const effectiveStatus = deriveEffectiveStatus(experiment, asOfDate);
    const historyDepthDays = daysBetween(experiment.startDate, asOfLocalDate);
    const priorMentions = recentMessages.filter((m) => m.topicKey.startsWith(`experiment::${experiment.id}::`)).length;

    if (effectiveStatus === 'completed' || effectiveStatus === 'abandoned') {
      const topicKey = `experiment::${experiment.id}::outcome`;
      if (wasEverShown(topicKey, recentMessages)) continue;

      const conversationType: ConversationType =
        effectiveStatus === 'abandoned'
          ? 'experiment_follow_up'
          : experiment.outcome === 'worked' || experiment.outcome === 'partially_worked'
            ? 'experiment_success'
            : experiment.outcome === 'didnt_work'
              ? 'experiment_unsuccessful'
              : 'experiment_follow_up';

      candidates.push({
        conversationType,
        topicKey,
        topicLabel: experiment.title,
        priority: 95,
        historyDepthDays,
        occurrenceCount: priorMentions,
        sourceState: `experiment_${effectiveStatus}`,
        experimentOutcome: experiment.outcome,
      });
      continue;
    }

    if (effectiveStatus === 'expired_no_reflection') {
      const topicKey = `experiment::${experiment.id}::overdue`;
      if (wasEverShown(topicKey, recentMessages)) continue;
      candidates.push({
        conversationType: 'experiment_follow_up',
        topicKey,
        topicLabel: experiment.title,
        priority: 88,
        historyDepthDays,
        occurrenceCount: priorMentions,
        sourceState: 'experiment_expired_no_reflection',
        experimentOutcome: null,
      });
      continue;
    }

    if (effectiveStatus === 'active') {
      const atMidpoint = historyDepthDays * 2 >= experiment.durationDays;
      const topicKey = `experiment::${experiment.id}::midpoint`;
      if (atMidpoint && !wasEverShown(topicKey, recentMessages)) {
        candidates.push({
          conversationType: 'experiment_follow_up',
          topicKey,
          topicLabel: experiment.title,
          priority: 70,
          historyDepthDays,
          occurrenceCount: priorMentions,
          sourceState: 'experiment_active_midpoint',
          experimentOutcome: null,
        });
      }
    }
  }

  return candidates;
}

function routerCandidate(routerOutcome: RootRouterOutcomeView): CoachingCandidate | null {
  if (!routerOutcome.investigation) return null;

  if (routerOutcome.outcome === 'reassessment') {
    return {
      conversationType: 'reassessment',
      topicKey: `router::reassessment::${routerOutcome.investigation.key}`,
      topicLabel: routerOutcome.investigation.displayName,
      priority: 85,
      historyDepthDays: 0,
      occurrenceCount: 0,
      sourceState: 'router_reassessment',
    };
  }

  if (routerOutcome.outcome === 'focused_investigation') {
    return {
      conversationType: 'new_assessment_available',
      topicKey: `router::investigation::${routerOutcome.investigation.key}`,
      topicLabel: routerOutcome.investigation.displayName,
      priority: 65,
      historyDepthDays: 0,
      occurrenceCount: 0,
      sourceState: 'router_focused_investigation',
    };
  }

  return null;
}

export type SelectorInput = {
  signals: LongitudinalSignal[];
  routerOutcome: RootRouterOutcomeView;
  experiments: LifestyleExperiment[];
  engagementProfile: MemberEngagementProfile;
  recentMessages: CoachingMessageRow[];
  asOfLocalDate: string;
};

/**
 * Full ranked candidate list — index 0 is "today's message," the rest feed
 * the Coach Workspace's suggested topics. Deliberately does NOT exclude a
 * topic already messaged today: the same topic staying the top candidate
 * across repeated views (a page reload, a prefetch, a coach re-opening the
 * workspace) is what keeps the member's message stable through the day
 * instead of flickering to nothing — the caller (recordCoachingMessage's
 * call site) is responsible for not writing a second row for an
 * already-recorded-today topic, and the composer's rotation seed is keyed
 * off distinct prior *days*, not raw calls, so same-day re-selection never
 * changes the wording either.
 */
export function selectCoachingCandidates(input: SelectorInput): CoachingCandidate[] {
  const { signals, routerOutcome, experiments, engagementProfile, recentMessages, asOfLocalDate } = input;

  const router = routerCandidate(routerOutcome);
  const all = [
    ...signalCandidates(signals, engagementProfile, asOfLocalDate),
    ...experimentCandidates(experiments, recentMessages, asOfLocalDate),
    ...(router ? [router] : []),
  ];

  return all.sort((a, b) => b.priority - a.priority || b.historyDepthDays - a.historyDepthDays);
}
