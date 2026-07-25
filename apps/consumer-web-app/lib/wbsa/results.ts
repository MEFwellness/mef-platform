/**
 * WBSA result rollup — pure, no I/O. Computes a per-body-system band
 * directly from the completed session's own findings/answers (the
 * Unified Runtime's real DerivedFinding[]/SessionAnswers, unmodified),
 * independent of how those findings later map onto Universal Registry
 * domains. This is deliberate: the registry's domain vocabulary (extended
 * for WBSA in migration 100) doesn't need one-to-one section fidelity for
 * the result screen to show all 16 systems correctly — that would
 * conflate two different concerns (what a member sees on their own
 * result screen vs. what a downstream engine can key off of).
 */

import type {
  UnifiedAssessmentQuestion,
  UnifiedAssessmentSection,
} from '@mef/shared-types-contracts';
import type { DerivedFinding, SessionAnswers } from '../assessment-runtime/types';
import { PREFER_NOT_TO_ANSWER } from '../assessment-runtime/types';

export type WbsaBand = 'lower' | 'watch' | 'needs_context';

export type WbsaSystemBreakdownRow = {
  sectionId: string;
  title: string;
  subtitle: string | null;
  displayOrder: number;
  band: WbsaBand;
  findingCount: number;
  skippedCount: number;
};

/** Any significant finding wins outright; a moderate finding or 2+ mild findings together are "worth watching"; anything less is "lower reported pattern." */
function bandForFindings(findings: DerivedFinding[]): WbsaBand {
  if (findings.some((f) => f.severity === 'significant')) return 'needs_context';
  const moderateCount = findings.filter((f) => f.severity === 'moderate').length;
  const mildCount = findings.filter((f) => f.severity === 'mild').length;
  if (moderateCount >= 1 || mildCount >= 2) return 'watch';
  return 'lower';
}

export function computeWbsaSystemBreakdown(
  sections: UnifiedAssessmentSection[],
  questions: UnifiedAssessmentQuestion[],
  answers: SessionAnswers,
  findings: DerivedFinding[]
): WbsaSystemBreakdownRow[] {
  const sectionIdByQuestionKey = new Map(
    questions.map((q) => [q.question_key, q.section_id])
  );
  const questionsBySectionId = new Map<string, UnifiedAssessmentQuestion[]>();
  for (const q of questions) {
    if (!q.section_id) continue;
    const bucket = questionsBySectionId.get(q.section_id);
    if (bucket) bucket.push(q);
    else questionsBySectionId.set(q.section_id, [q]);
  }

  const findingsBySectionId = new Map<string, DerivedFinding[]>();
  for (const finding of findings) {
    const sectionId = sectionIdByQuestionKey.get(finding.questionKey);
    if (!sectionId) continue;
    const bucket = findingsBySectionId.get(sectionId);
    if (bucket) bucket.push(finding);
    else findingsBySectionId.set(sectionId, [finding]);
  }

  return [...sections]
    .sort((a, b) => a.display_order - b.display_order)
    .map((section) => {
      const sectionFindings = findingsBySectionId.get(section.id) ?? [];
      const sectionQuestions = questionsBySectionId.get(section.id) ?? [];
      const skippedCount = sectionQuestions.filter(
        (q) => answers[q.question_key] === PREFER_NOT_TO_ANSWER
      ).length;

      return {
        sectionId: section.id,
        title: section.title,
        subtitle: section.subtitle,
        displayOrder: section.display_order,
        band: bandForFindings(sectionFindings),
        findingCount: sectionFindings.length,
        skippedCount,
      };
    });
}

export function hasAnySkippedQuestion(rows: WbsaSystemBreakdownRow[]): boolean {
  return rows.some((row) => row.skippedCount > 0);
}

/** Systems in "Needs More Context," most findings first, then "Worth Watching." Used for the result screen's "greatest reported pattern concentration" list. */
export function rankSystemsNeedingAttention(rows: WbsaSystemBreakdownRow[]): WbsaSystemBreakdownRow[] {
  const priority: Record<WbsaBand, number> = { needs_context: 0, watch: 1, lower: 2 };
  return [...rows]
    .filter((row) => row.band !== 'lower')
    .sort((a, b) => priority[a.band] - priority[b.band] || b.findingCount - a.findingCount);
}

export function systemsWithLowerPattern(rows: WbsaSystemBreakdownRow[]): WbsaSystemBreakdownRow[] {
  return rows.filter((row) => row.band === 'lower');
}
