/**
 * THE SIGNUP FORM THAT REFUSED THE FIRST TAP (2026-09-05).
 *
 * A real person walked the live funnel on an iPhone and the signup form
 * answered "We could not confirm that in time. Please try again." She got
 * through by pressing Continue several times. lib/turnstile/tokenLifecycle.ts
 * carries the full diagnosis; these are the properties that make it not
 * happen again, driven with a fake widget and a fake clock so every one of
 * them is a real run rather than a claim about the source.
 *
 * The four failures reproduced here are the four that were live:
 *   1. a token minted on page load and still held five minutes later,
 *   2. an expiry that cleared the token and re-armed nothing,
 *   3. a tap that waited on a challenge which was not running,
 *   4. a spent token sent again on the retry.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TurnstileTokenLifecycle,
  TOKEN_FRESHNESS_MS,
  TOKEN_WAIT_MS,
  AUTO_REARM_DELAY_MS,
  AUTO_REARM_LIMIT,
  type TurnstileWidgetPort,
} from '../lib/turnstile/tokenLifecycle';

/**
 * A Cloudflare widget that never solves on its own. Every solve and every
 * failure is made to happen by the test, and the clock only moves when the
 * test moves it, so nothing here depends on real time passing.
 */
class FakeWidget implements TurnstileWidgetPort {
  clock = 1_000_000;
  /** How many times the widget was told to start a fresh challenge. */
  rearms = 0;
  /** False before render() has run, which is the "nothing to re-arm yet" case. */
  present = true;
  /** Set by rearm(), read by the test to prove a challenge is genuinely in flight. */
  running = false;
  private timers = new Map<number, { fn: () => void; at: number }>();
  private nextTimer = 1;
  private issued = 0;

  rearm(): boolean {
    if (!this.present) return false;
    this.rearms += 1;
    this.running = true;
    return true;
  }
  now(): number {
    return this.clock;
  }
  setTimer(fn: () => void, ms: number): number {
    const id = this.nextTimer++;
    this.timers.set(id, { fn, at: this.clock + ms });
    return id;
  }
  clearTimer(id: number): void {
    this.timers.delete(id);
  }

  /** Moves the clock and fires everything that was due, in time order. */
  async advance(ms: number): Promise<void> {
    const target = this.clock + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.clock = due[1].at;
      due[1].fn();
      await Promise.resolve();
    }
    this.clock = target;
    await Promise.resolve();
  }

  /** Cloudflare answering. Each call hands back a genuinely different token. */
  nextToken(): string {
    this.issued += 1;
    this.running = false;
    return `tok-${this.issued}`;
  }
}

let widget: FakeWidget;
let gate: TurnstileTokenLifecycle;

beforeEach(() => {
  widget = new FakeWidget();
  gate = new TurnstileTokenLifecycle(widget);
});

/** The state the component leaves it in on mount: rendered, challenge running. */
function mounted(): void {
  gate.markRunning();
}

describe('the ordinary path is unchanged', () => {
  it('hands back the token the widget solved, with no extra challenge', async () => {
    mounted();
    gate.onSolved('tok-page-load');
    await expect(gate.getToken()).resolves.toBe('tok-page-load');
    expect(widget.rearms).toBe(0);
  });

  it('waits for a challenge that is still running rather than restarting it', async () => {
    mounted();
    const pending = gate.getToken();
    await widget.advance(400);
    expect(widget.rearms).toBe(0);
    gate.onSolved('tok-slow');
    await expect(pending).resolves.toBe('tok-slow');
  });
});

describe('failure 1: the token held from page load until the button is pressed', () => {
  it('refuses to send a token older than the freshness window, and mints a new one', async () => {
    mounted();
    gate.onSolved('tok-stale');
    await widget.advance(TOKEN_FRESHNESS_MS + 1);
    const pending = gate.getToken();
    // Asking started a new challenge instead of handing over the old value.
    expect(widget.rearms).toBe(1);
    const fresh = widget.nextToken();
    gate.onSolved(fresh);
    const sent = await pending;
    expect(sent).toBe(fresh);
    expect(sent).not.toBe('tok-stale');
  });

  it('still sends a token that is inside the window', async () => {
    mounted();
    gate.onSolved('tok-recent');
    await widget.advance(TOKEN_FRESHNESS_MS - 1_000);
    await expect(gate.getToken()).resolves.toBe('tok-recent');
    expect(widget.rearms).toBe(0);
  });

  it("keeps its window comfortably inside Cloudflare's own five minute expiry", () => {
    expect(TOKEN_FRESHNESS_MS).toBeLessThan(300_000);
  });
});

