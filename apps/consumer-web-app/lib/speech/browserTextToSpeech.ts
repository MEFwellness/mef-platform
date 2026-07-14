/**
 * Browser-native text-to-speech provider — wraps `window.speechSynthesis`.
 * Same "safest practical browser-native option, architecture ready for a
 * premium voice provider later" posture as browserSpeechToText.ts: a
 * future provider (e.g. a higher-quality cloud TTS voice) implements the
 * same `TextToSpeechProvider` interface from ./types and swaps in at the
 * one call site in hooks/useTextToSpeech.ts.
 */

import type { TextToSpeechHandlers, TextToSpeechProvider } from './types';

/** A calm, natural speaking pace (part 2) — speechSynthesis's default (1.0) reads slightly quick for coaching copy; this is a gentle slowdown, not a dramatic one. */
const SPEECH_RATE = 0.95;

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Prefers a local, natural-sounding English voice when the browser exposes one — best-effort only; `undefined` (the browser's own default voice) is a completely fine fallback. */
function pickVoice(): SpeechSynthesisVoice | undefined {
  if (!isSupported()) return undefined;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.startsWith('en') && v.localService) ??
    voices.find((v) => v.lang.startsWith('en'))
  );
}

export class BrowserTextToSpeechProvider implements TextToSpeechProvider {
  private utterance: SpeechSynthesisUtterance | null = null;

  get isSupported(): boolean {
    return isSupported();
  }

  speak(text: string, handlers: TextToSpeechHandlers): void {
    if (!isSupported()) {
      handlers.onError('Speech playback is not supported in this browser.');
      handlers.onStatusChange('error');
      return;
    }

    // Only one utterance at a time is meaningful for a single provider
    // instance — cross-button coordination is playbackRegistry.ts's job,
    // but if this exact instance already has something queued, clear it
    // first so a rapid replay doesn't stack utterances.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = SPEECH_RATE;
    const voice = pickVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => handlers.onStatusChange('playing');
    utterance.onresume = () => handlers.onStatusChange('playing');
    utterance.onpause = () => handlers.onStatusChange('paused');
    utterance.onend = () => handlers.onStatusChange('stopped');
    utterance.onerror = (event) => {
      // The synthesizer reports its own stop/cancel as an "error" event
      // (`event.error === 'canceled'`/`'interrupted'`) — that's an
      // intentional stop, not a real failure, and must not surface as one.
      if (event.error === 'canceled' || event.error === 'interrupted') {
        handlers.onStatusChange('stopped');
        return;
      }
      handlers.onError(`Speech playback error: ${event.error}`);
      handlers.onStatusChange('error');
    };

    this.utterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  pause(): void {
    if (isSupported()) window.speechSynthesis.pause();
  }

  resume(): void {
    if (isSupported()) window.speechSynthesis.resume();
  }

  stop(): void {
    this.utterance = null;
    if (isSupported()) window.speechSynthesis.cancel();
  }
}

let sharedProvider: BrowserTextToSpeechProvider | null = null;

export function getBrowserTextToSpeechProvider(): TextToSpeechProvider {
  if (!sharedProvider) sharedProvider = new BrowserTextToSpeechProvider();
  return sharedProvider;
}
