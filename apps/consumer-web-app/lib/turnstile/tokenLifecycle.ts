/**
 * THE LIFETIME OF ONE BOT-CHECK TOKEN, AS A STATE MACHINE THAT CAN BE
 * TESTED WITHOUT A BROWSER.
 *
 * WHY THIS FILE EXISTS, MEASURED RATHER THAN IMAGINED. On 2026-09-05, the
 * day the trial arc launched, a real person walked the funnel on an iPhone
 * and the live signup form told her "We could not confirm that in time"
 * over and over. She got through by tapping Continue several times. Nothing
 * was wrong with her email, her password or her connection.
 *
 * What was wrong was that the token was minted ONCE, when the page loaded,
 * and then simply held. A Cloudflare Turnstile token is good for about five
 * minutes and can be spent once. Everything a real person does between
 * landing on the signup form and pressing the button (reading, typing an
 * address on a phone keyboard, a password manager sheet, switching to the
 * mail app and back) burns that window, and iOS suspending a backgrounded
 * tab can end the challenge outright. The old component treated both of
 * those as a terminal null: it cleared the token, resolved anybody waiting
 * with nothing, and left the widget dead. So her first tap waited the full
 * eight seconds for a challenge that was not running, submitted with no
 * token, and was refused by Supabase. Only the failure handler re-armed the
 * widget, which is why the SECOND tap worked. The first tap was, in effect,
 * the thing that fixed the form.
 *
 * THE RULE THIS ENCODES. A token is only worth sending if it is FRESH, and
 * "there is no fresh token" is a reason to go and get one, never a reason
 * to give up. So:
 *
 *   FRESHNESS IS CHECKED, NOT ASSUMED. A held token older than
 *   TOKEN_FRESHNESS_MS is treated as if it were absent, well inside
 *   Cloudflare's own expiry, so a token is never sent stale.
 *   ASKING FOR A TOKEN CAN START ONE. getToken() re-arms the widget when
 *   nothing is running, then waits, instead of waiting on nothing.
 *   A FAILURE RE-ARMS ITSELF. An expiry, an error or a timeout schedules a
 *   fresh challenge on its own, bounded, so the widget is armed again
 *   BEFORE her next tap rather than because of it.
 *   COMING BACK TO THE TAB RE-ARMS IT. refreshIfStale() is what the
 *   component calls when the page becomes visible again.
 *   RETURNING NULL IS STILL ALLOWED, AND IS STILL THE SAFETY PROPERTY.
 *   After all of that, if Cloudflare will not answer, the caller submits
 *   without a token and Supabase decides. See components/auth/TurnstileGate.tsx.
 *
 * NO DOM, NO WINDOW, NO REACT. The widget, the clock and the timers all
 * arrive as a `TurnstileWidgetPort`, which is what lets
 * tests/turnstile-token-lifecycle.test.ts drive expiry, backgrounding, a
 * spent token and a full retry round in a plain node test.
 */

/**
 * How old a held token may be and still be sent. Cloudflare's own tokens
 * last about five minutes; two is comfortably inside that with room for a
 * slow round trip, and it costs nothing to mint another one.
 */
export const TOKEN_FRESHNESS_MS = 120_000;

/**
 * How long getToken()/refresh() will wait for a challenge to finish. Long
 * enough for a slow phone on a slow network, short enough that nobody sits
 * looking at a stuck button.
 */
export const TOKEN_WAIT_MS = 8_000;

/** How long after a failure before the widget re-arms itself. */
export const AUTO_REARM_DELAY_MS = 750;

/**
 * How many times in a row the widget may re-arm itself with no successful
 * solve in between. A cap, not a policy: it stops a permanently failing
 * challenge (Cloudflare down, a blocked script) from re-arming forever in
 * a background tab. Reset to zero every time a token actually arrives.
 */
export const AUTO_REARM_LIMIT = 5;

/** Everything this state machine needs from the outside world. */
export interface TurnstileWidgetPort {
  /**
   * Throw away whatever the widget holds and start a fresh challenge.
   * False when there is no widget to re-arm yet (the script has not loaded,
   * or render() has not run), which is a wait-and-see, not a failure.
   */
  rearm(): boolean;
  now(): number;
  setTimer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
}

type Waiter = (token: string | null) => void;

