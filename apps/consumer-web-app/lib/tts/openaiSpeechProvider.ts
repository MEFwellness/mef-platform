/**
 * Server-only natural-voice TTS provider — talks to OpenAI's audio/speech
 * endpoint over fetch, same "no SDK dependency, timeout + one retry,
 * env-driven with a null-if-unconfigured builder" shape as
 * lib/ai/providers/anthropic.ts. This exists because the browser's
 * built-in speechSynthesis (browserTextToSpeech.ts) is what actually makes
 * the coach voice sound robotic — it's a real OS/browser limitation, not a
 * tuning problem, so the fix is a server-generated voice instead. Reads
 * OPENAI_API_KEY from process.env only; this file must never be imported
 * from a client component, and the key never reaches the browser — the
 * one client-visible surface is app/api/speech/route.ts, which returns
 * audio bytes, never the key itself.
 */

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;

export type SpeechSynthesisResult =
  | { ok: true; audio: ArrayBuffer; contentType: string }
  | { ok: false; status: number; message: string };

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class OpenAiSpeechProvider {
  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {}

  async synthesize(text: string): Promise<SpeechSynthesisResult> {
    let lastMessage = 'Speech generation failed.';
    let lastStatus = 502;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(OPENAI_TTS_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini-tts',
            voice: 'coral',
            input: text,
            response_format: 'mp3',
            instructions:
              'Voice: a warm, calm, emotionally present wellness coach talking one-on-one with someone they know well, never a narrator, announcer, or voice assistant. ' +
              'Pacing: unhurried and natural, like real speech, not a read-aloud. Take a real breath and a brief, natural pause between sentences and between distinct thoughts, longer at paragraph breaks. ' +
              'Prosody: let pitch and energy rise and fall naturally with meaning rather than staying flat. Speak the most important word or phrase in each sentence with gentle emphasis, and let sentences fall in tone at the end the way a person naturally does, not clipped or robotic. ' +
              'Expression: soften and slow down for anything reassuring, personal, or sensitive; bring a touch more warmth and lift for encouragement or good news. Sound genuinely caring and present, intelligent and grounded, quietly confident, never rushed, never flat, never cheerful in a forced way, never corporate, never like a generic text-to-speech voice.',
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
          const bodyText = await response.text().catch(() => '');
          lastMessage = `OpenAI TTS returned ${response.status}: ${bodyText.slice(0, 300)}`;
          lastStatus = response.status;
          if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) continue;
          return { ok: false, status: response.status, message: lastMessage };
        }

        const audio = await response.arrayBuffer();
        return { ok: true, audio, contentType: response.headers.get('content-type') ?? 'audio/mpeg' };
      } catch (err) {
        clearTimeout(timer);
        const isAbort = err instanceof Error && err.name === 'AbortError';
        lastMessage = isAbort
          ? `OpenAI TTS timed out after ${this.timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : 'OpenAI TTS request failed';
        lastStatus = isAbort ? 504 : 502;
        if (attempt < MAX_ATTEMPTS) continue;
      }
    }

    return { ok: false, status: lastStatus, message: lastMessage };
  }
}

/** Returns null if OPENAI_API_KEY isn't set — the API route treats that as "natural voice not configured, fall back client-side," never as an error. */
export function buildOpenAiSpeechProviderFromEnv(): OpenAiSpeechProvider | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAiSpeechProvider(apiKey);
}
