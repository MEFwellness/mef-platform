/**
 * Resolves the LLM provider the Conversation Coach should call, wiring
 * lib/ai/providers/anthropic.ts into the existing provider registry
 * (lib/ai/providers/registry.ts) rather than importing an SDK directly
 * from service.ts — a future provider swap (a different model, a second
 * vendor) means changing this one function, nothing downstream.
 *
 * Returns null when unconfigured (no ANTHROPIC_API_KEY / ANTHROPIC_MODEL
 * env var) — service.ts treats that exactly like a provider call failing,
 * routing to the fallback experience (section 16 of the milestone), never
 * as an unhandled error.
 */

import { getProvider, registerProvider } from '@/lib/ai/providers/registry';
import { buildAnthropicProviderFromEnv } from '@/lib/ai/providers/anthropic';
import type { AiProvider } from '@/lib/ai/providers/types';

let registered = false;
let loggedMissingConfig = false;

export function getConversationCoachProvider(): AiProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;

  const real = buildAnthropicProviderFromEnv();
  if (!real) {
    // Silent until now — a member sending a message and always getting the
    // fallback reply with nothing in the logs is exactly the failure mode
    // this is meant to prevent. Logged once per process (not once per
    // message) since the cause never changes without a restart.
    if (!loggedMissingConfig) {
      const missing = [
        !apiKey ? 'ANTHROPIC_API_KEY' : null,
        !model ? 'ANTHROPIC_MODEL' : null,
      ].filter(Boolean);
      console.error(
        `Conversation Coach: no LLM provider configured — missing env var(s): ${missing.join(', ')}. ` +
          'Every message will use the deterministic fallback reply until these are set in .env.local ' +
          'and the dev server is restarted (Next.js only reads .env.local at startup).'
      );
      loggedMissingConfig = true;
    }
    return null;
  }

  if (!registered) {
    registerProvider('anthropic', real);
    registered = true;
  }
  return getProvider('anthropic');
}

/** Test-only escape hatch, mirrors lib/feed/data.ts's clearContentCacheForTests. */
export function resetConversationCoachProviderForTests(): void {
  registered = false;
  loggedMissingConfig = false;
}
