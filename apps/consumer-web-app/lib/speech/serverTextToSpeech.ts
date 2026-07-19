/**
 * Client-side player for the server-generated natural voice
 * (app/api/speech/route.ts, backed by lib/tts/openaiSpeechProvider.ts).
 * Fetches short text chunks one at a time and plays each through an
 * HTMLAudioElement — this is the piece that turns "server can generate
 * natural speech" into an actual TextToSpeechProvider the rest of the app
 * already knows how to drive (play/pause/resume/stop, one at a time via
 * playbackRegistry, same as the browser voice).
 *
 * Every failure mode part 4 calls out gets a specific fix here:
 * - a hung request can't freeze the UI (AbortController + timeout)
 * - a canceled/superseded request can't resurrect itself (generation guard)
 * - nothing is ever left un-cleaned-up (revokeObjectURL + listener removal
 *   in one place, run before every new attempt and on stop())
 * - each failure logs which stage it happened in: generation (the fetch to
 *   /api/speech), load (turning the response into playable audio), or
 *   playback (the <audio> element itself erroring after it had content).
 */

import type { TextToSpeechHandlers, TextToSpeechProvider } from './types';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_CHUNK_LENGTH = 280;

/** Groups sentences up to ~MAX_CHUNK_LENGTH so each server request stays fast and each spoken section stays short (part 3's "long responses divided into shorter spoken sections"). */
export function splitIntoChunks(text: string): string[] {
  const sentences = text
    .match(/[^.!?]+[.!?]*\s*/g)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && (current + ' ' + sentence).length > MAX_CHUNK_LENGTH) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

export class ServerTextToSpeechProvider implements TextToSpeechProvider {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private controller: AbortController | null = null;
  private chunks: string[] = [];
  private chunkIndex = 0;
  private handlers: TextToSpeechHandlers | null = null;
  // Bumped by every speak()/stop() call so a stale in-flight fetch or a
  // stale <audio> element's events can never affect state after something
  // newer has taken over — the same pattern browserTextToSpeech.ts uses
  // for its utterance queue, needed here for the same reason: an aborted
  // fetch and a superseded audio element both still fire their event
  // handlers, just late.
  private generation = 0;

  get isSupported(): boolean {
    return (
      typeof window !== 'undefined' && typeof Audio !== 'undefined' && typeof fetch !== 'undefined'
    );
  }

  speak(text: string, handlers: TextToSpeechHandlers): void {
    this.teardown();
    const myGeneration = ++this.generation;
    this.handlers = handlers;
    this.chunks = splitIntoChunks(text);
    this.chunkIndex = 0;
    void this.playChunk(myGeneration);
  }

  private async playChunk(myGeneration: number): Promise<void> {
    if (myGeneration !== this.generation) return;
    const text = this.chunks[this.chunkIndex];
    if (text === undefined) {
      this.handlers?.onStatusChange('stopped');
      return;
    }

    this.handlers?.onStatusChange('loading');
    this.controller = new AbortController();
    const timer = setTimeout(() => this.controller?.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch('/api/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: this.controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (myGeneration !== this.generation) return;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      console.error('[tts:generate]', isAbort ? 'request timed out' : 'request failed', err);
      this.handlers?.onError(
        isAbort ? 'Voice generation timed out.' : 'Could not reach the voice service.'
      );
      this.handlers?.onStatusChange('error');
      return;
    }
    clearTimeout(timer);
    if (myGeneration !== this.generation) return;

    if (!response.ok) {
      console.error('[tts:generate] server responded', response.status);
      this.handlers?.onError(
        response.status === 501 ? 'natural_voice_unavailable' : 'Voice generation failed.'
      );
      this.handlers?.onStatusChange('error');
      return;
    }

    let blob: Blob;
    try {
      blob = await response.blob();
    } catch (err) {
      console.error('[tts:load] could not read audio response', err);
      this.handlers?.onError('Could not load the voice audio.');
      this.handlers?.onStatusChange('error');
      return;
    }
    if (myGeneration !== this.generation) return;

    const url = URL.createObjectURL(blob);
    this.objectUrl = url;
    const audio = new Audio(url);
    this.audio = audio;

    audio.onplaying = () => {
      if (myGeneration === this.generation) this.handlers?.onStatusChange('playing');
    };
    audio.onpause = () => {
      if (myGeneration === this.generation && !audio.ended) this.handlers?.onStatusChange('paused');
    };
    audio.onended = () => {
      if (myGeneration !== this.generation) return;
      this.chunkIndex += 1;
      void this.playChunk(myGeneration);
    };
    audio.onerror = () => {
      if (myGeneration !== this.generation) return;
      console.error('[tts:playback] audio element error', audio.error);
      this.handlers?.onError('Voice playback failed.');
      this.handlers?.onStatusChange('error');
    };

    try {
      // Mobile Safari (and Chrome's autoplay policy generally) only allows
      // this to succeed when play() is called synchronously-ish within a
      // user gesture's call stack — every caller of speak() here is
      // reached directly from a click handler, never from inside an
      // unrelated async chain, so that requirement holds.
      await audio.play();
    } catch (err) {
      if (myGeneration !== this.generation) return;
      console.error('[tts:playback] play() rejected', err);
      this.handlers?.onError(
        'Playback was blocked. If your phone is on silent or locked, try again after unlocking it.'
      );
      this.handlers?.onStatusChange('error');
    }
  }

  pause(): void {
    this.audio?.pause();
  }

  resume(): void {
    this.audio?.play().catch((err) => {
      console.error('[tts:playback] resume failed', err);
      this.handlers?.onError('Could not resume playback.');
      this.handlers?.onStatusChange('error');
    });
  }

  stop(): void {
    this.teardown();
    this.handlers?.onStatusChange('stopped');
  }

  private teardown(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    if (this.audio) {
      this.audio.onplaying = null;
      this.audio.onpause = null;
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}

let sharedProvider: ServerTextToSpeechProvider | null = null;

export function getServerTextToSpeechProvider(): ServerTextToSpeechProvider {
  if (!sharedProvider) sharedProvider = new ServerTextToSpeechProvider();
  return sharedProvider;
}
