/**
 * The provider boundary for the AI Body Assessment Framework — mirrors
 * lib/ai/providers/types.ts exactly on purpose: business logic (the
 * assessment submit/analyze flow, the comparison engine, the coach
 * dashboard) must never import a vision SDK or a specific pose-estimation
 * model directly, or swapping providers becomes a rewrite instead of a
 * config change.
 *
 * Nothing in this milestone calls a real vision provider — every entry in
 * registry.ts is an UnconfiguredProvider stub. This file exists so that
 * whichever future milestone wires in a real posture/movement analysis
 * provider (OpenAI vision, Anthropic vision, Google Gemini, a specialized
 * posture API, MoveNet, MediaPipe, a custom model) has a contract to
 * implement rather than inventing one under deadline.
 */

import type {
  BodyAssessmentCaptureType,
  BodyAssessmentMediaType,
  BodyAssessmentType,
  BodyLandmarkPoint,
  PostureFindingType,
  FindingSide,
  FindingSeverity,
  FindingEvidenceRef,
} from '@mef/shared-types-contracts';

export type BodyAssessmentCaptureInput = {
  captureId: string;
  captureType: BodyAssessmentCaptureType;
  mediaType: BodyAssessmentMediaType;
  /**
   * A short-lived signed URL the provider fetches the media from — never
   * raw bytes in this request object, so a request stays small and safe
   * to log. See lib/body-assessment/storage.ts's createSignedCaptureUrl.
   */
  signedUrl: string;
};

export type BodyAssessmentAnalysisRequest = {
  assessmentId: string;
  memberId: string;
  assessmentType: BodyAssessmentType;
  captures: BodyAssessmentCaptureInput[];
};

export type BodyLandmarkSetResult = {
  captureId: string;
  landmarks: BodyLandmarkPoint[];
};

export type BodyAssessmentFindingResult = {
  findingType: PostureFindingType;
  side: FindingSide;
  severity: FindingSeverity;
  confidence: number;
  narrative: string;
  evidence: FindingEvidenceRef[];
};

export type BodyAssessmentAnalysisResult = {
  provider: string;
  model: string;
  landmarkSets: BodyLandmarkSetResult[];
  findings: BodyAssessmentFindingResult[];
};

export interface BodyAssessmentProvider {
  readonly name: string;
  analyzeAssessment(request: BodyAssessmentAnalysisRequest): Promise<BodyAssessmentAnalysisResult>;
}
