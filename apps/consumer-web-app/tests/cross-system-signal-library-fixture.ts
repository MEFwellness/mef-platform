/**
 * A small, literal Signal Library for the adapter and view tests.
 *
 * DELIBERATELY NOT THE REAL SEED. These tests are about the mapping rules,
 * not about the hundred and forty standardized names migration 241 ships,
 * and a fixture that had to be edited every time somebody added a signal
 * name would be a test of the seed rather than of the code. The seed's own
 * integrity is checked separately, against the SQL, in
 * tests/cross-system-signal-schema.test.ts.
 */

import { mappingKey } from '@/lib/cross-system-signals/library';
import type {
  SignalBodyArea,
  SignalCategory,
  SignalLibrary,
  SignalSource,
  SignalSourceMapping,
  SignalSymptomType,
  StandardizedSignalName,
} from '@/lib/cross-system-signals/types';

const CATEGORIES: SignalCategory[] = [
  { categoryKey: 'joint_movement', position: 1, displayName: 'Joint/Movement' },
  { categoryKey: 'musculoskeletal', position: 2, displayName: 'Musculoskeletal' },
  { categoryKey: 'posture_alignment', position: 3, displayName: 'Posture/Alignment' },
  { categoryKey: 'pain_discomfort', position: 4, displayName: 'Pain/Discomfort' },
  { categoryKey: 'kidney_bladder', position: 5, displayName: 'Kidney/Bladder' },
  { categoryKey: 'digestion', position: 6, displayName: 'Digestion' },
  { categoryKey: 'respiratory', position: 7, displayName: 'Breathing/Respiratory' },
  { categoryKey: 'circulation', position: 8, displayName: 'Circulation' },
  { categoryKey: 'other', position: 9, displayName: 'Other' },
];

const BODY_AREAS: SignalBodyArea[] = [
  { areaKey: 'hip', position: 1, displayName: 'Hip', takesSide: true },
  { areaKey: 'low_back', position: 2, displayName: 'Low back', takesSide: true },
  { areaKey: 'abdomen', position: 3, displayName: 'Abdomen', takesSide: false },
  { areaKey: 'chest', position: 4, displayName: 'Chest', takesSide: true },
  { areaKey: 'hand', position: 5, displayName: 'Hand', takesSide: true },
  { areaKey: 'whole_body', position: 6, displayName: 'Whole body', takesSide: false },
];

const SYMPTOMS: SignalSymptomType[] = [
  {
    symptomKey: 'clicking',
    position: 1,
    displayName: 'Clicking',
    phrase: 'clicking',
    defaultCategoryKey: 'joint_movement',
  },
  {
    symptomKey: 'tightness',
    position: 2,
    displayName: 'Tightness',
    phrase: 'tightness',
    defaultCategoryKey: 'musculoskeletal',
  },
  {
    symptomKey: 'reduced_range',
    position: 3,
    displayName: 'Reduced range',
    phrase: 'reduced range',
    defaultCategoryKey: 'joint_movement',
  },
  {
    symptomKey: 'pain',
    position: 4,
    displayName: 'Pain',
    phrase: 'pain',
    defaultCategoryKey: 'pain_discomfort',
  },
];

const NAMES: StandardizedSignalName[] = [
  {
    signalSlug: 'bss-system-digestion',
    displayName: 'Digestion system signal',
    categoryKey: 'digestion',
    defaultBodyAreaKey: null,
    defaultSymptomKey: null,
    searchTerms: 'body systems section band',
    isCoachAddable: false,
  },
  {
    signalSlug: 'bss-system-kidney',
    displayName: 'Kidney and bladder system signal',
    categoryKey: 'kidney_bladder',
    defaultBodyAreaKey: null,
    defaultSymptomKey: null,
    searchTerms: 'body systems section band',
    isCoachAddable: false,
  },
  {
    signalSlug: 'wbs-section-digestive-flow',
    displayName: 'Digestive Flow section signal',
    categoryKey: 'digestion',
    defaultBodyAreaKey: null,
    defaultSymptomKey: null,
    searchTerms: 'whole body signal section band',
    isCoachAddable: false,
  },
  {
    signalSlug: 'breathing-pattern-total',
    displayName: 'Breathing pattern total score',
    categoryKey: 'respiratory',
    defaultBodyAreaKey: null,
    defaultSymptomKey: null,
    searchTerms: 'nijmegen',
    isCoachAddable: false,
  },
  {
    signalSlug: 'frequent-urination',
    displayName: 'Frequent urination',
    categoryKey: 'kidney_bladder',
    defaultBodyAreaKey: null,
    defaultSymptomKey: null,
    searchTerms: 'peeing often bladder',
    isCoachAddable: true,
  },
  {
    signalSlug: 'low-back-ache',
    displayName: 'Low-back ache',
    categoryKey: 'musculoskeletal',
    defaultBodyAreaKey: 'low_back',
    defaultSymptomKey: null,
    searchTerms: 'lumbar back pain',
    isCoachAddable: true,
  },
  {
    signalSlug: 'bloating-after-eating',
    displayName: 'Bloating after eating',
    categoryKey: 'digestion',
    defaultBodyAreaKey: 'abdomen',
    defaultSymptomKey: null,
    searchTerms: 'bloat swollen',
    isCoachAddable: true,
  },
  {
    signalSlug: 'cold-hands-or-feet',
    displayName: 'Cold hands or feet',
    categoryKey: 'circulation',
    defaultBodyAreaKey: 'hand',
    defaultSymptomKey: null,
    searchTerms: 'cold extremities',
    isCoachAddable: true,
  },
  {
    signalSlug: 'chest-tightness',
    displayName: 'Chest tightness',
    categoryKey: 'respiratory',
    defaultBodyAreaKey: 'chest',
    defaultSymptomKey: 'tightness',
    searchTerms: 'tight chest',
    isCoachAddable: true,
  },
  {
    signalSlug: 'uneven-hips',
    displayName: 'Uneven hips',
    categoryKey: 'posture_alignment',
    defaultBodyAreaKey: 'hip',
    defaultSymptomKey: null,
    searchTerms: 'hip asymmetry',
    isCoachAddable: true,
  },
  {
    signalSlug: 'forward-head-posture',
    displayName: 'Forward head posture',
    categoryKey: 'posture_alignment',
    defaultBodyAreaKey: null,
    defaultSymptomKey: null,
    searchTerms: 'head carriage',
    isCoachAddable: true,
  },
  {
    signalSlug: 'daily-pain-or-discomfort',
    displayName: 'Daily pain or discomfort',
    categoryKey: 'pain_discomfort',
    defaultBodyAreaKey: 'whole_body',
    defaultSymptomKey: 'pain',
    searchTerms: 'daily check in pain',
    isCoachAddable: true,
  },
  {
    signalSlug: 'hip-clicking',
    displayName: 'Hip clicking',
    categoryKey: 'joint_movement',
    defaultBodyAreaKey: 'hip',
    defaultSymptomKey: 'clicking',
    searchTerms: 'click snap pop hip',
    isCoachAddable: true,
  },
];

