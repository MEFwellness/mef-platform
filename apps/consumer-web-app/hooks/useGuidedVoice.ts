'use client';

/**
 * A minimal speech queue for step-by-step spoken guidance (posture photo
 * capture's voice instructions) — deliberately simpler than
 * useTextToSpeech.ts's play/pause/resume control for a coach reply:
 * guidance only ever needs "say this now" (cancelling whatever it was
 * saying before), "replay the last thing you said," and now "am I
 * actually audible right now" (mobile-autoplay unlock detection) and
 * "mute." Still shares the same underlying browser provider and
 * cross-component playbackRegistry as the coach voice so the two can
 * never talk over each other — if a coach reply is playing when the
 * member opens the camera, requesting guidance speech here preempts it
 * exactly like a second coach message would.
 *
 * MOBILE AUTOPLAY: `window.speechSynthesis.speak()` on many mobile
 * browsers (iOS Safari in particular) is a silent no-op unless the call
 * happens inside a user-gesture call stack, or the engine was already
 * "unlocked" by an earlier gesture-triggered speak() this page load. A
 * blocked call fires NONE of speechSynthesis's events — no onstart, no
 * onend, no onerror — so `status` here tracks whether we've actually SEEN
 * a real 'playing' event yet, not just whether we asked the browser to
 * speak. `speak()` arms a short watchdog on every call until that's
 * confirmed once; if it never confirms, status flips to 'blocked' and the
 * caller (CameraCapture) is expected to show a one-time "tap to enable"
 * prompt — the tap itself is a fresh gesture, so calling speak() again
 * directly inside that tap handler is guaranteed to succeed and flips
 * status to 'unlocked' for the rest of this hook instance's life (which,
 * since CameraCapture is reused across every capture step of one
 * assessment rather than remounted per step, means the whole rest of the
 * assessment).
 *
 * STUCK-SPEECH SAFETY NET: because a blocked call never fires any event,
 * a caller relying on `onDone` to know when it's safe to proceed (e.g.
 * CameraCapture's voice-guidance state machine, which gates auto-capture
 * on "not currently speaking") could otherwise wait forever — this was a
 * real, reproduced bug: the very first automatic speak() call (the intro
 * script, fired the moment the camera becomes ready, with no user gesture
 * yet) getting silently blocked left `isSpeaking` stuck true forever,
 * which permanently blocked both further voice guidance AND auto-capture
 * behind it. `speak()` now also arms a longer MAX_UTTERANCE_MS safety
 * timeout that force-invokes `onDone` if the provider never reports
 * completion by then — this is what guarantees a single blocked or
 * otherwise-failed utterance can never permanently deadlock anything
 * downstream again, independent of whatever caused it to fail.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserTextToSpeechProvider } from '@/lib/speech/browserTextToSpeech';
import { sanitizeForSpeech } from '@/lib/speech/sanitizeForSpeech';
import { getCurrentlyPlayingId, reportStopped, requestPlay } from '@/lib/speech/playbackRegistry';

export type GuidedVoiceStatus = 'unavailable' | 'idle' | 'unlocked' | 'blocked' | 'muted';

/** How long to wait for a real 'playing' event before assuming a speak() call was silently blocked by a mobile autoplay policy. Generous — speechSynthesis's onstart normally fires within tens of milliseconds when allowed. */
const UNLOCK_DETECT_MS = 1500;
/** Absolute ceiling on how long a single utterance is allowed to keep a caller's onDone waiting — far longer than any real guidance sentence takes to speak, but short enough to self-heal quickly if the provider silently never fires a completion event. */
const MAX_UTTERANCE_MS = 8000;
/** How long a simulated "spoken" turn takes while muted — long enough that pacing (the cooldown/confirm windows in voiceGuidanceMachine.ts) still feels natural, short enough not to visibly stall anything. */
const MUTED_TURN_MS = 350;

