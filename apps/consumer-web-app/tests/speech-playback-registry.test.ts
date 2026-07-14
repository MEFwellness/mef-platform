/**
 * Unit tests for lib/speech/playbackRegistry.ts — the "only one response
 * plays at a time" coordination logic (part 2). Pure module-level state
 * with mocked stop callbacks, no browser APIs involved, so this is fully
 * testable in isolation from the actual `speechSynthesis` engine.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  requestPlay,
  reportStopped,
  stopCurrent,
  getCurrentlyPlayingId,
  subscribe,
  _resetForTests,
} from '../lib/speech/playbackRegistry';

beforeEach(() => {
  _resetForTests();
});

describe('playbackRegistry', () => {
  it('has no active player initially', () => {
    expect(getCurrentlyPlayingId()).toBeNull();
  });

  it('tracks the requested id as the active player', () => {
    const stop = vi.fn();
    requestPlay('msg-1', stop);
    expect(getCurrentlyPlayingId()).toBe('msg-1');
    expect(stop).not.toHaveBeenCalled();
  });

  it('stops the previous player when a new one requests play', () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    requestPlay('msg-a', stopA);
    requestPlay('msg-b', stopB);

    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).not.toHaveBeenCalled();
    expect(getCurrentlyPlayingId()).toBe('msg-b');
  });

  it('does not call stop on itself when the same id requests play again (e.g. replay)', () => {
    const stop = vi.fn();
    requestPlay('msg-1', stop);
    requestPlay('msg-1', stop);
    expect(stop).not.toHaveBeenCalled();
  });

  it('clears the active player when it reports itself stopped', () => {
    requestPlay('msg-1', vi.fn());
    reportStopped('msg-1');
    expect(getCurrentlyPlayingId()).toBeNull();
  });

  it('ignores a stale reportStopped from a player that was already preempted', () => {
    requestPlay('msg-a', vi.fn());
    requestPlay('msg-b', vi.fn());
    // msg-a's own cleanup fires late, after msg-b already took over.
    reportStopped('msg-a');
    expect(getCurrentlyPlayingId()).toBe('msg-b');
  });

  it("stopCurrent invokes the active player's stop callback", () => {
    const stop = vi.fn();
    requestPlay('msg-1', stop);
    stopCurrent();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('notifies subscribers whenever the active player changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    requestPlay('msg-1', vi.fn());
    expect(listener).toHaveBeenLastCalledWith('msg-1');

    reportStopped('msg-1');
    expect(listener).toHaveBeenLastCalledWith(null);

    unsubscribe();
    requestPlay('msg-2', vi.fn());
    expect(listener).not.toHaveBeenLastCalledWith('msg-2');
  });
});