const SOURCES: SignalSource[] = [
  {
    sourceKey: 'body_systems_survey',
    position: 1,
    displayName: 'Rooted Reset Body Systems Survey',
    assessmentDefinitionId: null,
  },
  {
    sourceKey: 'whole_body_signal',
    position: 2,
    displayName: 'Rooted Reset Whole-Body Signal Assessment',
    assessmentDefinitionId: null,
  },
  {
    sourceKey: 'breathing_pattern_check_in',
    position: 3,
    displayName: 'Breathing Pattern Check-In',
    assessmentDefinitionId: null,
  },
  {
    sourceKey: 'body_assessment',
    position: 4,
    displayName: 'Posture and movement assessment',
    assessmentDefinitionId: null,
  },
  {
    sourceKey: 'daily_check_in',
    position: 5,
    displayName: 'Daily Check-In',
    assessmentDefinitionId: null,
  },
  {
    sourceKey: 'coach_entered',
    position: 6,
    displayName: 'Coach entered',
    assessmentDefinitionId: null,
  },
];

const MAPPINGS: SignalSourceMapping[] = [
  m('body_systems_survey', 'section', 'digestion', 'bss-system-digestion'),
  m('body_systems_survey', 'section', 'kidney', 'bss-system-kidney'),
  m('body_systems_survey', 'question', 'D1', 'bloating-after-eating'),
  m('body_systems_survey', 'question', 'K2', 'frequent-urination'),
  m('body_systems_survey', 'question', 'M7', 'low-back-ache', 'low_back'),
  m('body_systems_survey', 'question', 'T2', 'cold-hands-or-feet', 'hand'),
  m('whole_body_signal', 'section', 'digestive_flow', 'wbs-section-digestive-flow'),
  m('breathing_pattern_check_in', 'metric', 'total_score', 'breathing-pattern-total'),
  m('breathing_pattern_check_in', 'item', 'tight_chest', 'chest-tightness', 'chest'),
  m('breathing_pattern_check_in', 'item', 'cold_hands_feet', 'cold-hands-or-feet', 'hand'),
  m('body_assessment', 'finding_type', 'hip_asymmetry', 'uneven-hips', 'hip'),
  m('body_assessment', 'finding_type', 'forward_head', 'forward-head-posture'),
  m('daily_check_in', 'metric', 'pain_discomfort_level', 'daily-pain-or-discomfort', 'whole_body'),
];

function m(
  sourceKey: string,
  externalKind: SignalSourceMapping['externalKind'],
  externalKey: string,
  signalSlug: string,
  bodyAreaKey: string | null = null
): SignalSourceMapping {
  return { sourceKey, externalKind, externalKey, signalSlug, bodyAreaKey };
}

export const TEST_LIBRARY: SignalLibrary = {
  categories: new Map(CATEGORIES.map((row) => [row.categoryKey, row])),
  bodyAreas: new Map(BODY_AREAS.map((row) => [row.areaKey, row])),
  symptoms: new Map(SYMPTOMS.map((row) => [row.symptomKey, row])),
  names: new Map(NAMES.map((row) => [row.signalSlug, row])),
  sources: new Map(SOURCES.map((row) => [row.sourceKey, row])),
  mappings: new Map(
    MAPPINGS.map((row) => [mappingKey(row.sourceKey, row.externalKind, row.externalKey), row])
  ),
};

export const TEST_NAMES = NAMES;
export const TEST_CATEGORIES = CATEGORIES;
export const TEST_BODY_AREAS = BODY_AREAS;
export const TEST_SYMPTOMS = SYMPTOMS;
