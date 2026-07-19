import { describe, it, expect } from 'vitest';
import {
  stepTemporalSignal,
  isTemporalSignalPending,
  INITIAL_TEMPORAL_SIGNAL_STATE,
  type TemporalSignalState,
} from '../lib/body-assessment/temporalSignal';

const CONFIRM_MS = 900;
const RELEASE_MS = 600;

function run(events: Array<{ active: boolean; now: number }>): TemporalSignalState {
  let state = INITIAL_TEMPORAL_SIGNAL_STATE;
  for (const e of events) {
    state = stepTemporalSignal(state, e.active, e.now, CONFIRM_MS, RELEASE_MS);
  }
  return state;
}

describe('stepTemporalSignal', () => {
  it('starts inactive and unconfirmed', () => {
    expect(INITIAL_TEMPORAL_SIGNAL_STATE.confirmed).toBe(false);
  });

  it('does not confirm on a single active frame', () => {
    const state = stepTemporalSignal(
      INITIAL_TEMPORAL_SIGNAL_STATE,
      true,
      1000,
      CONFIRM_MS,
      RELEASE_MS
    );
    expect(state.confirmed).toBe(false);
    expect(isTemporalSignalPending(state)).toBe(true);
  });

  it('does not confirm a brief blip that clears before confirmAfterMs', () => {
    const state = run([
      { active: true, now: 0 },
      { active: true, now: 200 },
      { active: false, now: 400 }, // clears well before CONFIRM_MS
      { active: false, now: 500 },
    ]);
    expect(state.confirmed).toBe(false);
  });

  it('confirms once the active signal persists unbroken for confirmAfterMs', () => {
    const state = run([
      { active: true, now: 0 },
      { active: true, now: 400 },
      { active: true, now: 800 },
      { active: true, now: 950 }, // 950ms since activeSince=0, past CONFIRM_MS
    ]);
    expect(state.confirmed).toBe(true);
  });

  it('a single inactive frame in the middle resets the confirm streak (no premature confirmation from intermittent noise)', () => {
    const state = run([
      { active: true, now: 0 },
      { active: true, now: 500 },
      { active: false, now: 600 }, // breaks the streak
      { active: true, now: 650 }, // streak restarts here
      { active: true, now: 1200 }, // only 550ms since restart — not yet confirmed
    ]);
    expect(state.confirmed).toBe(false);
  });

  it('stays confirmed through a brief gap shorter than releaseAfterMs (hysteresis)', () => {
    const state = run([
      { active: true, now: 0 },
      { active: true, now: 950 }, // confirmed
      { active: false, now: 1100 }, // 150ms gap, well under RELEASE_MS
    ]);
    expect(state.confirmed).toBe(true);
  });

  it('releases once the inactive gap persists past releaseAfterMs', () => {
    const state = run([
      { active: true, now: 0 },
      { active: true, now: 950 }, // confirmed
      { active: false, now: 1000 },
      { active: false, now: 1700 }, // 700ms gap, past RELEASE_MS
    ]);
    expect(state.confirmed).toBe(false);
  });

  it('isTemporalSignalPending is false once confirmed, and false when fully inactive', () => {
    const pendingState = stepTemporalSignal(
      INITIAL_TEMPORAL_SIGNAL_STATE,
      true,
      0,
      CONFIRM_MS,
      RELEASE_MS
    );
    expect(isTemporalSignalPending(pendingState)).toBe(true);

    const confirmedState = stepTemporalSignal(pendingState, true, 950, CONFIRM_MS, RELEASE_MS);
    expect(confirmedState.confirmed).toBe(true);
    expect(isTemporalSignalPending(confirmedState)).toBe(false);

    expect(isTemporalSignalPending(INITIAL_TEMPORAL_SIGNAL_STATE)).toBe(false);
  });
});
