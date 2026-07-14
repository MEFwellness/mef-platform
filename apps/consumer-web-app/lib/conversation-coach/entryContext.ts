/**
 * Pure builders for the short, real-data-only "entry context" string each
 * member page hands the floating "Ask Your MEF Coach" launcher (part 4).
 * Every function here takes data the host page ALREADY fetched for its
 * own rendering — nothing here reaches back into the database, and
 * nothing here sends more than a couple of sentences (part 4's "do not
 * send the entire page or unnecessary member history"). Kept as pure
 * functions, separate from the page files themselves, so they're directly
 * unit-testable without rendering anything.
 */

import type { WellnessInsight } from '@mef/shared-types-contracts';
import type { WellnessIndexResult } from '../wellness/wellness-index';
import type { CoachingFocusDecision } from '../brain/types';

export function buildDashboardEntryContext(wellnessIndex: WellnessIndexResult | null): string {
  if (!wellnessIndex) {
    return "Opened from the Dashboard. Today's Wellness Index hasn't been calculated yet (no check-in logged today).";
  }
  return `Opened from the Dashboard. Today's Wellness Index: ${wellnessIndex.score}/100 (${wellnessIndex.label}).`;
}

export function buildTodayEntryContext(
  decision: CoachingFocusDecision | null,
  lessonTitle: string | null,
  suggestedAction: string | null
): string {
  if (!decision) return 'Opened from the Today page.';
  const lesson = lessonTitle ? ` Lesson: "${lessonTitle}".` : '';
  const action = suggestedAction ? ` Suggested action: "${suggestedAction}".` : '';
  return `Opened from the Today page. Current coaching focus: ${decision.focusLabel} (${decision.mode} mode).${lesson}${action}`;
}

export function buildCheckinEntryContext(hasCheckedInToday: boolean): string {
  return hasCheckedInToday
    ? "Opened from the Check-in page. Today's check-in has already been logged."
    : "Opened from the Check-in page, before today's check-in was logged.";
}

const MAX_PROGRESS_INSIGHTS = 2;

export function buildProgressEntryContext(insights: WellnessInsight[]): string {
  const titles = insights
    .filter((i) => i.member_visible)
    .slice(0, MAX_PROGRESS_INSIGHTS)
    .map((i) => `"${i.title}"`);
  if (titles.length === 0) {
    return 'Opened from the Progress page. No wellness patterns have surfaced yet.';
  }
  return `Opened from the Progress page. Visible patterns: ${titles.join(', ')}.`;
}

export function buildProfileEntryContext(): string {
  return 'Opened from the Profile page.';
}

export function buildAssessmentEntryContext(
  kind: 'baseline' | 'reassessment',
  submittedLocalDate: string
): string {
  const label = kind === 'baseline' ? 'Baseline Assessment' : 'Reassessment';
  return `Opened from the ${label} result (submitted ${submittedLocalDate}).`;
}

export function buildBodyAssessmentReportEntryContext(
  assessmentTypeLabel: string,
  coachSummary: string | null,
  observationCount: number
): string {
  const summaryPart = coachSummary ? ` Coach's summary: "${coachSummary}"` : '';
  return `Opened from a published ${assessmentTypeLabel} report (${observationCount} observation${observationCount === 1 ? '' : 's'}).${summaryPart}`;
}
