/**
 * Provider registry for the AI Body Assessment Framework — same shape as
 * lib/ai/providers/registry.ts. Every entry is an UnconfiguredProvider
 * stub: calling analyzeAssessment() throws a clear, typed error rather
 * than silently fabricating landmarks or findings. Wiring a real provider
 * means replacing one entry in this map with a real implementation of
 * BodyAssessmentProvider — nothing else in lib/body-assessment/ or
 * app/actions/body-assessment.ts changes.
 */

import type {
  BodyAssessmentProvider,
  BodyAssessmentAnalysisRequest,
  BodyAssessmentAnalysisResult,
} from './types';

export const BODY_ASSESSMENT_PROVIDER_NAMES = [
  'openai_vision',
  'anthropic_vision',
  'google_gemini',
  'movenet',
  'mediapipe',
  'custom_model',
] as const;

export type BodyAssessmentProviderName = (typeof BODY_ASSESSMENT_PROVIDER_NAMES)[number];

class UnconfiguredBodyAssessmentProvider implements BodyAssessmentProvider {
  constructor(public readonly name: string) {}

  async analyzeAssessment(
    _request: BodyAssessmentAnalysisRequest
  ): Promise<BodyAssessmentAnalysisResult> {
    throw new Error(
      `Body assessment provider "${this.name}" is not configured. This milestone builds the ` +
        'assessment framework and provider abstraction only — no posture/movement analysis ' +
        'provider is wired to a real API yet.'
    );
  }
}

const PROVIDERS: Record<BodyAssessmentProviderName, BodyAssessmentProvider> = Object.fromEntries(
  BODY_ASSESSMENT_PROVIDER_NAMES.map((name) => [name, new UnconfiguredBodyAssessmentProvider(name)])
) as Record<BodyAssessmentProviderName, BodyAssessmentProvider>;

export function getBodyAssessmentProvider(
  name: BodyAssessmentProviderName
): BodyAssessmentProvider {
  return PROVIDERS[name];
}

/** Registers or swaps a provider implementation at runtime — this, not an if/else on provider name, is how a real integration (or a test double) gets wired in without touching any calling code. */
export function registerBodyAssessmentProvider(
  name: BodyAssessmentProviderName,
  provider: BodyAssessmentProvider
): void {
  PROVIDERS[name] = provider;
}

/**
 * Which provider is actually configured for this deployment, or null if
 * none is — callers (the "run analysis" action) treat null as "leave this
 * assessment in awaiting_provider state," never as an error. No hardcoded
 * default: same discipline as lib/ai/providers/anthropic.ts's
 * buildAnthropicProviderFromEnv.
 */
export function resolveConfiguredBodyAssessmentProvider(): BodyAssessmentProviderName | null {
  const configured = process.env.BODY_ASSESSMENT_PROVIDER;
  if (!configured) return null;
  return (BODY_ASSESSMENT_PROVIDER_NAMES as readonly string[]).includes(configured)
    ? (configured as BodyAssessmentProviderName)
    : null;
}
