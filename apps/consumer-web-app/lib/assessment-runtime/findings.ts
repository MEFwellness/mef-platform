import type { UnifiedAssessmentQuestion } from '@mef/shared-types-contracts';
import type { AnswerValue, DerivedFinding, FindingSeverity, SessionAnswers } from './types';

/**
 * Conservative, fully declarative — a question only ever produces a
 * finding if it explicitly opts in with all three of: concern_category (a
 * domain string — validated against the real RegistryDomain enum by
 * lib/registry/adapters/unifiedAssessment.ts, not here, so this module has
 * no dependency on registry types), a single-element severity_tags entry
 * of exactly 'mild'/'moderate'/'significant', and a
 * validation.findingRule. Any question missing one of these never
 * produces a finding — no guessed clinical judgment, same "no vocabulary
 * defined = no-op" discipline as
 * lib/registry/adapters/questionnaireEngine.ts's CATEGORY_FINDING_MAP.
 *
 * Pure, no I/O. Used both to populate AssessmentSession.findings (session.ts)
 * and, at completion, to decide what
 * lib/registry/adapters/unifiedAssessment.ts actually writes — one shared
 * derivation, not duplicated "what counts as a finding" logic.
 */
export type FindingRule =
  | { type: 'boolean_true' }
  | { type: 'numeric_threshold'; concerningAbove?: number; concerningBelow?: number }
  | { type: 'value_in'; concerningValues: string[] };

function isValidSeverity(value: string): value is FindingSeverity {
  return value === 'mild' || value === 'moderate' || value === 'significant';
}

function isConcerning(rule: FindingRule, value: AnswerValue | undefined): boolean {
  if (value === undefined) return false;

  switch (rule.type) {
    case 'boolean_true':
      return value === true;
    case 'numeric_threshold': {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) return false;
      if (rule.concerningAbove !== undefined && n > rule.concerningAbove) return true;
      if (rule.concerningBelow !== undefined && n < rule.concerningBelow) return true;
      return false;
    }
    case 'value_in': {
      const values = Array.isArray(value) ? value : [value];
      return values.some((v) => rule.concerningValues.includes(String(v)));
    }
  }
}

export function deriveFindings(
  questions: UnifiedAssessmentQuestion[],
  answers: SessionAnswers
): DerivedFinding[] {
  const findings: DerivedFinding[] = [];

  for (const question of questions) {
    if (!question.concern_category) continue;

    const severity = question.severity_tags?.[0];
    if (!severity || !isValidSeverity(severity) || question.severity_tags?.length !== 1) continue;

    const validation = question.validation as { findingRule?: FindingRule } | null;
    const rule = validation?.findingRule;
    if (!rule) continue;

    const value = answers[question.question_key];
    if (!isConcerning(rule, value)) continue;

    findings.push({
      questionKey: question.question_key,
      domain: question.concern_category,
      code: question.question_key,
      label: question.prompt,
      severity,
    });
  }

  return findings;
}
