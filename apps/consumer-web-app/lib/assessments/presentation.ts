/**
 * Reusable Assessment Engine — presentation helpers shared by every
 * assessment UI component. Maps the engine's PriorityLevel onto this
 * app's existing good/attention/poor status vocabulary
 * (lib/wellness/status.ts's STATUS_STYLES) rather than inventing a second
 * color language: low priority (a healthy pattern) reads as "good",
 * moderate as "attention", high (needs the most coaching focus) as "poor".
 */

import type { MetricStatus } from '@/lib/wellness/status';
import type { PriorityLevel, QuestionnaireStatus } from './engine/types';
import type { ComparisonDirection } from './comparison';

export function priorityToStatus(priority: PriorityLevel): MetricStatus {
  if (priority === 'low') return 'good';
  if (priority === 'moderate') return 'attention';
  return 'poor';
}

export const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  low: 'Low priority',
  moderate: 'Moderate priority',
  high: 'High priority',
};

/** Improved/regressed are already inverted for this higher-is-worse scale (see comparison.ts) — a lower score is "improved", so it maps to "good" here directly, no further inversion. */
export function directionToStatus(direction: ComparisonDirection): MetricStatus {
  if (direction === 'improved') return 'good';
  if (direction === 'regressed') return 'poor';
  if (direction === 'unchanged') return 'attention';
  return 'no-data';
}

export const DIRECTION_LABEL: Record<ComparisonDirection, string> = {
  improved: 'Improved',
  regressed: 'Needs attention',
  unchanged: 'Unchanged',
  unknown: 'No prior data',
};

/** Pure — a draft (in_progress row) always wins over completed history, since resuming it is always the actionable next step regardless of how many past completions exist. */
export function deriveQuestionnaireStatus(hasDraft: boolean, hasCompleted: boolean): QuestionnaireStatus {
  if (hasDraft) return 'in_progress';
  if (hasCompleted) return 'completed';
  return 'not_started';
}

export const QUESTIONNAIRE_STATUS_LABEL: Record<QuestionnaireStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

/** Reuses the same good/attention/no-data badge vocabulary as everywhere else — a questionnaire's status isn't a quality judgment (there's no "poor" here), so "high priority" red is never used. */
export function questionnaireStatusToMetricStatus(status: QuestionnaireStatus): MetricStatus {
  if (status === 'completed') return 'good';
  if (status === 'in_progress') return 'attention';
  return 'no-data';
}

export function formatAssessmentDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
