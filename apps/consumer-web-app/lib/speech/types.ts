/**
 * Reusable speech abstraction — the ONLY place the rest of the app talks
 * about voice input/output in terms of. Every UI component (MessageInput,
 * SpeakerButton, the hooks below) programs against these interfaces, never
 * against `window.SpeechRecognition`/`window.speechSynthesis` directly —
 * so the underlying provider can be swapped for a premium voice service
 * later (see browserSpeechToText.ts/browserTextToSpeech.ts's own
 * docblocks) without touching any component.
 */

/**
 * Every state the milestone requires, plus the two terminal "can't
 * proceed" states (`permission_denied`, `unsupported`) kept distinct from
 * the transient `error` state — a denied permission or an unsupported
 * browser is a stable condition the UI should keep showing a fallback
 * for, not something a retry will fix.
 */
export type SpeechToTextStatus =
  | 'idle'
  | 'requesting_permission'
  | 'listening'
  | 'processing'
  | 'transcript_ready'
  | 'permission_denied'
  | 'unsupported'
  | 'error';

export type SpeechToTextHandlers = {
  onStatusChange(status: SpeechToTextStatus): void;
  /** Fired repeatedly while listening, with the best-guess-so-far text (never persisted, display only). */
  onInterimTranscript(text: string): void;
  /** Fired once recognition has a final result — the only transcript ever eligible to be submitted. */
  onFinalTranscript(text: string): void;
  onError(message: string): void;
};

export interface SpeechToTextProvider {
  readonly isSupported: boolean;
  start(handlers: SpeechToTextHandlers): void;
  stop(): void;
  cancel(): void;
}

export type TextToSpeechStatus = 'idle' | 'playing' | 'paused' | 'stopped' | 'error';

export type TextToSpeechHandlers = {
  onStatusChange(status: TextToSpeechStatus): void;
  onError(message: string): void;
};

export interface TextToSpeechProvider {
  readonly isSupported: boolean;
  speak(text: string, handlers: TextToSpeechHandlers): void;
  pause(): void;
  resume(): void;
  stop(): void;
}
