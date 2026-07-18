/**
 * Reusable Assessment Engine — registry. This is the *only* file that
 * needs a new line when a future questionnaire ships: add a
 * lib/assessments/<questionnaire-id>/ folder with its own questionnaire.json
 * (source-of-truth data, verified against its own spec exactly like CHEK
 * HLC1 was) and copy.ts (results-page presentation content), then register
 * it below. No route, component, server action, or database migration
 * needs to change — every UI surface under app/assessments/[questionnaireId]/
 * and every function in lib/assessments/store.ts resolves the
 * questionnaire generically through this registry.
 */

import type { AssessmentDefinition } from './engine/types';
import { CHEK_HLC1_QUESTIONNAIRE } from './chek-hlc1';
import { CHEK_HLC1_COPY } from './chek-hlc1/copy';

const REGISTRY: Record<string, AssessmentDefinition> = {
  [CHEK_HLC1_QUESTIONNAIRE.id]: {
    questionnaire: CHEK_HLC1_QUESTIONNAIRE,
    copy: CHEK_HLC1_COPY,
  },
};

export function getAssessmentDefinition(questionnaireId: string): AssessmentDefinition {
  const definition = REGISTRY[questionnaireId];
  if (!definition) {
    throw new Error(`Unknown questionnaire id: "${questionnaireId}"`);
  }
  return definition;
}

export function findAssessmentDefinition(questionnaireId: string): AssessmentDefinition | null {
  return REGISTRY[questionnaireId] ?? null;
}

export function listAssessmentDefinitions(): AssessmentDefinition[] {
  return Object.values(REGISTRY);
}
