/**
 * The provider hooks/useTextToSpeech.ts actually talks to — prefers the
 * server-generated natural voice (serverTextToSpeech.ts) and falls back
 * to the browser voice (browserTextToSpeech.ts) the first time the server
 * one fails to ever start playing (most commonly: OPENAI_API_KEY isn't
 * configured in this environment, so /api/speech returns 501). That
 * fallback decision is cached at module scope for the rest of the page's
 * lifetime — if it flipped to "browser" it stays there, so a member never
 * pays a 20-second timeout on every single message once we already know
 * the natural voice isn't reachable.
 */

import { getBrowserTextToSpeechProvider } from './browserTextToSpeech';
import { getServerTextToSpeechProvider } from './serverTextToSpeech';
import type { TextToSpeechHandlers, TextToSpeechProvider } from './types';

type ProviderMode = 'unknown' | 'server' | 'browser';
let mode: ProviderMode = 'unknown';

function activeProvider(): TextToSpeechProvider {
  return mode === 'browser' ? getBrowserTextToSpeechProvider() : getServerTextToSpeechProvider();
}

class FallbackTextToSpeechProvider implements TextToSpeechProvider {
  get isSupported(): boolean {
    return getServerTextToSpeechProvider().isSupported || getBrowserTextToSpeechProvider().isSupported;
  }

  speak(text: string, handlers: TextToSpeechHandlers): void {
    const server = getServerTextToSpeechProvider();
    if (mode === 'browser' || !server.isSupported) {
      getBrowserTextToSpeechProvider().speak(text, handlers);
      return;
    }

    let everPlayed = false;
    server.speak(text, {
      onStatusChange: (status) => {
        if (status === 'playing') {
          mode = 'server';
          everPlayed = true;
        }
        handlers.onStatusChange(status);
      },
      onError: (message) => {
        if (!everPlayed && mode === 'unknown') {
          // Never once got a natural-voice utterance playing this
          // session — treat this as "not available here," fall back
          // quietly rather than surfacing an error the member can't fix.
          mode = 'browser';
          getBrowserTextToSpeechProvider().speak(text, handlers);
          return;
        }
        handlers.onError(message);
      },
    });
  }

  pause(): void {
    activeProvider().pause();
  }

  resume(): void {
    activeProvider().resume();
  }

  stop(): void {
    // Both, unconditionally: whichever one is mid-request/mid-playback
    // needs to be torn down, and stopping the inactive one is a no-op.
    getServerTextToSpeechProvider().stop();
    getBrowserTextToSpeechProvider().stop();
  }
}

let shared: FallbackTextToSpeechProvider | null = null;

export function getTextToSpeechProvider(): TextToSpeechProvider {
  if (!shared) shared = new FallbackTextToSpeechProvider();
  return shared;
}

/** Test-only reset — `mode` is a module-level singleton, same reason lib/speech/playbackRegistry.ts has one. */
export function _resetTextToSpeechProviderModeForTests(): void {
  mode = 'unknown';
}
