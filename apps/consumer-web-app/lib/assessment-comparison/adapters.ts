import type { ComparisonTrend } from '@mef/shared-types-contracts';
import type { ComparisonMetric } from '../onboarding/comparison';
import type { ComparisonDirection as QuestionnaireEngineDirection } from '../assessments/comparison';
import type { WbsaComparisonTrend } from '../wbsa/comparison';
import type { ComparisonDirection } from './types';

/**
 * Pure translators from each existing comparison module's real output
 * type into the canonical ComparisonDirection (see types.ts). None of
 * these change the source module — they let a future cross-assessment
 * view show one consistent vocabulary without touching four separately
 * tested modules. Lossy where the source vocabulary already collapsed
 * 'new'/'resolved' into 'improved'/'declined' — noted per function.
 */

/** lib/onboarding/comparison.ts's ComparisonMetric.direction. */
export function fromOnboardingDirection(direction: ComparisonMetric['direction']): ComparisonDirection | null {
  switch (direction) {
    case 'improved':
      return 'improved';
    case 'declined':
      return 'worsened';
    case 'stable':
      return 'unchanged';
    case null:
      return null;
  }
}

/**
 * lib/body-assessment/comparison.ts's ComparisonTrend. That module already
 * folds "new finding" into 'declined' and "no longer observed" into
 * 'improved' (see its own summarizeDimension comments) — this adapter
 * cannot recover 'new'/'resolved' from a trend value alone.
 */
export function fromBodyAssessmentTrend(trend: ComparisonTrend): ComparisonDirection | null {
  switch (trend) {
    case 'improved':
      return 'improved';
    case 'declined':
      return 'worsened';
    case 'stable':
      return 'unchanged';
    case 'unknown':
      return null;
  }
}

/** lib/assessments/comparison.ts's ComparisonDirection (the generic questionnaire engine — CHEK HLC1/Four Doctors/Short-HAQ). */
export function fromQuestionnaireEngineDirection(direction: QuestionnaireEngineDirection): ComparisonDirection | null {
  switch (direction) {
    case 'improved':
      return 'improved';
    case 'regressed':
      return 'worsened';
    case 'unchanged':
      return 'unchanged';
    case 'unknown':
      return null;
  }
}

/** lib/wbsa/comparison.ts's WbsaComparisonTrend (the Unified Adaptive Assessment Runtime's first real content). Same "cannot recover new/resolved from a trend value alone" limitation as fromBodyAssessmentTrend. */
export function fromWbsaDirection(trend: WbsaComparisonTrend): ComparisonDirection | null {
  switch (trend) {
    case 'improved':
      return 'improved';
    case 'declined':
      return 'worsened';
    case 'stable':
      return 'unchanged';
    case 'unknown':
      return null;
  }
}
