/**
 * Browser-native speech-to-text provider — wraps the Web Speech API's
 * `SpeechRecognition` (`webkitSpeechRecognition` in Safari/Chrome). This is
 * the "safest practical browser-native option" the milestone asks for:
 * this page's own JavaScript never receives, transmits, or stores a single
 * byte of raw audio — the browser/OS handles capture and recognition
 * out-of-process and only ever hands this code the resulting text via the
 * `result` event. That's what makes "audio is not saved" (part 6) an
 * accurate claim rather than a promise this code has to separately keep.
 *
 * A future premium provider (e.g. a streaming cloud STT service) would
 * implement the same `SpeechToTextProvider` interface from ./types and be
 * swapped in at the one call site in hooks/useSpeechToText.ts — nothing
 * else in the app would need to change.
 */

import type { SpeechToTextHandlers, SpeechToTextProvider } from './types';

/** Never listen indefinitely — part 1's "do not record indefinitely," backstopping `continuous: false` in case a given browser's own silence-detection is unusually slow to fire `onend`. */
const MAX_LISTENING_MS = 45_000;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function extractTranscript(event: unknown): { text: string; isFinal: boolean } | null {
  const e = event as {
    results?: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
  };
  const results = e.results;
  if (!results || results.length === 0) return null;
  const last = results[results.length - 1];
  if (!last || last.length === 0) return null;
  return { text: last[0]!.transcript, isFinal: last.isFinal };
}

function extractErrorCode(event: unknown): string {
  const e = event as { error?: string };
  return e.error ?? 'unknown';
}

export class BrowserSpeechToTextProvider implements SpeechToTextProvider {
  private recognition: SpeechRecognitionLike | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly Constructor: SpeechRecognitionConstructor | null;

  constructor() {
    this.Constructor = getRecognitionConstructor();
  }

  get isSupported(): boolean {
    return this.Constructor !== null;
  }

  start(handlers: SpeechToTextHandlers): void {
    if (!this.Constructor) {
      handlers.onStatusChange('unsupported');
      return;
    }

    this.clearTimeout();
    const recognition = new this.Constructor();
    this.recognition = recognition;
    recognition.lang =
      typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    handlers.onStatusChange('requesting_permission');

    recognition.onstart = () => {
      handlers.onStatusChange('listening');
    };
    recognition.onspeechend = () => {
      handlers.onStatusChange('processing');
    };
    recognition.onresult = (event: unknown) => {
      const extracted = extractTranscript(event);
      if (!extracted) return;
      if (extracted.isFinal) {
        handlers.onStatusChange('transcript_ready');
        handlers.onFinalTranscript(extracted.text);
      } else {
        handlers.onInterimTranscript(extracted.text);
      }
    };
    recognition.onerror = (event: unknown) => {
      const code = extractErrorCode(event);
      if (code === 'not-allowed' || code === 'permission-denied') {
        handlers.onStatusChange('permission_denied');
        return;
      }
      if (code === 'no-speech' || code === 'aborted') {
        // A member who tapped the mic and said nothing, or explicitly
        // cancelled — not a real error, just back to idle.
        handlers.onStatusChange('idle');
        return;
      }
      handlers.onError(`Speech recognition error: ${code}`);
      handlers.onStatusChange('error');
    };
    recognition.onend = () => {
      this.clearTimeout();
    };

    try {
      recognition.start();
    } catch (err) {
      handlers.onError(err instanceof Error ? err.message : 'Could not start voice input.');
      handlers.onStatusChange('error');
      return;
    }

    this.timeoutHandle = setTimeout(() => {
      this.stop();
    }, MAX_LISTENING_MS);
  }

  stop(): void {
    this.clearTimeout();
    this.recognition?.stop();
  }

  cancel(): void {
    this.clearTimeout();
    this.recognition?.abort();
  }

  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }
}

let sharedProvider: BrowserSpeechToTextProvider | null = null;

/** One provider instance per page (recognition sessions aren't meant to overlap) — lazily constructed so importing this module never touches `window` during SSR. */
export function getBrowserSpeechToTextProvider(): SpeechToTextProvider {
  if (!sharedProvider) sharedProvider = new BrowserSpeechToTextProvider();
  return sharedProvider;
}
