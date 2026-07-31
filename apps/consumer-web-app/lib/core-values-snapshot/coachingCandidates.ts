/**
 * Core Values Snapshot — day-3/day-7 Weekly Experiment follow-ups as Root
 * Coaching Conversation Engine candidates. Pure, no I/O (mirrors
 * lib/root-coaching-engine/selector.ts's own experimentCandidates shape).
 * The caller (app/actions/rootCoaching.ts) gathers the real CVS
 * experiments + their daily logs and passes the result into
 * planCoachingConversation's optional `cvsCandidates` field — this
 * function never talks to Supabase itself.
 */

import type { LifestyleExperiment } from '@/lib/lifestyle-experiments';
import type { CoachingCandidate, CoachingMessageRow } from '@/lib/root-coaching-engine/types';
import { classifyDay7Pattern, daysSinceStart, isDay3Eligible, isDay7Eligible, type CvsDailyLogRow } from './experiment';
import { cvsDay3FollowUpText, cvsDay7FollowUpText } from './copy';

export type CvsExperimentWithLogs = { experiment: LifestyleExperiment; logs: CvsDailyLogRow[] };

function wasEverShown(topicKey: string, recentMessages: CoachingMessageRow[]): boolean {
  return recentMessages.some((m) => m.topicKey === topicKey);
}

export function buildCvsCoachingCandidates(
  cvsExperiments: CvsExperimentWithLogs[],
  recentMessages: CoachingMessageRow[],
  asOfLocalDate: string
): CoachingCandidate[] {
  const candidates: CoachingCandidate[] = [];

  for (const { experiment, logs } of cvsExperiments) {
    if (experiment.status !== 'active' && experiment.status !== 'expired_no_reflection') continue;

    const topLabel = experiment.title;
    const depthDays = daysSinceStart(experiment.startDate, asOfLocalDate);

    if (isDay3Eligible(experiment.startDate, asOfLocalDate)) {
      const topicKey = `cvs::${experiment.id}::day3`;
      if (!wasEverShown(topicKey, recentMessages)) {
        const text = cvsDay3FollowUpText(topLabel);
        candidates.push({
          conversationType: 'cvs_day3_checkin',
          topicKey,
          topicLabel: topLabel,
          priority: 90,
          historyDepthDays: depthDays,
          occurrenceCount: 0,
          sourceState: 'cvs_experiment_day3',
          precomposedMessage: { dashboardLine: text, chatPreview: text, coachingCard: text },
        });
      }
    }

    if (isDay7Eligible(experiment.startDate, asOfLocalDate)) {
      const topicKey = `cvs::${experiment.id}::day7`;
      if (!wasEverShown(topicKey, recentMessages)) {
        const pattern = classifyDay7Pattern(logs, experiment.durationDays);
        const text = cvsDay7FollowUpText(topLabel, pattern.pattern);
        candidates.push({
          conversationType: 'cvs_day7_result',
          topicKey,
          topicLabel: topLabel,
          priority: 94,
          historyDepthDays: depthDays,
          occurrenceCount: 0,
          sourceState: `cvs_experiment_day7_${pattern.pattern}`,
          precomposedMessage: { dashboardLine: text, chatPreview: text, coachingCard: text },
        });
      }
    }
  }

  return candidates;
}
