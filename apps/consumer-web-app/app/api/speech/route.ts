/**
 * Server-generated coach voice (part 3 of the mobile usability fixes).
 * lib/speech/serverTextToSpeech.ts is the only client-side caller — it
 * POSTs one short chunk of already-sanitized text at a time and expects
 * back either audio bytes or a JSON error it knows how to fall back from.
 *
 * Returns 501 when OPENAI_API_KEY isn't configured (this environment, for
 * instance) — that status code is a deliberate, documented signal the
 * client provider treats as "no natural voice available, use the browser
 * voice instead," not a real failure to alert the member about.
 */

import { NextResponse } from 'next/server';
import { buildOpenAiSpeechProviderFromEnv } from '@/lib/tts/openaiSpeechProvider';

export const dynamic = 'force-dynamic';

const MAX_TEXT_LENGTH = 600;

export async function POST(request: Request) {
  const provider = buildOpenAiSpeechProviderFromEnv();
  if (!provider) {
    return NextResponse.json({ error: 'not_configured' }, { status: 501 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const text = (body as { text?: unknown } | null)?.text;
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const result = await provider.synthesize(text.slice(0, MAX_TEXT_LENGTH));
  if (!result.ok) {
    console.error('[tts:generate] openai speech provider failed', result.status, result.message);
    return NextResponse.json({ error: 'generation_failed' }, { status: 502 });
  }

  return new Response(result.audio, {
    headers: {
      'content-type': result.contentType,
      'cache-control': 'no-store',
    },
  });
}