export function useGuidedVoice(id: string) {
  const providerRef = useRef(getBrowserTextToSpeechProvider());
  const lastTextRef = useRef<string>('');
  // Bumped on every speak()/stop() call. A speech-synthesis "stopped" event
  // fires both when an utterance finishes naturally AND when it's canceled
  // by the next speak() call preempting it — without this guard, an
  // interrupted instruction's onDone would still fire and a chained caller
  // (the step intro sequence) would incorrectly keep advancing after being
  // talked over by a higher-priority correction.
  const generationRef = useRef(0);
  const mutedRef = useRef(false);
  const confirmedUnlockedRef = useRef(false);
  const blockedRef = useRef(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<GuidedVoiceStatus>(() =>
    providerRef.current.isSupported ? 'idle' : 'unavailable'
  );

  const clearTimers = useCallback(() => {
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    unlockTimerRef.current = null;
    safetyTimerRef.current = null;
  }, []);

  // Deliberately depends only on [id, clearTimers] (both stable) so this
  // function's identity never changes across renders — callers throughout
  // CameraCapture rely on `guidedVoice.speak` staying referentially stable
  // without needing to list it in their effect dependency arrays. Gating
  // logic below reads refs (mutedRef/blockedRef/confirmedUnlockedRef), not
  // React state, specifically so it's never a render behind reality.
  const speak = useCallback(
    (text: string, onDone?: () => void) => {
      const clean = sanitizeForSpeech(text);
      if (!clean) return;
      lastTextRef.current = clean;

      if (mutedRef.current) {
        // No real playback, but still simulate a completion so callers
        // relying on onDone for pacing keep working correctly while muted.
        const myGeneration = ++generationRef.current;
        setTimeout(() => {
          if (myGeneration === generationRef.current && onDone) onDone();
        }, MUTED_TURN_MS);
        return;
      }

      if (!providerRef.current.isSupported) {
        setStatus('unavailable');
        if (onDone) onDone();
        return;
      }

      if (blockedRef.current) {
        // Skip repeated automatic attempts once we know we're blocked —
        // CameraCapture shows a one-time prompt instead; the actual retry
        // is a fresh speak() call made directly inside that tap's click
        // handler (a real gesture), not a background call like this one.
        if (onDone) onDone();
        return;
      }

      const myGeneration = ++generationRef.current;
      clearTimers();
      requestPlay(id, () => providerRef.current.stop());
      let settled = false;

      if (!confirmedUnlockedRef.current) {
        unlockTimerRef.current = setTimeout(() => {
          if (myGeneration !== generationRef.current || confirmedUnlockedRef.current) return;
          blockedRef.current = true;
          setStatus('blocked');
        }, UNLOCK_DETECT_MS);
      }

      safetyTimerRef.current = setTimeout(() => {
        if (myGeneration !== generationRef.current || settled) return;
        settled = true;
        reportStopped(id);
        if (onDone) onDone();
      }, MAX_UTTERANCE_MS);

      providerRef.current.speak(clean, {
        onStatusChange: (playbackStatus) => {
          if (myGeneration !== generationRef.current) return;

          if (playbackStatus === 'playing' && !confirmedUnlockedRef.current) {
            confirmedUnlockedRef.current = true;
            blockedRef.current = false;
            if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
            setStatus('unlocked');
          }

          if (playbackStatus !== 'stopped' && playbackStatus !== 'error') return;
          if (settled) return;
          settled = true;
          if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
          if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
          reportStopped(id);
          if (onDone) onDone();
        },
        onError: () => reportStopped(id),
      });
    },
    [id, clearTimers]
  );

  const replay = useCallback(() => {
    if (lastTextRef.current) speak(lastTextRef.current);
  }, [speak]);

  const stop = useCallback(() => {
    generationRef.current++;
    clearTimers();
    if (getCurrentlyPlayingId() !== id) return;
    providerRef.current.stop();
    reportStopped(id);
  }, [id, clearTimers]);

  /** Toggling on stops whatever's playing immediately; toggling off replays the last line so the member doesn't miss whatever they muted through. */
  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    if (next) {
      generationRef.current++;
      clearTimers();
      if (getCurrentlyPlayingId() === id) {
        providerRef.current.stop();
        reportStopped(id);
      }
      setStatus('muted');
    } else {
      setStatus(
        confirmedUnlockedRef.current ? 'unlocked' : blockedRef.current ? 'blocked' : 'idle'
      );
      if (lastTextRef.current) speak(lastTextRef.current);
    }
  }, [id, clearTimers, speak]);

  useEffect(() => {
    return () => {
      generationRef.current++;
      clearTimers();
      if (getCurrentlyPlayingId() === id) {
        providerRef.current.stop();
        reportStopped(id);
      }
    };
  }, [id, clearTimers]);

  return {
    speak,
    replay,
    stop,
    toggleMute,
    status,
    isSupported: providerRef.current.isSupported,
  };
}
