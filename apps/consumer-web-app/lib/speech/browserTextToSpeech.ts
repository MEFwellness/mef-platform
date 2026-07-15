/**
 * Browser-native text-to-speech provider — wraps `window.speechSynthesis`.
 * This is the fallback voice: lib/speech/textToSpeechProvider.ts prefers
 * the server-generated natural voice (serverTextToSpeech.ts) and only
 * drops down to this one when that isn't configured or reachable, since
 * speechSynthesis is the actual source of the "robotic" complaint this
 * milestone fixes — there's no tuning that turns an OS TTS voice into a
 * natural one, only a genuinely different voice source can. This still
 * implements the full TextToSpeechProvider interface so it's a complete,
 * usable experience entirely on its own (offline, no server, no cost).
 */

import type { TextToSpeechHandlers, TextToSpeechProvider } from './types';

/** A calm, natural speaking pace — speechSynthesis's default (1.0) reads slightly quick for coaching copy; this is a gentle slowdown, not a dramatic one. */
const SPEECH_RATE = 0.96;
/** Very slightly lower than default (1.0) — reads as warmer, less clipped, without sounding artificially deep. */
const SPEECH_PITCH = 0.96;

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Prefers whichever installed voice sounds least "robotic": explicit
 * natural/neural/enhanced/premium voices first, then Chrome's network
 * Google voices (audibly smoother than most local OS voices even though
 * they're not on-device), then any local English voice, then whatever
 * English voice exists at all. `undefined` (the browser's own default) is
 * a completely fine last resort.
 */
function pickVoice(): SpeechSynthesisVoice | undefined {
  if (!isSupported()) return undefined;
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((v) => v.lang.startsWith('en'));
  return (
    english.find((v) => /natural|neural|enhanced|premium/i.test(v.name)) ??
    english.find((v) => /google/i.test(v.name)) ??
    english.find((v) => v.localService) ??
    english[0]
  );
}

/** Splits into sentence-sized pieces so long coach replies read as a sequence of natural-length utterances (with a small breath between each) rather than one flat run-on. */
function splitIntoSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]*\s*/g);
  if (!matches) return [text];
  const sentences = matches.map((s) => s.trim()).filter(Boolean);
  return sentences.length > 0 ? sentences : [text];
}

export class BrowserTextToSpeechProvider implements TextToSpeechProvider {
  private queue: string[] = [];
  private queueIndex = 0;
  private handlers: TextToSpeechHandlers | null = null;
  // Bumped on every speak()/stop() call. speechSynthesis fires the same
  // 'canceled' error on an utterance we intentionally interrupted as it
  // does on a genuine failure — without this guard, canceling utterance N
  // to start utterance N+1 would still trigger N's onend-chain and
  // continue reading the OLD queue on top of the new one.
  private generation = 0;

  get isSupported(): boolean {
    return isSupported();
  }

  speak(text: string, handlers: TextToSpeechHandlers): void {
    if (!isSupported()) {
      handlers.onError('Speech playback is not supported in this browser.');
      handlers.onStatusChange('error');
      return;
    }

    window.speechSynthesis.cancel();
    this.generation += 1;
    const myGeneration = this.generation;
    this.handlers = handlers;
    this.queue = splitIntoSentences(text);
    this.queueIndex = 0;
    this.playNext(myGeneration);
  }

  private playNext(myGeneration: number): void {
    if (myGeneration !== this.generation) return;
    const sentence = this.queue[this.queueIndex];
    if (sentence === undefined) {
      this.handlers?.onStatusChange('stopped');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = SPEECH_RATE;
    utterance.pitch = SPEECH_PITCH;
    const voice = pickVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      if (myGeneration === this.generation) this.handlers?.onStatusChange('playing');
    };
    utterance.onresume = () => {
      if (myGeneration === this.generation) this.handlers?.onStatusChange('playing');
    };
    utterance.onpause = () => {
      if (myGeneration === this.generation) this.handlers?.onStatusChange('paused');
    };
    utterance.onend = () => {
      if (myGeneration !== this.generation) return;
      this.queueIndex += 1;
      this.playNext(myGeneration);
    };
    utterance.onerror = (event) => {
      if (myGeneration !== this.generation) return;
      // The synthesizer reports its own stop/cancel as an "error" event
      // (`event.error === 'canceled'`/`'interrupted'`) — that's an
      // intentional stop, not a real failure, and must not surface as one.
      if (event.error === 'canceled' || event.error === 'interrupted') {
        this.handlers?.onStatusChange('stopped');
        return;
      }
      console.error('[tts:playback] speechSynthesis error', event.error);
      this.handlers?.onError(`Speech playback error: ${event.error}`);
      this.handlers?.onStatusChange('error');
    };

    window.speechSynthesis.speak(utterance);
  }

  pause(): void {
    if (isSupported()) window.speechSynthesis.pause();
  }

  resume(): void {
    if (isSupported()) window.speechSynthesis.resume();
  }

  stop(): void {
    this.generation += 1;
    if (isSupported()) window.speechSynthesis.cancel();
  }
}

let sharedProvider: BrowserTextToSpeechProvider | null = null;

export function getBrowserTextToSpeechProvider(): TextToSpeechProvider {
  if (!sharedProvider) sharedProvider = new BrowserTextToSpeechProvider();
  return sharedProvider;
}
