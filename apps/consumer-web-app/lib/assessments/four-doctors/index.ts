/**
 * Four Doctors Assessment — typed export of questionnaire.json. See
 * docs/assessments/four-doctors/SPEC.md for the full extraction and
 * reconciliation record (including the priorityBands proportional-scaling
 * amendment on Dr. Happiness, Dr. Quiet, and Dr. Diet). This file does no
 * transformation — it only attaches the engine's generic Questionnaire
 * type to the verified data.
 */

import type { Questionnaire } from '../engine/types';
import questionnaireData from './questionnaire.json';

export const FOUR_DOCTORS_QUESTIONNAIRE = questionnaireData as unknown as Questionnaire;
