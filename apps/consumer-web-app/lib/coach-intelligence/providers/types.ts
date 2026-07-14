/**
 * The provider boundary for the Coach Intelligence Workspace — mirrors
 * lib/body-assessment/providers/types.ts (which itself mirrors
 * lib/ai/providers/types.ts) exactly on purpose, one level more generic:
 * business logic (the submit/analyze flow, the Coach Review Dashboard's AI
 * Assistant panel) must never import a specific LLM SDK directly, or
 * swapping providers becomes a rewrite instead of a config change.
 *
 * Generic across assessment types by design: `sourceFeature`/`sourceRecordId`
 * is the same polymorphic pointer convention as AssessmentAiAnalysis
 * (mirrors SafetyClassification.source_feature) rather than a hard
 * dependency on body_assessments, and `context` is an intentionally untyped
 * bag — a body-assessment request passes signed capture URLs, a future
 * nutrition-assessment request would pass whatever it needs; each concrete
 * provider implementation decides what it reads out of it.
 *
 * Nothing in this milestone calls a real LLM. Every entry in registry.ts is
 * an UnconfiguredProvider stub — this file exists so that whichever future
 * milestone wires in a real provider (OpenAI, Anthropic, a custom model) has
 * a contract to implement rather than inventing one under deadline.
 */

import type { AiObservationCategory, AssessmentAiSourceFeature } from '@mef/shared-types-contracts';

export type CoachIntelligenceAnalysisRequest = {
  sourceFeature: AssessmentAiSourceFeature;
  sourceRecordId: string;
  memberId: string;
  /** Human-readable label for prompt-building/logging, e.g. "Static Posture". */
  assessmentTypeLabel: string;
  /** Provider-specific input bag — e.g. signed capture URLs for a body assessment. */
  context: Record<string, unknown>;
};

export type CoachIntelligenceObservationResult = {
  category: AiObservationCategory;
  text: string;
  confidence?: number;
  severity?: 'none' | 'mild' | 'moderate' | 'significant' | 'unknown';
  evidence?: { type: string; id: string; note?: string }[];
};

export type CoachIntelligenceAnalysisResult = {
  provider: string;
  model: string;
  summary: string;
  overallConfidence: number;
  observations: CoachIntelligenceObservationResult[];
};

export interface CoachIntelligenceProvider {
  readonly name: string;
  analyze(request: CoachIntelligenceAnalysisRequest): Promise<CoachIntelligenceAnalysisResult>;
}
