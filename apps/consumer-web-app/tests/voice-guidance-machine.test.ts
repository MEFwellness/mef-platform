/**
 * lib/body-assessment/voiceGuidanceMachine.ts — the timing rules behind
 * "finish the sentence, pause 3s, don't repeat within 5s, confirm before
 * speaking a new problem." Pure, timestamp-driven, no speechSynthesis
 * involved, so every rule is directly testable.
 */
import { describe, it, expect } from 'vitest';
import {
  stepGuidance,
  markSpeechStarted,
  markSpeechEnded,
  resetGuidanceMemory,
  COOLDOWN_MS,
  CONFIRM_WINDOW_MS,
  REPEAT_SUPPRESS_MS,
} from '../lib/body-assessment/voiceGuidanceMachine';

describe('stepGuidance', () => {
  it('stays silent while nothing is detected', () => {
    const step = stepGuidance(resetGuidanceMemory(), null, 1000);
    expect(step.decision).toBe('silent');
  });

  it('does not speak the very first frame a problem is detected (confirmation window)', () => {
    const step = stepGuidance(resetGuidanceMemory(), 'too_close', 1000);
    expect(step.decision).toBe('silent');
    expect(step.memory.pendingKey).toBe('too_close');
    expect(step.memory.pendingSince).toBe(1000);
  });

  it('speaks once the same problem has persisted through the confirmation window', () => {
    let memory = resetGuidanceMemory();
    memory = stepGuidance(memory, 'too_close', 1000).memory;
    const step = stepGuidance(memory, 'too_close', 1000 + CONFIRM_WINDOW_MS + 1);
    expect(step.decision).toBe('speak');
    expect(step.keyToSpeak).toBe('too_close');
  });

  it('resets the confirmation window if the detected problem changes before it elapses', () => {
    let memory = resetGuidanceMemory();
    memory = stepGuidance(memory, 'too_close', 1000).memory;
    // Switches to a different problem partway through the window.
    memory = stepGuidance(memory, 'off_center', 1000 + 100).memory;
    expect(memory.pendingKey).toBe('off_center');
    expect(memory.pendingSince).toBe(1100);
    // Not yet spoken — needs its own full confirmation window.
    const tooEarly = stepGuidance(memory, 'off_center', 1100 + CONFIRM_WINDOW_MS - 1);
    expect(tooEarly.decision).toBe('silent');
  });

  it('never speaks while isSpeaking is true, however long the problem has persisted', () => {
    let memory = resetGuidanceMemory();
    memory = markSpeechStarted(memory);
    const step = stepGuidance(memory, 'too_close', 1_000_000);
    expect(step.decision).toBe('silent');
  });

  it('enforces a cooldown after speech ends before speaking again, even for a NEW problem', () => {
    let memory = resetGuidanceMemory();
    memory = markSpeechStarted(memory);
    memory = markSpeechEnded(memory, 'too_close', 5000);
    // A different problem shows up right after — still inside cooldown.
    const step = stepGuidance(memory, 'off_center', 5000 + COOLDOWN_MS - 1);
    expect(step.decision).toBe('silent');
  });

  it('allows a new instruction once the cooldown has elapsed and the confirmation window passes', () => {
    let memory = resetGuidanceMemory();
    memory = markSpeechStarted(memory);
    memory = markSpeechEnded(memory, 'too_close', 5000);
    const afterCooldown = 5000 + COOLDOWN_MS + 1;
    memory = stepGuidance(memory, 'off_center', afterCooldown).memory;
    const step = stepGuidance(memory, 'off_center', afterCooldown + CONFIRM_WINDOW_MS + 1);
    expect(step.decision).toBe('speak');
    expect(step.keyToSpeak).toBe('off_center');
  });

  it('suppresses repeating the identical instruction within the repeat-suppress window', () => {
    let memory = resetGuidanceMemory();
    memory = markSpeechStarted(memory);
    memory = markSpeechEnded(memory, 'too_close', 5000);
    const afterCooldown = 5000 + COOLDOWN_MS + 1;
    memory = stepGuidance(memory, 'too_close', afterCooldown).memory;
    const step = stepGuidance(memory, 'too_close', afterCooldown + CONFIRM_WINDOW_MS + 1);
    expect(step.decision).toBe('silent');
  });

  it('allows repeating the identical instruction once the repeat-suppress window has fully elapsed', () => {
    let memory = resetGuidanceMemory();
    memory = markSpeechStarted(memory);
    memory = markSpeechEnded(memory, 'too_close', 0);
    memory = stepGuidance(memory, 'too_close', REPEAT_SUPPRESS_MS + 1).memory;
    const step = stepGuidance(memory, 'too_close', REPEAT_SUPPRESS_MS + CONFIRM_WINDOW_MS + 2);
    expect(step.decision).toBe('speak');
  });

  it('clears the pending problem once the pose becomes valid, so a later recurrence needs a fresh confirmation window', () => {
    let memory = resetGuidanceMemory();
    memory = stepGuidance(memory, 'too_close', 1000).memory;
    memory = stepGuidance(memory, null, 1100).memory;
    expect(memory.pendingKey).toBeNull();
  });
});
