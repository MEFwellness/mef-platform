/**
 * Coordinates "only one response plays at a time" (part 2) across every
 * SpeakerButton on the page — a module-level singleton rather than React
 * context, since playback must also be stoppable from outside React (e.g.
 * a route change listener). Deliberately decoupled from
 * `window.speechSynthesis` itself (that lives in browserTextToSpeech.ts)
 * so this coordination logic is pure and unit-testable: each player
 * registers a plain `stop` callback, and the registry's only job is
 * tracking which id is currently active and calling `stop` on whichever
 * one loses.
 */

type StopFn = () => void;

type Listener = (playingId: string | null) => void;

let currentId: string | null = null;
let currentStop: StopFn | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener(currentId);
}

/** Stops whatever is currently playing (if anything) and marks `id` as the new active player. Call this right before actually starting playback for `id`. */
export function requestPlay(id: string, stop: StopFn): void {
  if (currentId && currentId !== id) {
    currentStop?.();
  }
  currentId = id;
  currentStop = stop;
  notify();
}

/** A player reporting it has stopped (finished, was paused-then-stopped, or was preempted) — clears the registry only if it's still the active one, so a stale call from an already-preempted player can't clobber whoever took over. */
export function reportStopped(id: string): void {
  if (currentId !== id) return;
  currentId = null;
  currentStop = null;
  notify();
}

export function stopCurrent(): void {
  currentStop?.();
}

export function getCurrentlyPlayingId(): string | null {
  return currentId;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only reset — the registry is a module-level singleton, so tests must clear it between cases. */
export function _resetForTests(): void {
  currentId = null;
  currentStop = null;
  listeners.clear();
}