describe('failure 2: an expiry that re-armed nothing', () => {
  it('starts a fresh challenge on its own after the token expires', async () => {
    mounted();
    gate.onSolved('tok-1');
    gate.onFailed(); // expired-callback
    expect(widget.rearms).toBe(0);
    await widget.advance(AUTO_REARM_DELAY_MS);
    // Armed again BEFORE she taps anything, which is the whole fix.
    expect(widget.rearms).toBe(1);
    expect(widget.running).toBe(true);
  });

  it('does the same after an error callback and after a timeout callback', async () => {
    mounted();
    gate.onFailed();
    await widget.advance(AUTO_REARM_DELAY_MS);
    expect(widget.rearms).toBe(1);
    gate.onSolved(widget.nextToken());
    gate.onFailed();
    await widget.advance(AUTO_REARM_DELAY_MS);
    expect(widget.rearms).toBe(2);
  });

  it('gives up re-arming by itself once nothing is working, instead of looping forever', async () => {
    mounted();
    for (let i = 0; i < AUTO_REARM_LIMIT + 3; i += 1) {
      gate.onFailed();
      await widget.advance(AUTO_REARM_DELAY_MS);
    }
    expect(widget.rearms).toBe(AUTO_REARM_LIMIT);
  });

  it('forgives the whole budget the moment a challenge succeeds again', async () => {
    mounted();
    for (let i = 0; i < AUTO_REARM_LIMIT; i += 1) {
      gate.onFailed();
      await widget.advance(AUTO_REARM_DELAY_MS);
    }
    expect(widget.rearms).toBe(AUTO_REARM_LIMIT);
    gate.onSolved(widget.nextToken());
    gate.onFailed();
    await widget.advance(AUTO_REARM_DELAY_MS);
    expect(widget.rearms).toBe(AUTO_REARM_LIMIT + 1);
  });
});

describe('failure 3: a tap that waited on a challenge which was not running', () => {
  it('re-arms and waits, instead of sitting out the full wait for nothing', async () => {
    mounted();
    gate.onFailed();
    // She taps immediately, before the self re-arm timer has even fired.
    const pending = gate.getToken();
    expect(widget.rearms).toBe(1);
    gate.onSolved('tok-after-tap');
    await expect(pending).resolves.toBe('tok-after-tap');
  });

  it('answers null rather than hanging when Cloudflare never comes back', async () => {
    mounted();
    gate.onFailed();
    const pending = gate.getToken();
    await widget.advance(TOKEN_WAIT_MS + 1);
    // Null, so the submission proceeds and Supabase decides. That is the
    // safety property this whole build rests on.
    await expect(pending).resolves.toBeNull();
  });

  it('waits rather than failing when the widget has not rendered yet', async () => {
    widget.present = false;
    const pending = gate.getToken();
    expect(widget.rearms).toBe(0);
    widget.present = true;
    mounted();
    gate.onSolved('tok-late-render');
    await expect(pending).resolves.toBe('tok-late-render');
  });

  it('re-arms when the tab comes back into view holding a stale token', async () => {
    mounted();
    gate.onSolved('tok-before-the-mail-app');
    await widget.advance(TOKEN_FRESHNESS_MS + 1);
    gate.refreshIfStale();
    expect(widget.rearms).toBe(1);
  });

  it('does nothing on a return to a tab whose token is still good', async () => {
    mounted();
    gate.onSolved('tok-good');
    await widget.advance(5_000);
    gate.refreshIfStale();
    expect(widget.rearms).toBe(0);
  });

  it('does not restart a challenge that is already running when the tab returns', () => {
    mounted();
    gate.refreshIfStale();
    expect(widget.rearms).toBe(0);
  });
});

describe('failure 4: the spent token, sent again', () => {
  it('refresh() never hands back the value that was just spent', async () => {
    mounted();
    gate.onSolved('tok-spent');
    const pending = gate.refresh();
    expect(widget.rearms).toBe(1);
    gate.onSolved('tok-replacement');
    const next = await pending;
    expect(next).toBe('tok-replacement');
    expect(next).not.toBe('tok-spent');
  });

  it('reset() replaces the spent token without anybody waiting on it', async () => {
    mounted();
    gate.onSolved('tok-spent');
    gate.reset();
    expect(widget.rearms).toBe(1);
    // And the spent value is genuinely gone, not merely shadowed.
    const pending = gate.getToken();
    gate.onSolved('tok-new');
    await expect(pending).resolves.toBe('tok-new');
  });
});

describe('unmounting', () => {
  it('answers everybody waiting rather than leaving a submission hanging', async () => {
    mounted();
    const pending = gate.getToken();
    gate.dispose();
    await expect(pending).resolves.toBeNull();
  });

  it('cancels the self re-arm, so a removed widget is never poked', async () => {
    mounted();
    gate.onFailed();
    gate.dispose();
    await widget.advance(AUTO_REARM_DELAY_MS * 4);
    expect(widget.rearms).toBe(0);
  });
});
