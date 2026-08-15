/**
 * Pure timing/decision logic for spoken posture-capture guidance —
 * deliberately separated from hooks/useGuidedVoice.ts (which only knows
 * how to play one utterance) and from CameraCapture.tsx (which owns the
 * camera/pose loop). Given "what's currently wrong, if anything" once per
 * pose-detection frame, this decides whether THIS is the moment to speak
 * or whether to stay silent — nothing here touches speechSynthesis, so
 * every timing rule is testable with plain timestamps.
 *
 * This replaces an earlier version that re-evaluated and re-spoke on
 * every frame with only a short debounce — the actual bug reported:
 * instructions interrupted each other, fired too often, and gave the
 * member no time to react. Four rules fix that, in priority order:
 *
 * 1. Never speak while already speaking (`isSpeaking`) — the only way an
 *    utterance stops early is CameraCapture calling stop() directly for
 *    an actual emergency (camera closing/unmounting), never this module
 *    deciding a "better" instruction has come along.
 * 2. After an utterance finishes, stay silent for COOLDOWN_MS — the
 *    member needs time to physically react before we reassess out loud.
 * 3. A newly-detected problem must persist for CONFIRM_WINDOW_MS before
 *    it's spoken — a single noisy pose-detection frame (a hand crossing
 *    the camera, a momentary landmark glitch) must not trigger speech.
 * 4. The identical instruction won't repeat within REPEAT_SUPPRESS_MS —
 *    if the member hasn't corrected it yet, they still don't need to
 *    hear the same sentence every second; a longer, calmer cadence reads
 *    as coach-like rather than nagging.
 * 5. And if the same instruction still has not been acted on after
 *    MAX_CONSECUTIVE_UTTERANCES tries, the voice stops saying it
 *    altogether and leaves it to the screen. Repeating a sentence a
 *    member has already heard three times and evidently cannot act on is
 *    not guidance, it is nagging, and it drowns out the moment the
 *    instruction finally does change. A different instruction resets the
 *    count immediately, so this only ever silences a line that is stuck.
 *
 * All of these values are UX pacing choices tuned to how long it takes a
 * person to hear a sentence and physically respond — not clinical
 * constants, and not derived from any measurement literature.
 */

/** How long a just-finished utterance's problem must persist unchanged before we'd consider repeating it. */
export const COOLDOWN_MS = 3000;
/** A candidate problem must be detected continuously for this long before it's spoken — filters single-frame detection noise. */
export const CONFIRM_WINDOW_MS = 500;
/** Floor between two instances of the exact same instruction. */
export const REPEAT_SUPPRESS_MS = 8000;
/** How many times in a row the same instruction may be spoken before the voice gives up on it and lets the on-screen guidance carry it: the first saying plus two repeats. */
export const MAX_CONSECUTIVE_UTTERANCES = 3;

export type GuidanceMemory = {
  isSpeaking: boolean;
  pendingKey: string | null;
  pendingSince: number | null;
  lastSpokenKey: string | null;
  /** Timestamp the last utterance FINISHED (not started) — cooldown counts from when the member could actually start reacting. */
  lastSpokenAt: number | null;
  /** How many times in a row lastSpokenKey has now been spoken. Reset to 1 whenever a different instruction is spoken. */
  consecutiveUtterances: number;
};

export const INITIAL_GUIDANCE_MEMORY: GuidanceMemory = {
  isSpeaking: false,
  pendingKey: null,
  pendingSince: null,
  lastSpokenKey: null,
  lastSpokenAt: null,
  consecutiveUtterances: 0,
};

export type GuidanceStep = {
  memory: GuidanceMemory;
  decision: 'speak' | 'silent';
  keyToSpeak: string | null;
};

/**
 * One call per pose-detection frame. `detectedKey` is a short identifier
 * for "the single most important thing wrong right now" (e.g. the
 * validation status, or `'ready'`/`'capturing'` for positive states) —
 * `null` means there is currently nothing to say (distinct from `'ready'`,
 * which DOES get spoken once: "you're doing it right" is itself an
 * instruction the member is waiting to hear).
 */
export function stepGuidance(
  memory: GuidanceMemory,
  detectedKey: string | null,
  now: number
): GuidanceStep {
  if (memory.isSpeaking) {
    return { memory, decision: 'silent', keyToSpeak: null };
  }

  if (memory.lastSpokenAt !== null && now - memory.lastSpokenAt < COOLDOWN_MS) {
    return { memory, decision: 'silent', keyToSpeak: null };
  }

  if (detectedKey === null) {
    if (memory.pendingKey === null) return { memory, decision: 'silent', keyToSpeak: null };
    // Nothing wrong anymore — a later problem should need its own fresh
    // confirmation window rather than inheriting this one's elapsed time.
    return {
      memory: { ...memory, pendingKey: null, pendingSince: null },
      decision: 'silent',
      keyToSpeak: null,
    };
  }

  if (memory.pendingKey !== detectedKey) {
    return {
      memory: { ...memory, pendingKey: detectedKey, pendingSince: now },
      decision: 'silent',
      keyToSpeak: null,
    };
  }

  if (memory.pendingSince === null || now - memory.pendingSince < CONFIRM_WINDOW_MS) {
    return { memory, decision: 'silent', keyToSpeak: null };
  }

  if (
    memory.lastSpokenKey === detectedKey &&
    memory.lastSpokenAt !== null &&
    now - memory.lastSpokenAt < REPEAT_SUPPRESS_MS
  ) {
    return { memory, decision: 'silent', keyToSpeak: null };
  }

  // Said its piece and been ignored. Stay quiet and let the screen carry
  // it, until something else genuinely changes.
  if (
    memory.lastSpokenKey === detectedKey &&
    memory.consecutiveUtterances >= MAX_CONSECUTIVE_UTTERANCES
  ) {
    return { memory, decision: 'silent', keyToSpeak: null };
  }

  return { memory, decision: 'speak', keyToSpeak: detectedKey };
}

/** Call when an utterance actually starts playing — blocks every other decision until markSpeechEnded(). */
export function markSpeechStarted(memory: GuidanceMemory): GuidanceMemory {
  return { ...memory, isSpeaking: true };
}

/** Call when an utterance finishes (naturally, not mid-sentence) — starts the cooldown and records what was said for repeat-suppression. */
export function markSpeechEnded(
  memory: GuidanceMemory,
  spokenKey: string,
  now: number
): GuidanceMemory {
  return {
    ...memory,
    isSpeaking: false,
    lastSpokenKey: spokenKey,
    lastSpokenAt: now,
    consecutiveUtterances: memory.lastSpokenKey === spokenKey ? memory.consecutiveUtterances + 1 : 1,
  };
}

/** Emergency-only reset (camera closing, step changing) — the one path allowed to abandon in-flight state without a natural utterance end. */
export function resetGuidanceMemory(): GuidanceMemory {
  return { ...INITIAL_GUIDANCE_MEMORY };
}
