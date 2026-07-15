'use client';

/**
 * A minimal speech queue for step-by-step spoken guidance (posture photo
 * capture's voice instructions) — deliberately simpler than
 * useTextToSpeech.ts's play/pause/resume control for a coach reply: guidance
 * only ever needs "say this now" (cancelling whatever it was saying before)
 * and "replay the last thing you said." Still shares the same underlying
 * browser provider and cross-component playbackRegistry as the coach voice
 * so the two can never talk over each other — if a coach reply is playing
 * when the member opens the camera, requesting guidance speech here
 * preempts it exactly like a second coach message would.
 */

import { useCallback, useEffect, useRef } from 'react';
import { getBrowserTextToSpeechProvider } from '@/lib/speech/browserTextToSpeech';
import { sanitizeForSpeech } from '@/lib/speech/sanitizeForSpeech';
import { getCurrentlyPlayingId, reportStopped, requestPlay } from '@/lib/speech/playbackRegistry';

export function useGuidedVoice(id: string) {
  const providerRef = useRef(getBrowserTextToSpeechProvider());
  const lastTextRef = useRef<string>('');
  // Bumped on every speak() call. A speech-synthesis "stopped" event fires
  // both when an utterance finishes naturally AND when it's canceled by the
  // next speak() call preempting it — without this guard, an interrupted
  // instruction's onDone would still fire and a chained caller (the step
  // intro sequence) would incorrectly keep advancing after being talked
  // over by a higher-priority correction.
  const generationRef = useRef(0);

  const speak = useCallback(
    (text: string, onDone?: () => void) => {
      const clean = sanitizeForSpeech(text);
      if (!clean) return;
      lastTextRef.current = clean;
      const myGeneration = ++generationRef.current;
      requestPlay(id, () => providerRef.current.stop());
      providerRef.current.speak(clean, {
        onStatusChange: (status) => {
          if (status !== 'stopped' && status !== 'error') return;
          reportStopped(id);
          if (onDone && myGeneration === generationRef.current) onDone();
        },
        onError: () => reportStopped(id),
      });
    },
    [id]
  );

  const replay = useCallback(() => {
    if (lastTextRef.current) speak(lastTextRef.current);
  }, [speak]);

  const stop = useCallback(() => {
    generationRef.current++; // invalidate any in-flight onDone so a stopped chain doesn't keep advancing
    if (getCurrentlyPlayingId() !== id) return;
    providerRef.current.stop();
    reportStopped(id);
  }, [id]);

  useEffect(() => {
    return () => {
      generationRef.current++;
      if (getCurrentlyPlayingId() === id) {
        providerRef.current.stop();
        reportStopped(id);
      }
    };
  }, [id]);

  return { speak, replay, stop, isSupported: providerRef.current.isSupported };
}
