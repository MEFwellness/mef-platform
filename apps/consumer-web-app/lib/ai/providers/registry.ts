/**
 * Provider registry — keyed lookup so calling code asks for "the
 * configured provider," never a specific SDK. Every entry here is an
 * UnconfiguredProvider stub: calling generateCompletion() throws a clear,
 * typed error rather than silently returning fabricated text or reaching
 * out to a real API. Wiring a real provider (OpenAI, Anthropic Claude,
 * Google Gemini, a local model) means replacing one entry in this map
 * with a real implementation of AiProvider — nothing else in lib/ai/
 * changes.
 */

import type { AiProvider, AiCompletionRequest, AiCompletionResult } from './types';

export const AI_PROVIDER_NAMES = ['openai', 'anthropic', 'google', 'local'] as const;
export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];

class UnconfiguredProvider implements AiProvider {
  constructor(public readonly name: string) {}

  async generateCompletion(_request: AiCompletionRequest): Promise<AiCompletionResult> {
    throw new Error(
      `AI provider "${this.name}" is not configured. This milestone builds the ` +
        'provider abstraction only — no provider is wired to a real API yet.'
    );
  }
}

const PROVIDERS: Record<AiProviderName, AiProvider> = {
  openai: new UnconfiguredProvider('openai'),
  anthropic: new UnconfiguredProvider('anthropic'),
  google: new UnconfiguredProvider('google'),
  local: new UnconfiguredProvider('local'),
};

export function getProvider(name: AiProviderName): AiProvider {
  return PROVIDERS[name];
}

/** Registers or swaps a provider implementation at runtime — this, not an if/else on provider name, is how a real integration gets wired in later without touching any calling code. */
export function registerProvider(name: AiProviderName, provider: AiProvider): void {
  PROVIDERS[name] = provider;
}
