import type { UnifiedAssessmentQuestion, UnifiedAssessmentSection } from '@mef/shared-types-contracts';

export type AnswerValue = string | number | boolean | string[];

/**
 * Shared sentinel written as an AnswerValue when a member taps "Prefer not
 * to answer" on a question with allows_prefer_not_to_answer=true (added to
 * unified_assessment_questions in migration 100). Deliberately just a
 * value, not a schema/logic change: it satisfies `answers[key] !==
 * undefined` (still counts as answered for completeness/progress) and
 * never matches any FindingRule in findings.ts (boolean_true/
 * numeric_threshold/value_in all fail against a string that isn't a real
 * answer), so a skipped question correctly produces no finding with zero
 * changes to session.ts/findings.ts.
 */
export const PREFER_NOT_TO_ANSWER = '__prefer_not_to_answer__' as const;

/** question_key -> the value the member has entered for it. */
export type SessionAnswers = Record<string, AnswerValue>;

export type SessionStatus = 'in_progress' | 'completed';

/**
 * The single source of truth for a running assessment — exactly the field
 * set the runtime is specified to expose, plus `id` (the session row's own
 * id, needed to address it for persistence — not in the original field
 * list but required to make saveAnswer/finishAssessment addressable) and
 * `status` (needed to distinguish in_progress/completed at a glance without
 * inferring it from completedAt).
 */
export type AssessmentSession = {
  id: string;
  assessmentId: string;
  assessmentVersion: number;
  memberId: string;
  status: SessionStatus;

  currentSection: UnifiedAssessmentSection | null;
  currentQuestion: UnifiedAssessmentQuestion | null;

  answers: SessionAnswers;
  visibleQuestions: UnifiedAssessmentQuestion[];
  completedQuestions: UnifiedAssessmentQuestion[];
  hiddenQuestions: UnifiedAssessmentQuestion[];

  findings: DerivedFinding[];
  flags: RuntimeFlag[];

  startedAt: string;
  updatedAt: string;
  completedAt: string | null;

  progress: { answered: number; visible: number };
  completionPercentage: number;
};

/** A significant-severity finding also surfaces as a flag — the runtime's own "this needs a closer look" signal, independent of whether/how the registry publish step later succeeds. */
export type RuntimeFlag = {
  questionKey: string;
  label: string;
};

export type FindingSeverity = 'mild' | 'moderate' | 'significant';

/**
 * A finding derived from an answered question's own authored metadata —
 * see findings.ts. `domain` is kept as a plain string here (not
 * RegistryDomain) so this pure module has no dependency on registry types;
 * lib/registry/adapters/unifiedAssessment.ts validates it before writing.
 */
export type DerivedFinding = {
  questionKey: string;
  domain: string;
  code: string;
  label: string;
  severity: FindingSeverity;
};

export type RuntimeEvent =
  | { type: 'question_answered'; questionKey: string; value: AnswerValue }
  | { type: 'section_completed'; sectionId: string }
  | { type: 'assessment_paused'; sessionId: string }
  | { type: 'assessment_resumed'; sessionId: string }
  | { type: 'assessment_completed'; sessionId: string }
  | { type: 'findings_published'; sessionId: string; count: number };