export class TurnstileTokenLifecycle {
  private readonly port: TurnstileWidgetPort;
  private token: string | null = null;
  private mintedAt = 0;
  /** True while a challenge is actually in flight. */
  private running = false;
  private waiters: Waiter[] = [];
  private autoRearms = 0;
  private rearmTimer: number | null = null;
  private readonly waitTimers = new Set<number>();

  constructor(port: TurnstileWidgetPort) {
    this.port = port;
  }

  /** The widget has been rendered (or re-armed) and a challenge is running. */
  markRunning(): void {
    this.running = true;
  }

  /** Cloudflare solved the challenge. */
  onSolved(token: string): void {
    this.token = token;
    this.mintedAt = this.port.now();
    this.running = false;
    this.autoRearms = 0;
    this.cancelAutoRearm();
    this.settle(token);
  }

  /**
   * The challenge expired, errored or timed out. Anybody waiting is
   * answered honestly with null so no submission hangs, AND a fresh
   * challenge is scheduled, so the next tap finds a live widget instead of
   * a dead one. That second half is the whole fix.
   */
  onFailed(): void {
    this.token = null;
    this.mintedAt = 0;
    this.running = false;
    this.settle(null);
    this.scheduleAutoRearm();
  }

  /** True when a token is held and young enough to send. */
  isFresh(): boolean {
    return this.token !== null && this.port.now() - this.mintedAt < TOKEN_FRESHNESS_MS;
  }

  /**
   * The token to send with this submission. Fresh if one is held, newly
   * minted if not, and null only when Cloudflare would not answer in
   * TOKEN_WAIT_MS.
   */
  async getToken(): Promise<string | null> {
    if (this.isFresh()) return this.token;
    if (!this.running) this.rearm();
    return await this.wait();
  }

  /**
   * A token that is definitely not the one just spent. Used by the retry
   * path after the check refuses a submission: the previous token is
   * either used or stale by definition, so this always starts a new
   * challenge rather than reading anything held.
   */
  async refresh(): Promise<string | null> {
    this.rearm();
    return await this.wait();
  }

  /**
   * Fire and forget re-arm after a submission that reached Supabase.
   * Turnstile tokens are single use, so a form that stays on screen must
   * replace the spent one whatever the outcome.
   */
  reset(): void {
    this.rearm();
  }

  /**
   * Called when the page becomes visible again. A phone that sat in the
   * background through a mail app or a password manager comes back with a
   * token that is stale, spent or gone, and this is what puts a live
   * challenge back in flight before she taps anything.
   */
  refreshIfStale(): void {
    if (this.isFresh() || this.running) return;
    this.rearm();
  }

  /** Unmount. Clears every timer and never leaves a caller hanging. */
  dispose(): void {
    this.cancelAutoRearm();
    for (const id of this.waitTimers) this.port.clearTimer(id);
    this.waitTimers.clear();
    this.running = false;
    this.settle(null);
  }

  private rearm(): void {
    this.cancelAutoRearm();
    this.token = null;
    this.mintedAt = 0;
    // A false here means the widget does not exist yet, so there is
    // nothing to re-arm and nothing is running. The waiter below still
    // gets its chance: the mount effect calls markRunning() the moment
    // render() succeeds, and the real callback settles it.
    if (this.port.rearm()) this.running = true;
  }

  private scheduleAutoRearm(): void {
    if (this.autoRearms >= AUTO_REARM_LIMIT) return;
    this.cancelAutoRearm();
    this.autoRearms += 1;
    this.rearmTimer = this.port.setTimer(() => {
      this.rearmTimer = null;
      if (this.running || this.isFresh()) return;
      this.rearm();
    }, AUTO_REARM_DELAY_MS);
  }

  private cancelAutoRearm(): void {
    if (this.rearmTimer === null) return;
    this.port.clearTimer(this.rearmTimer);
    this.rearmTimer = null;
  }

  private wait(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      let done = false;
      let timer = 0;
      const finish = (token: string | null) => {
        if (done) return;
        done = true;
        this.waitTimers.delete(timer);
        this.port.clearTimer(timer);
        resolve(token);
      };
      this.waiters.push(finish);
      timer = this.port.setTimer(() => finish(null), TOKEN_WAIT_MS);
      this.waitTimers.add(timer);
    });
  }

  private settle(token: string | null): void {
    const waiting = this.waiters;
    this.waiters = [];
    for (const resolve of waiting) resolve(token);
  }
}
