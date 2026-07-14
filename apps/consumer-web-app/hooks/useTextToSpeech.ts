'use client';

/**
 * React binding for the text-to-speech abstraction (lib/speech/types.ts)
 * plus the cross-component "only one plays at once" coordination
 * (lib/speech/playbackRegistry.ts). SpeakerButton.tsx is the only
 * component that uses this — it never touches `window.speechSynthesis` or
 * the registry directly.
 *
 * `id` must be stable and unique per playable message (the message's own
 * id is the natural choice) — it's both the registry key and how this
 * hook knows whether IT currently owns the shared browser speech engine
 * before calling pause/resume/stop on it (see browserTextToSpeech.ts's
 * own docblock: there is only ever one real utterance playing in a
 * browser tab, so every hook instance shares one provider).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserTextToSpeechProvider } from '@/lib/speech/browserTextToSpeech';
import { sanitizeForSpeech } from '@/lib/speech/sanitizeForSpeech';
import {
  getCurrentlyPlayingId,
  reportStopped,
  requestPlay,
  subscribe,
} from '@/lib/speech/playbackRegistry';
import type { TextToSpeechStatus } from '@/lib/speech/types';

export type UseTextToSpeechResult = {
  status: TextToSpeechStatus;
  isSupported: boolean;
  /** True only when THIS message is the one currently in the shared engine — drives "clearly show which response is currently playing" (part 2). */
  isActive: boolean;
  errorMessage: string | null;
  play(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  replay(): void;
};

export function useTextToSpeech(id: string, rawText: string): UseTextToSpeechResult {
  const providerRef = useRef(getBrowserTextToSpeechProvider());
  const [status, setStatus] = useState<TextToSpeechStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  // Starts false to match server-side rendering, then flips to the real
  // value post-hydration — see useSpeechToText.ts's identical pattern and
  // its docblock for why reading `providerRef.current.isSupported`
  // directly in the render body would cause a server/client mismatch
  // (SpeakerButton renders nothing at all when unsupported, so getting
  // this wrong is a structural mismatch, not just an attribute one).
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(providerRef.current.isSupported);
  }, []);

  useEffect(() => {
    return subscribe((playingId) => {
      const stillActive = playingId === id;
      setIsActive(stillActive);
      if (!stillActive) setStatus((prev) => (prev === 'idle' ? prev : 'stopped'));
    });
  }, [id]);

  const stopInternal = useCallback(() => {
    providerRef.current.stop();
    setStatus('stopped');
    reportStopped(id);
  }, [id]);

  const play = useCallback(() => {
    if (!isSupported) return;
    const text = sanitizeForSpeech(rawText);
    if (!text) return;

    requestPlay(id, stopInternal);
    providerRef.current.speak(text, {
      onStatusChange: (next) => {
        setStatus(next);
        if (next === 'stopped') reportStopped(id);
      },
      onError: setErrorMessage,
    });
  }, [id, isSupported, rawText, stopInternal]);

  const pause = useCallback(() => {
    if (getCurrentlyPlayingId() !== id) return;
    providerRef.current.pause();
  }, [id]);

  const resume = useCallback(() => {
    if (getCurrentlyPlayingId() !== id) return;
    providerRef.current.resume();
  }, [id]);

  const stop = useCallback(() => {
    if (getCurrentlyPlayingId() !== id) return;
    stopInternal();
  }, [id, stopInternal]);

  const replay = useCallback(() => {
    play();
  }, [play]);

  // Stop playback when this message unmounts (navigating away from the
  // conversation, or the floating panel closing) — part 2's "stop
  // playback when the member leaves the conversation."
  useEffect(() => {
    return () => {
      if (getCurrentlyPlayingId() === id) {
        providerRef.current.stop();
        reportStopped(id);
      }
    };
  }, [id]);

  return { status, isSupported, isActive, errorMessage, play, pause, resume, stop, replay };
}
