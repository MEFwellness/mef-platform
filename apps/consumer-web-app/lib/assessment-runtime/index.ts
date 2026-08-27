export type {
  AnswerValue,
  AssessmentSession,
  DerivedFinding,
  FindingSeverity,
  RuntimeEvent,
  RuntimeFlag,
  SessionAnswers,
  SessionStatus,
} from './types';
export { PREFER_NOT_TO_ANSWER } from './types';

export type { Condition, ConditionOp, AndCondition, OrCondition, LeafCondition } from './conditions';
export { evaluateCondition, parseCondition, parseConditionList } from './conditions';

export type { FindingRule } from './findings';
export { deriveFindings } from './findings';

export type { FlatQuestionRef } from './session';
export {
  applyAnswer,
  buildSession,
  calculateProgress,
  calculateVisibleQuestions,
  findFirstUnanswered,
  flattenVisibleQuestions,
  isAssessmentComplete,
  jumpToQuestion,
  nextQuestion,
  previousQuestion,
  questionAnsweredEvent,
} from './session';

export {
  completeSession,
  findInProgressSession,
  findLatestCompletedSession,
  getSessionById,
  persistAnswer,
  startOrResumeSession,
} from './data';
export type { StartOrResumeResult } from './data';
