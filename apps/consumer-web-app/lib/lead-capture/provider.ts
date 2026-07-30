/**
 * Resolves the LLM provider for the Lead Capture Agent. Deliberately its
 * own file rather than importing lib/conversation-coach/provider.ts —
 * that file is Root's own wiring and this feature must stay decoupled
 * from Root entirely. Reuses the same underlying provider implementation
 * (lib/ai/providers/anthropic.ts's AnthropicProvider) directly rather than
 * through lib/ai/providers/registry.ts: the registry's PROVIDERS map has
 * exactly one 'anthropic' slot, so registering a second instance there
 * under a possibly-different model (LEAD_AGENT_ANTHROPIC_MODEL) would
 * silently overwrite/collide with whichever feature (Root or this one)
 * registered last. A private singleton avoids that entirely while still
 * reusing the real provider class, not a re-implementation of it.
 *
 * Returns null when unconfigured — the route handler treats that exactly
 * like a provider call failing, falling back to the deterministic
 * templated copy in fallback.ts, never an unhandled error surfaced to an
 * anonymous visitor.
 */

import { AnthropicProvider } from '@/lib/ai/providers/anthropic';
import type { AiProvider } from '@/lib/ai/providers/types';

let cached: AiProvider | null = null;
let cachedKey: string | null = null;

export function getLeadCaptureProvider(): AiProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.LEAD_AGENT_ANTHROPIC_MODEL ?? process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) return null;

  const key = `${apiKey}:${model}`;
  if (!cached || cachedKey !== key) {
    cached = new AnthropicProvider(apiKey, model);
    cachedKey = key;
  }
  return cached;
}

/** Test-only escape hatch, mirrors lib/conversation-coach/provider.ts's resetConversationCoachProviderForTests. */
export function resetLeadCaptureProviderForTests(): void {
  cached = null;
  cachedKey = null;
}
