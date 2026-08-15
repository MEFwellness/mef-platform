/**
 * lib/body-assessment/voiceGuidanceMachine.ts — how often the same spoken
 * instruction may repeat.
 *
 * A capture step that will not pass turns the voice into a metronome
 * saying the same sentence over and over, which is what the back-view loop
 * sounded like from across the room. Two rules cap it: the same line
 * cannot come back inside REPEAT_SUPPRESS_MS, and after
 * MAX_CONSECUTIVE_UTTERANCES tries the voice gives up on that line
 * entirely and leaves it to the screen.
 */
import { describe, it, expect } from 'vitest';
import {
  stepGuidance,
  markSpeechStarted,
  markSpeechEnded,
  INITIAL_GUIDANCE_MEMORY,
  REPEAT_SUPPRESS_MS,
  CONFIRM_WINDOW_MS,
  COOLDOWN_MS,
  MAX_CONSECUTIVE_UTTERANCES,
  type GuidanceMemory,
} from '../lib/body-assessment/voiceGuidanceMachine';

/**
 * Drives one full say-it-and-finish cycle for `key`, if the machine allows
 * it. Returns the memory afterwards plus whether anything was actually
 * spoken, and the clock it ended at.
 */
function trySpeak(
  memory: GuidanceMemory,
  key: string,
  nowMs: number
): { memory: GuidanceMemory; spoke: boolean; nowMs: number } {
  // The key has to persist past the confirmation window before it counts.
  let current = stepGuidance(memory, key, nowMs).memory;
  const at = nowMs + CONFIRM_WINDOW_MS + 10;
  const decision = stepGuidance(current, key, at);
  current = decision.memory;
  if (decision.decision !== 'speak') return { memory: current, spoke: false, nowMs: at };

  current = markSpeechStarted(current);
  const finishedAt = at + 1500;
  current = markSpeechEnded(current, key, finishedAt);
  return { memory: current, spoke: true, nowMs: finishedAt };
}

describe('voice repeat throttle', () => {
  it('holds the same line back for a full 8 seconds', () => {
    expect(REPEAT_SUPPRESS_MS).toBe(8000);

    const first = trySpeak(INITIAL_GUIDANCE_MEMORY, 'wrong_orientation', 0);
    expect(first.spoke).toBe(true);

    // Well past the cooldown, still inside the repeat window: silent.
    const tooSoon = trySpeak(
      first.memory,
      'wrong_orientation',
      first.nowMs + COOLDOWN_MS + 500
    );
    expect(tooSoon.spoke).toBe(false);

    // Past the repeat window: allowed again.
    const later = trySpeak(first.memory, 'wrong_orientation', first.nowMs + REPEAT_SUPPRESS_MS + 100);
    expect(later.spoke).toBe(true);
  });

  it('gives up on a line after the first saying and two repeats', () => {
    let memory = INITIAL_GUIDANCE_MEMORY;
    let clock = 0;
    let spokenCount = 0;

    // Twenty attempts, each comfortably past the repeat window.
    for (let i = 0; i < 20; i++) {
      const attempt = trySpeak(memory, 'wrong_orientation', clock);
      if (attempt.spoke) spokenCount++;
      memory = attempt.memory;
      clock = attempt.nowMs + REPEAT_SUPPRESS_MS + 100;
    }

    expect(spokenCount).toBe(MAX_CONSECUTIVE_UTTERANCES);
    expect(MAX_CONSECUTIVE_UTTERANCES).toBe(3);
  });

  it('starts counting again the moment the instruction actually changes', () => {
    let memory = INITIAL_GUIDANCE_MEMORY;
    let clock = 0;

    // Exhaust one line.
    for (let i = 0; i < 5; i++) {
      const attempt = trySpeak(memory, 'wrong_orientation', clock);
      memory = attempt.memory;
      clock = attempt.nowMs + REPEAT_SUPPRESS_MS + 100;
    }
    expect(trySpeak(memory, 'wrong_orientation', clock).spoke).toBe(false);

    // A genuinely different problem is heard straight away.
    const different = trySpeak(memory, 'too_far', clock);
    expect(different.spoke).toBe(true);
    expect(different.memory.consecutiveUtterances).toBe(1);

    // And the original line is available again afterwards.
    const revived = trySpeak(
      different.memory,
      'wrong_orientation',
      different.nowMs + REPEAT_SUPPRESS_MS + 100
    );
    expect(revived.spoke).toBe(true);
  });

  it('never speaks over itself, whatever the timings', () => {
    const speaking = markSpeechStarted(INITIAL_GUIDANCE_MEMORY);
    expect(stepGuidance(speaking, 'wrong_orientation', 999_999).decision).toBe('silent');
  });

  it('does not count a line that was suppressed as if it had been said', () => {
    const first = trySpeak(INITIAL_GUIDANCE_MEMORY, 'wrong_orientation', 0);
    expect(first.memory.consecutiveUtterances).toBe(1);

    const suppressed = trySpeak(first.memory, 'wrong_orientation', first.nowMs + 100);
    expect(suppressed.spoke).toBe(false);
    expect(suppressed.memory.consecutiveUtterances).toBe(1);
  });
});
