'use client';

/**
 * React binding for the speech-to-text abstraction (lib/speech/types.ts).
 * This is the ONLY place a UI component needs to import to get voice
 * input — MessageInput.tsx uses this hook and never touches
 * `SpeechRecognition`/the provider module directly, per "do not scatter
 * browser speech logic throughout UI components."
 *
 * Never sends anything to the member's message box automatically: this
 * hook only exposes `transcript`/`interimTranscript` state for the caller
 * to display and let the member review before pressing Send (part 1's
 * "do not automatically send speech without allowing review").
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserSpeechToTextProvider } from '@/lib/speech/browserSpeechToText';
import type { SpeechToTextStatus } from '@/lib/speech/types';

export type UseSpeechToTextResult = {
  status: SpeechToTextStatus;
  isSupported: boolean;
  /** The best-guess-so-far text while listening — display only, never submitted. */
  interimTranscript: string;
  /** Set once recognition finishes — the caller merges this into its own editable input state. */
  transcript: string;
  errorMessage: string | null;
  start(): void;
  stop(): void;
  cancel(): void;
  /** Clears `transcript` after the caller has consumed it into its own input state, so a stale result doesn't linger. */
  clearTranscript(): void;
};

export function useSpeechToText(): UseSpeechToTextResult {
  const providerRef = useRef(getBrowserSpeechToTextProvider());
  const [status, setStatus] = useState<SpeechToTextStatus>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [transcript, setTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Starts false to match server-side rendering (no `window`, so support
  // can never be detected there) and is only ever flipped to the real
  // value inside an effect, after hydration — reading
  // `providerRef.current.isSupported` directly in the render body would
  // disagree with the server's render on the client's very first pass
  // (this component would see a real `window` immediately, before any
  // effect runs), producing exactly the "server/client HTML mismatch"
  // warning React explicitly guards against.
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(providerRef.current.isSupported);
  }, []);

  const start = useCallback(() => {
    if (!isSupported) {
      setStatus('unsupported');
      return;
    }
    setErrorMessage(null);
    setInterimTranscript('');
    providerRef.current.start({
      onStatusChange: setStatus,
      onInterimTranscript: setInterimTranscript,
      onFinalTranscript: (text) => {
        setTranscript(text);
        setInterimTranscript('');
      },
      onError: setErrorMessage,
    });
  }, [isSupported]);

  const stop = useCallback(() => {
    providerRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    providerRef.current.cancel();
    setInterimTranscript('');
    setStatus('idle');
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  // Stop listening if the member navigates away or the input unmounts
  // mid-capture — never leave recognition running in the background.
  useEffect(() => {
    return () => {
      providerRef.current.cancel();
    };
  }, []);

  return {
    status,
    isSupported,
    interimTranscript,
    transcript,
    errorMessage,
    start,
    stop,
    cancel,
    clearTranscript,
  };
}
