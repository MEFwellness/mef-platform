/**
 * Provider registry for the Coach Intelligence Workspace — same shape as
 * lib/body-assessment/providers/registry.ts. Every entry is an
 * UnconfiguredProvider stub: calling analyze() throws a clear, typed error
 * rather than silently fabricating a summary or observations. Wiring a real
 * provider means replacing one entry in this map with a real implementation
 * of CoachIntelligenceProvider — nothing else in lib/coach-intelligence/ or
 * app/actions/coach-intelligence.ts changes.
 */

import type {
  CoachIntelligenceProvider,
  CoachIntelligenceAnalysisRequest,
  CoachIntelligenceAnalysisResult,
} from './types';

export const COACH_INTELLIGENCE_PROVIDER_NAMES = [
  'openai_gpt4',
  'anthropic_claude',
  'custom_model',
] as const;

export type CoachIntelligenceProviderName = (typeof COACH_INTELLIGENCE_PROVIDER_NAMES)[number];

class UnconfiguredCoachIntelligenceProvider implements CoachIntelligenceProvider {
  constructor(public readonly name: string) {}

  async analyze(_request: CoachIntelligenceAnalysisRequest): Promise<CoachIntelligenceAnalysisResult> {
    throw new Error(
      `Coach Intelligence provider "${this.name}" is not configured. This milestone builds the ` +
        'AI-assisted coach review workflow and provider abstraction only — no real AI API is ' +
        'wired in yet.'
    );
  }
}

const PROVIDERS: Record<CoachIntelligenceProviderName, CoachIntelligenceProvider> =
  Object.fromEntries(
    COACH_INTELLIGENCE_PROVIDER_NAMES.map((name) => [
      name,
      new UnconfiguredCoachIntelligenceProvider(name),
    ])
  ) as Record<CoachIntelligenceProviderName, CoachIntelligenceProvider>;

export function getCoachIntelligenceProvider(
  name: CoachIntelligenceProviderName
): CoachIntelligenceProvider {
  return PROVIDERS[name];
}

/** Registers or swaps a provider implementation at runtime — this, not an if/else on provider name, is how a real integration (or a test double) gets wired in without touching any calling code. */
export function registerCoachIntelligenceProvider(
  name: CoachIntelligenceProviderName,
  provider: CoachIntelligenceProvider
): void {
  PROVIDERS[name] = provider;
}

/**
 * Which provider is actually configured for this deployment, or null if
 * none is — callers (performCoachIntelligenceAnalysis) treat null as "leave
 * this analysis in not_configured state," never as an error. No hardcoded
 * default: same discipline as resolveConfiguredBodyAssessmentProvider.
 */
export function resolveConfiguredCoachIntelligenceProvider(): CoachIntelligenceProviderName | null {
  const configured = process.env.COACH_INTELLIGENCE_PROVIDER;
  if (!configured) return null;
  return (COACH_INTELLIGENCE_PROVIDER_NAMES as readonly string[]).includes(configured)
    ? (configured as CoachIntelligenceProviderName)
    : null;
}
