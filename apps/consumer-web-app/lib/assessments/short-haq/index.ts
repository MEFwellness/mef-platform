/**
 * Short Health Assessment Questionnaire — typed export of
 * questionnaire.json. Original MEF Wellness content (see the "source"
 * field in questionnaire.json). This file does no transformation — it
 * only attaches the engine's generic Questionnaire type to the data.
 */

import type { Questionnaire } from '../engine/types';
import questionnaireData from './questionnaire.json';

export const SHORT_HAQ_QUESTIONNAIRE = questionnaireData as unknown as Questionnaire;
