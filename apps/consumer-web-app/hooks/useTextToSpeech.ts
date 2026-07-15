'use client';

/**
 * React binding for the text-to-speech abstraction (lib/speech/types.ts)
 * plus the cross-component "only one plays at once" coordination
 * (lib/speech/playbackRegistry.ts). SpeakerButton.tsx is the only
 * component that uses this — it never touches the underlying provider or
 * the registry directly.
 *
 * `id` must be stable and unique per playable message (the message's own
 * id is the natural choice) — it's both the registry key and how this
 * hook knows whether IT currently owns the shared engine before calling
 * pause/resume/stop on it.
 *
 * This is also where every part-4 "playback glitch" fix lives, since
 * they're all React-lifecycle concerns rather than provider concerns:
 * - `play()` no-ops while already loading/playing so a rapid double-tap
 *   can't fire two overlapping requests for the same message.
 * - `isMountedRef` guards every state update coming from an async
 *   callback, so a response that resolves after the component/panel
 *   unmounted never touches state that no longer exists.
 * - `retry()` is exactly `play()` again, exposed under its own name so the
 *   UI can offer a clearly-labeled "Try again" rather than reusing the
 *   ambiguous play button while in an error state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getTextToSpeechProvider } from '@/lib/speech/textToSpeechProvider';
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
  /** True only when THIS message is the one currently in the shared engine — drives "clearly show which response is currently playing." */
  isActive: boolean;
  errorMessage: string | null;
  play(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  replay(): void;
  /** Same effect as play() — a distinct name so the UI can offer a clearly-labeled "Try again" after an error instead of overloading the play button. */
  retry(): void;
};

const NATURAL_VOICE_UNAVAILABLE_MESSAGE = "Playing in a different voice right now, still Root, just not my usual sound.";

export function useTextToSpeech(id: string, rawText: string): UseTextToSpeechResult {
  const providerRef = useRef(getTextToSpeechProvider());
  const [status, setStatus] = useState<TextToSpeechStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  // Starts false to match server-side rendering, then flips to the real
  // value post-hydration — reading `providerRef.current.isSupported`
  // directly in the render body would cause a server/client mismatch
  // (SpeakerButton renders nothing at all when unsupported, so getting
  // this wrong is a structural mismatch, not just an attribute one).
  const [isSupported, setIsSupported] = useState(false);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setIsSupported(providerRef.current.isSupported);
  }, []);

  useEffect(() => {
    return subscribe((playingId) => {
      if (!isMountedRef.current) return;
      const stillActive = playingId === id;
      setIsActive(stillActive);
      if (!stillActive) setStatus((prev) => (prev === 'idle' ? prev : 'stopped'));
    });
  }, [id]);

  const stopInternal = useCallback(() => {
    providerRef.current.stop();
    if (isMountedRef.current) setStatus('stopped');
    reportStopped(id);
  }, [id]);

  const startPlayback = useCallback(() => {
    if (!isSupported) return;
    const text = sanitizeForSpeech(rawText);
    if (!text) return;

    setErrorMessage(null);
    requestPlay(id, stopInternal);
    providerRef.current.speak(text, {
      onStatusChange: (next) => {
        if (!isMountedRef.current) return;
        setStatus(next);
        if (next === 'stopped') reportStopped(id);
      },
      onError: (message) => {
        if (!isMountedRef.current) return;
        if (message === 'natural_voice_unavailable') {
          // Not a real error for this message — the provider is already
          // retrying with the browser voice; a persistent info note (not a
          // dismissible error banner) is enough context if a member
          // wonders why the voice suddenly sounds different.
          setErrorMessage(NATURAL_VOICE_UNAVAILABLE_MESSAGE);
          return;
        }
        setErrorMessage(message);
      },
    });
  }, [id, isSupported, rawText, stopInternal]);

  const play = useCallback(() => {
    // Guards against a rapid double-tap firing two overlapping requests
    // for the same message — a genuinely new play() request only ever
    // makes sense from idle/stopped/error/paused-elsewhere states.
    if (status === 'loading' || (isActive && status === 'playing')) return;
    startPlayback();
  }, [isActive, status, startPlayback]);

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

  // Bypasses the loading/playing guard — an explicit replay request means
  // the member wants to hear it again regardless of whatever state it's
  // currently in.
  const replay = startPlayback;

  // Stop playback when this message unmounts (navigating away from the
  // conversation, or the floating panel closing).
  useEffect(() => {
    return () => {
      if (getCurrentlyPlayingId() === id) {
        providerRef.current.stop();
        reportStopped(id);
      }
    };
  }, [id]);

  return {
    status,
    isSupported,
    isActive,
    errorMessage,
    play,
    pause,
    resume,
    stop,
    replay,
    retry: play,
  };
}
