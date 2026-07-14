/**
 * The Personal Wellness Intelligence Engine (Milestone 6) — pure domain
 * types. Mirrors the narrative module's own draft/row split
 * (lib/narrative/types.ts's NarrativeItemDraft vs the persisted
 * NarrativeItem): every detector below returns a WellnessInsightDraft,
 * never a database row directly — lib/intelligence/service.ts is the
 * only place that turns a draft into a persisted `wellness_insights` row.
 *
 * Nothing in this file does I/O. Every detector is a pure function over
 * already-fetched history, same discipline as lib/wellness/insights.ts
 * and lib/narrative/generator.ts.
 */

import type {
  WellnessArea,
  WellnessInsightEvidenceRef,
  WellnessInsightSeverity,
  WellnessInsightType,
  WellnessIntelligenceTimeWindow,
  WellnessTrendState,
  WellnessTrendStrength,
} from '@mef/shared-types-contracts';
import type { WellnessMetricKey } from '../wellness/wellness-index';

export type WellnessInsightDraft = {
  insightType: WellnessInsightType;
  wellnessArea: WellnessArea | null;
  trendState: WellnessTrendState | null;
  trendStrength: WellnessTrendStrength | null;
  /** Identifies which detector produced this — used for dedup/supersede. See lib/intelligence/data.ts. */
  patternKey: string;
  title: string;
  memberSummary: string;
  coachDetail: string;
  confidence: number;
  severity: WellnessInsightSeverity;
  timeWindow: WellnessIntelligenceTimeWindow;
  evidenceRefs: WellnessInsightEvidenceRef[];
  reasoningCodes: string[];
  recommendedCoachingResponse: string | null;
  recommendedCoachAction: string | null;
  /** False only when the detector itself judges this unsafe for direct member framing (rare — most gating happens centrally in lib/intelligence/safety.ts against real restricted topics). */
  memberVisible: boolean;
};

/** Priority Intelligence (section 6) — the longer-term picture the Coaching Brain may consume; never a replacement for its own daily decision. */
export type PriorityIntelligence = {
  primaryPriority: WellnessArea | null;
  secondaryPriority: WellnessArea | null;
  areaToMaintain: WellnessArea | null;
  emergingConcern: WellnessArea | null;
  strongestCurrentArea: WellnessArea | null;
  recommendedCoachAttentionLevel: 'none' | 'monitor' | 'discuss' | 'priority';
};

export const WELLNESS_METRIC_AREAS: WellnessMetricKey[] = [
  'sleep',
  'stress',
  'energy',
  'mood',
  'hydration',
  'digestion',
  'movement',
  'pain',
];

export const FOUR_DOCTORS_AREAS: WellnessArea[] = [
  'doctor_movement',
  'doctor_diet',
  'doctor_quiet',
  'doctor_happiness',
];
