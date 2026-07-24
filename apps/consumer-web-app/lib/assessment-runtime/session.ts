import type { UnifiedAssessmentQuestion, UnifiedAssessmentSection } from '@mef/shared-types-contracts';
import { evaluateCondition, parseCondition, parseConditionList } from './conditions';
import { deriveFindings } from './findings';
import type {
  AnswerValue,
  AssessmentSession,
  RuntimeEvent,
  RuntimeFlag,
  SessionAnswers,
  SessionStatus,
} from './types';

/**
 * Pure functions only — no I/O, no Supabase — same discipline as
 * lib/assessments/engine/{navigation,scoring}.ts and
 * lib/adaptive-assessment-engine/select.ts. The one Supabase-touching
 * module is data.ts, which calls these.
 */

export type FlatQuestionRef = { section: UnifiedAssessmentSection | null; question: UnifiedAssessmentQuestion };

/** Inactive questions (active=false) never appear at all — not visible, not hidden, just not part of this assessment's content anymore. */
export function calculateVisibleQuestions(
  questions: UnifiedAssessmentQuestion[],
  answers: SessionAnswers
): { visible: UnifiedAssessmentQuestion[]; hidden: UnifiedAssessmentQuestion[] } {
  const visible: UnifiedAssessmentQuestion[] = [];
  const hidden: UnifiedAssessmentQuestion[] = [];

  for (const question of questions) {
    if (!question.active) continue;

    const requires = parseCondition(question.requires);
    const excludes = parseCondition(question.excludes);
    const skipRules = parseConditionList(question.skip_rules);

    const requiresOk = !requires || evaluateCondition(requires, answers);
    const excludesHit = !!excludes && evaluateCondition(excludes, answers);
    const skipHit = skipRules.some((rule) => evaluateCondition(rule, answers));

    if (requiresOk && !excludesHit && !skipHit) {
      visible.push(question);
    } else {
      hidden.push(question);
    }
  }

  return { visible, hidden };
}

/** answered-visible ÷ currently-visible, never total-in-config — mirrors lib/assessments/engine/scoring.ts's totalAnsweredCount/totalQuestionCount and store.ts's resume-position discipline: always recomputed from real state, never an independently-advanced counter. */
export function calculateProgress(
  visibleQuestions: UnifiedAssessmentQuestion[],
  answers: SessionAnswers
): { answered: number; visible: number; completionPercentage: number } {
  const answered = visibleQuestions.filter((q) => answers[q.question_key] !== undefined).length;
  const visible = visibleQuestions.length;
  const completionPercentage = visible === 0 ? 0 : Math.round((answered / visible) * 100);
  return { answered, visible, completionPercentage };
}

/** Sections ordered by display_order, then their visible questions ordered by display_order within the section — questions with no section sort last. */
export function flattenVisibleQuestions(
  sections: UnifiedAssessmentSection[],
  visibleQuestions: UnifiedAssessmentQuestion[]
): FlatQuestionRef[] {
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const orderedSectionIds = [...sections]
    .sort((a, b) => a.display_order - b.display_order)
    .map((s) => s.id);
  const sectionOrder = new Map(orderedSectionIds.map((id, index) => [id, index]));

  return [...visibleQuestions]
    .sort((a, b) => {
      const orderA = a.section_id ? (sectionOrder.get(a.section_id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      const orderB = b.section_id ? (sectionOrder.get(b.section_id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.display_order - b.display_order;
    })
    .map((question) => ({
      section: question.section_id ? (sectionById.get(question.section_id) ?? null) : null,
      question,
    }));
}

export function findFirstUnanswered(flat: FlatQuestionRef[], answers: SessionAnswers): FlatQuestionRef | null {
  return flat.find((ref) => answers[ref.question.question_key] === undefined) ?? null;
}

export function nextQuestion(flat: FlatQuestionRef[], currentQuestionKey: string | null): FlatQuestionRef | null {
  const index = currentQuestionKey ? flat.findIndex((ref) => ref.question.question_key === currentQuestionKey) : -1;
  return flat[index + 1] ?? null;
}

export function previousQuestion(flat: FlatQuestionRef[], currentQuestionKey: string | null): FlatQuestionRef | null {
  const index = currentQuestionKey ? flat.findIndex((ref) => ref.question.question_key === currentQuestionKey) : -1;
  if (index <= 0) return null;
  return flat[index - 1] ?? null;
}

export function jumpToQuestion(flat: FlatQuestionRef[], questionKey: string): FlatQuestionRef | null {
  return flat.find((ref) => ref.question.question_key === questionKey) ?? null;
}

function flagsFromFindings(findings: ReturnType<typeof deriveFindings>): RuntimeFlag[] {
  return findings
    .filter((f) => f.severity === 'significant')
    .map((f) => ({ questionKey: f.questionKey, label: f.label }));
}

/** Assembles the full AssessmentSession from raw inputs — the single place that composes visibility, progress, navigation position, and derived findings/flags into the one source-of-truth object. */
export function buildSession(params: {
  id: string;
  assessmentId: string;
  assessmentVersion: number;
  memberId: string;
  status: SessionStatus;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  sections: UnifiedAssessmentSection[];
  questions: UnifiedAssessmentQuestion[];
  answers: SessionAnswers;
}): AssessmentSession {
  const { visible, hidden } = calculateVisibleQuestions(params.questions, params.answers);
  const flat = flattenVisibleQuestions(params.sections, visible);
  const current = findFirstUnanswered(flat, params.answers);
  const completed = visible.filter((q) => params.answers[q.question_key] !== undefined);
  const progress = calculateProgress(visible, params.answers);
  const findings = deriveFindings(visible, params.answers);

  return {
    id: params.id,
    assessmentId: params.assessmentId,
    assessmentVersion: params.assessmentVersion,
    memberId: params.memberId,
    status: params.status,
    currentSection: current?.section ?? null,
    currentQuestion: current?.question ?? null,
    answers: params.answers,
    visibleQuestions: visible,
    completedQuestions: completed,
    hiddenQuestions: hidden,
    findings,
    flags: flagsFromFindings(findings),
    startedAt: params.startedAt,
    updatedAt: params.updatedAt,
    completedAt: params.completedAt,
    progress: { answered: progress.answered, visible: progress.visible },
    completionPercentage: progress.completionPercentage,
  };
}

/** Applies one answer to an in-memory answers map — the pure counterpart to data.ts's persistAnswer, useful for a caller that wants to preview the resulting session (e.g. a live progress bar) before the write round-trips. */
export function applyAnswer(answers: SessionAnswers, questionKey: string, value: AnswerValue): SessionAnswers {
  return { ...answers, [questionKey]: value };
}

export function isAssessmentComplete(
  questions: UnifiedAssessmentQuestion[],
  answers: SessionAnswers
): boolean {
  const { visible } = calculateVisibleQuestions(questions, answers);
  return visible.every((q) => answers[q.question_key] !== undefined);
}

export function questionAnsweredEvent(questionKey: string, value: AnswerValue): RuntimeEvent {
  return { type: 'question_answered', questionKey, value };
}
