/**
 * The first real AiProvider implementation (Milestone 7) — everything
 * before this milestone left every entry in registry.ts as an
 * UnconfiguredProvider stub. Talks to the Anthropic Messages API directly
 * over fetch rather than adding an SDK dependency, since AiCompletionRequest
 * already is the minimal shape this app needs (system + user prompt in,
 * text out) and this keeps the provider boundary (types.ts) the only
 * contract business logic ever sees.
 *
 * Server-only: reads its API key from process.env, never accepts one as a
 * constructor default, and this file must never be imported from a
 * client component.
 */

import type { AiProvider, AiCompletionRequest, AiCompletionResult } from './types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 429/5xx are worth a retry (rate limit or transient outage); 4xx otherwise means our own request is wrong and retrying won't help. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Marks a thrown error as already-final so the catch block below never retries it — a genuine 4xx means retrying would just fail the same way again. */
class NonRetryableApiError extends Error {
  readonly nonRetryable = true;
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {}

  async generateCompletion(request: AiCompletionRequest): Promise<AiCompletionResult> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_API_VERSION,
          },
          // `temperature` deliberately omitted: this account's current
          // model rejects it outright ("`temperature` is deprecated for
          // this model", a 400 invalid_request_error) rather than clamping
          // or ignoring it — sending it at all fails every request.
          // request.temperature is kept in AiCompletionRequest for other
          // future providers/models that do accept it; this provider just
          // never forwards it.
          body: JSON.stringify({
            model: this.model,
            max_tokens: request.maxOutputTokens ?? 500,
            ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
            messages: [{ role: 'user', content: request.userPrompt }],
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
          const bodyText = await response.text().catch(() => '');
          const message = `Anthropic API returned ${response.status}: ${bodyText.slice(0, 300)}`;
          if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
            lastError = new Error(message);
            await sleep(RETRY_BASE_DELAY_MS * attempt);
            continue;
          }
          // Thrown as a distinct type so the catch block below (which
          // exists to retry network/abort failures) recognizes this as
          // already-final and re-throws it immediately instead of
          // retrying a request that will only ever fail the same way.
          throw new NonRetryableApiError(message);
        }

        const json = (await response.json()) as {
          content?: Array<{ type: string; text?: string }>;
          stop_reason?: string;
          usage?: { input_tokens?: number; output_tokens?: number };
        };

        const content = (json.content ?? [])
          .map((block) => block.text ?? '')
          .join('')
          .trim();

        if (!content) {
          // A 200 with no usable text is a real problem (e.g. max_tokens hit
          // before any text block, an unexpected response shape, or a
          // refusal) — silently returning '' here would make the caller's
          // eventual fallback look identical to "provider not configured,"
          // hiding a diagnosable cause. Logging the raw shape (not user
          // content) makes that visible without leaking prompt/PII.
          console.error(
            `Anthropic provider returned a 200 with no text content (stop_reason: ${json.stop_reason ?? 'unknown'}, ` +
              `content blocks: ${json.content?.length ?? 0}, model: ${this.model}).`
          );
        }

        return {
          content,
          provider: this.name,
          model: this.model,
          ...(json.usage
            ? {
                usage: {
                  promptTokens: json.usage.input_tokens ?? 0,
                  completionTokens: json.usage.output_tokens ?? 0,
                },
              }
            : {}),
        };
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof NonRetryableApiError) throw err;

        lastError = err;
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if (attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        if (isAbort) {
          throw new Error(`Anthropic provider timed out after ${this.timeoutMs}ms`);
        }
        throw err instanceof Error ? err : new Error('Anthropic provider failed');
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Anthropic provider failed');
  }
}

/**
 * Builds a real provider from environment configuration, or returns null
 * if unconfigured — callers (lib/conversation-coach/provider.ts) treat
 * null as "fall back to the deterministic fallback experience," never as
 * an error. No hardcoded model default: fabricating one risks silently
 * pointing at a model id that doesn't exist on the caller's account, which
 * is worse than a clear "not configured" state. See
 * apps/consumer-web-app/.env.local.example for the required variables.
 */
export function buildAnthropicProviderFromEnv(): AiProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) return null;
  return new AnthropicProvider(apiKey, model);
}
