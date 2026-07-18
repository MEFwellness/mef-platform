/**
 * CHEK HLC1 Nutrition & Lifestyle questionnaire — typed export of
 * questionnaire.json. See docs/assessments/chek-hlc1-nutrition-lifestyle/
 * SPEC.md for the full extraction and verification record (including the
 * Fungus & Parasites amendment: verified max is 115, not the score sheet's
 * printed 195). This file does no transformation — it only attaches the
 * engine's generic Questionnaire type to the verified data.
 */

import type { Questionnaire } from '../engine/types';
import questionnaireData from './questionnaire.json';

export const CHEK_HLC1_QUESTIONNAIRE = questionnaireData as unknown as Questionnaire;
