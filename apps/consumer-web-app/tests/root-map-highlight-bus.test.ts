/**
 * Guard test for the Root Map ring -> "Not Covered Yet" highlight bus
 * (2026-07-29) — a plain EventTarget, same shape as
 * lib/root-launcher-bus.ts. requestRootMapHighlight is real, plain
 * JS/DOM-API code (no React involved), so it's exercised directly rather
 * than via a source scan: dispatching really carries the tapped domain
 * through as the event's detail.
 */
import { describe, it, expect, vi } from 'vitest';
import { requestRootMapHighlight } from '../lib/root-map/highlightBus';

describe('requestRootMapHighlight', () => {
  it('dispatches a real CustomEvent carrying the tapped domain as detail', () => {
    const spy = vi.spyOn(EventTarget.prototype, 'dispatchEvent');
    requestRootMapHighlight('purpose_motivation');

    expect(spy).toHaveBeenCalledTimes(1);
    const event = spy.mock.calls[0]?.[0] as CustomEvent<string>;
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.detail).toBe('purpose_motivation');

    spy.mockRestore();
  });
});
