/**
 * lib/speech/speakGate.ts, and the three places a tap is supposed to be
 * able to turn voice guidance back on.
 *
 * THE BUG. Voice guidance detects "the browser silently refused to speak"
 * with a watchdog, and once it concludes that, it stops making automatic
 * attempts and shows a "Tap once to enable voice guidance" button instead.
 * That part was right. What was wrong is that the skip applied to EVERY
 * call, including the one made from inside that button's own tap handler.
 *
 * So the recovery was inert. The button appeared, the member tapped it,
 * the call returned before reaching the speech engine, no audio played, no
 * "playing" event could arrive, and the blocked flag could never clear.
 * Tapping again did the same thing. Once blocked, voice guidance could
 * never be turned back on. The prep screen's "Enable voice guidance"
 * button and the unmute control had the identical problem, which is why
 * the member's experience was that voice simply never worked and no
 * amount of pressing the button changed it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { decideSpeak, shouldRetryBlocked, type SpeakGateState } from '../lib/speech/speakGate';

const READY: SpeakGateState = { muted: false, blocked: false, supported: true };
const BLOCKED: SpeakGateState = { muted: false, blocked: true, supported: true };

const read = (...segments: string[]) =>
  readFileSync(path.join(__dirname, '..', ...segments), 'utf8');

const HOOK = read('hooks', 'useGuidedVoice.ts');
const CAMERA = read('components', 'body-assessment', 'CameraCapture.tsx');
const WIZARD = read('components', 'body-assessment', 'AssessmentWizard.tsx');

describe('speak gate — a tap must always be able to reach the engine', () => {
  it('lets an ordinary call through when nothing is wrong', () => {
    expect(decideSpeak(READY, false)).toBe('speak');
    expect(decideSpeak(READY, true)).toBe('speak');
  });

  it('skips an AUTOMATIC call once the engine is known to be refusing', () => {
    // Correct, and worth keeping: an automatic retry cannot succeed, so
    // hammering the engine only delays the member seeing the tap prompt.
    expect(decideSpeak(BLOCKED, false)).toBe('skip_blocked');
  });

  it('NEVER skips a gesture call for being blocked, which is the whole fix', () => {
    expect(decideSpeak(BLOCKED, true)).toBe('speak');
  });

  it('clears the blocked flag on a gesture so the outcome is learned again, not assumed', () => {
    expect(shouldRetryBlocked(BLOCKED, true)).toBe(true);
    // An automatic call must not clear it; only a gesture earns a retry.
    expect(shouldRetryBlocked(BLOCKED, false)).toBe(false);
    // Nothing to retry when it was not blocked in the first place.
    expect(shouldRetryBlocked(READY, true)).toBe(false);
  });

  it('keeps muting ahead of everything, including a gesture', () => {
    // Silence was asked for. The unmute control clears `muted` first
    // rather than speaking through it.
    expect(decideSpeak({ ...READY, muted: true }, true)).toBe('skip_muted');
    expect(decideSpeak({ ...BLOCKED, muted: true }, true)).toBe('skip_muted');
    expect(shouldRetryBlocked({ ...BLOCKED, muted: true }, true)).toBe(false);
  });

  it('says nothing on a browser with no speech engine, gesture or not', () => {
    const unsupported = { ...READY, supported: false };
    expect(decideSpeak(unsupported, false)).toBe('skip_unsupported');
    expect(decideSpeak(unsupported, true)).toBe('skip_unsupported');
  });
});

describe('speak gate — the hook actually uses it', () => {
  it('routes every speak call through the gate rather than its own if-chain', () => {
    expect(HOOK).toContain("from '@/lib/speech/speakGate'");
    expect(HOOK).toContain('decideSpeak(');
    expect(HOOK).toContain('shouldRetryBlocked(');
    // The old unconditional short-circuit must be gone.
    expect(HOOK).not.toMatch(/if \(blockedRef\.current\) \{\s*\n\s*\/\//);
  });

  it('drops the blocked flag before a gesture call reaches the engine', () => {
    const speakBody = HOOK.slice(HOOK.indexOf('const speak = useCallback'), HOOK.indexOf('const replay'));
    const retryIndex = speakBody.indexOf('shouldRetryBlocked');
    const decideIndex = speakBody.indexOf('decideSpeak(');
    expect(retryIndex).toBeGreaterThan(-1);
    // The retry has to happen BEFORE the decision, or the decision would
    // still see a blocked state and skip.
    expect(retryIndex).toBeLessThan(decideIndex);
    expect(speakBody).toContain('blockedRef.current = false');
  });
});

describe('every recovery tap is marked as a gesture', () => {
  it('the camera screen tap prompt', () => {
    const handler = CAMERA.slice(
      CAMERA.indexOf('function handleEnableVoiceTap'),
      CAMERA.indexOf('function handleEnableVoiceTap') + 700
    );
    // Both branches: resuming the stalled intro chain, and the fallback
    // single line. Neither is any use if it cannot reach the engine.
    expect(handler).toContain('speakIntroLine(generation, true)');
    expect(handler).toContain('fromUserGesture: true');
  });

  it('the prep screen Enable voice guidance button', () => {
    const button = WIZARD.slice(
      WIZARD.indexOf("Voice guidance is ready.") - 300,
      WIZARD.indexOf("Voice guidance is ready.") + 300
    );
    expect(button).toContain('fromUserGesture: true');
  });

  it('the unmute control', () => {
    const toggle = HOOK.slice(HOOK.indexOf('const toggleMute'), HOOK.indexOf('useEffect(() => {\n    return () => {'));
    expect(toggle).toContain('fromUserGesture: true');
  });

  it('does not mark ordinary automatic guidance as a gesture', () => {
    // The per-frame corrections and the ready/capturing prompts are NOT
    // gestures. Marking them so would defeat the blocked detection and put
    // the member back to hearing nothing with no prompt to fix it.
    const readyPrompt = CAMERA.slice(CAMERA.indexOf('guidedVoice.speak(READY_PROMPT'), CAMERA.indexOf('guidedVoice.speak(READY_PROMPT') + 200);
    expect(readyPrompt).not.toContain('fromUserGesture');
  });
});
