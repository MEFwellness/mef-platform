/**
 * Life Signal Check — day-3/day-7 Weekly Experiment follow-ups as Root
 * Coaching Conversation Engine candidates. Pure, no I/O. Exact mirror of
 * lib/core-values-snapshot/coachingCandidates.ts — the caller
 * (app/actions/rootCoaching.ts) gathers the real Life Signal
 * Check-sourced experiments + their daily logs (disambiguated from Core
 * Values Snapshot's own via lifestyle_experiments.source_experience_key,
 * migration 138) and passes the result into planCoachingConversation's
 * optional `lscCandidates` field.
 */

import type { LifestyleExperiment } from '@/lib/lifestyle-experiments';
import type { CoachingCandidate, CoachingMessageRow } from '@/lib/root-coaching-engine/types';
import { classifyDay7Pattern, daysSinceStart, isDay3Eligible, isDay7Eligible, type CvsDailyLogRow } from '../core-values-snapshot/experiment';
import { lscDay3FollowUpText, lscDay7FollowUpText } from './copy';

export type LscExperimentWithLogs = { experiment: LifestyleExperiment; logs: CvsDailyLogRow[] };

function wasEverShown(topicKey: string, recentMessages: CoachingMessageRow[]): boolean {
  return recentMessages.some((m) => m.topicKey === topicKey);
}

export function buildLscCoachingCandidates(
  lscExperiments: LscExperimentWithLogs[],
  recentMessages: CoachingMessageRow[],
  asOfLocalDate: string
): CoachingCandidate[] {
  const candidates: CoachingCandidate[] = [];

  for (const { experiment, logs } of lscExperiments) {
    if (experiment.status !== 'active' && experiment.status !== 'expired_no_reflection') continue;

    const topLabel = experiment.title;
    const depthDays = daysSinceStart(experiment.startDate, asOfLocalDate);

    if (isDay3Eligible(experiment.startDate, asOfLocalDate)) {
      const topicKey = `lsc::${experiment.id}::day3`;
      if (!wasEverShown(topicKey, recentMessages)) {
        const text = lscDay3FollowUpText(topLabel);
        candidates.push({
          conversationType: 'lsc_day3_checkin',
          topicKey,
          topicLabel: topLabel,
          priority: 90,
          historyDepthDays: depthDays,
          occurrenceCount: 0,
          sourceState: 'lsc_experiment_day3',
          precomposedMessage: { dashboardLine: text, chatPreview: text, coachingCard: text },
        });
      }
    }

    if (isDay7Eligible(experiment.startDate, asOfLocalDate)) {
      const topicKey = `lsc::${experiment.id}::day7`;
      if (!wasEverShown(topicKey, recentMessages)) {
        const pattern = classifyDay7Pattern(logs, experiment.durationDays);
        const text = lscDay7FollowUpText(topLabel, pattern.pattern);
        candidates.push({
          conversationType: 'lsc_day7_result',
          topicKey,
          topicLabel: topLabel,
          priority: 94,
          historyDepthDays: depthDays,
          occurrenceCount: 0,
          sourceState: `lsc_experiment_day7_${pattern.pattern}`,
          precomposedMessage: { dashboardLine: text, chatPreview: text, coachingCard: text },
        });
      }
    }
  }

  return candidates;
}
