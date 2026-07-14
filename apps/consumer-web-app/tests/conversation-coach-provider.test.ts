/**
 * Unit tests for the first real AiProvider implementation
 * (lib/ai/providers/anthropic.ts) — no Supabase involved, only global
 * fetch is stubbed. Confirms retry-on-transient-failure, no-retry on a
 * genuine client error, and timeout behavior, per section 18's "provider
 * failure and retry" / "provider timeout" requirements.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AnthropicProvider, buildAnthropicProviderFromEnv } from '../lib/ai/providers/anthropic';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('AnthropicProvider — success path', () => {
  it('returns the joined text content on a 200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'there.' },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
    ) as unknown as typeof fetch;

    const provider = new AnthropicProvider('fake-key', 'fake-model');
    const result = await provider.generateCompletion({ userPrompt: 'hi' });

    expect(result.content).toBe('Hello there.');
    expect(result.provider).toBe('anthropic');
    expect(result.model).toBe('fake-model');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('AnthropicProvider — retry behavior', () => {
  it('retries on a 429 and succeeds on a later attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: 'rate limited' }))
      .mockResolvedValueOnce(jsonResponse(200, { content: [{ type: 'text', text: 'ok' }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AnthropicProvider('fake-key', 'fake-model');
    const result = await provider.generateCompletion({ userPrompt: 'hi' });

    expect(result.content).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on a 500 and eventually throws if it never recovers', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { error: 'boom' })) as unknown as typeof fetch;

    const provider = new AnthropicProvider('fake-key', 'fake-model');
    await expect(provider.generateCompletion({ userPrompt: 'hi' })).rejects.toThrow(/500/);
    expect(global.fetch).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS
  });

  it('does not retry on a non-retryable 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { error: 'bad request' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AnthropicProvider('fake-key', 'fake-model');
    await expect(provider.generateCompletion({ userPrompt: 'hi' })).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('AnthropicProvider — timeout', () => {
  it('aborts and throws a timeout error when the request never resolves', async () => {
    global.fetch = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    ) as unknown as typeof fetch;

    const provider = new AnthropicProvider('fake-key', 'fake-model', 20);
    await expect(provider.generateCompletion({ userPrompt: 'hi' })).rejects.toThrow(/timed out/);
  }, 10000);
});

describe('buildAnthropicProviderFromEnv', () => {
  it('returns null when unconfigured, never a fabricated provider', () => {
    expect(buildAnthropicProviderFromEnv()).toBeNull();
  });

  it('returns a real provider once both env vars are set', () => {
    process.env.ANTHROPIC_API_KEY = 'key';
    process.env.ANTHROPIC_MODEL = 'model';
    const provider = buildAnthropicProviderFromEnv();
    expect(provider).not.toBeNull();
    expect(provider?.name).toBe('anthropic');
  });
});
