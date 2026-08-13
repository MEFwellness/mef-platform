/**
 * One rule, in one place: a tap changes the screen NOW, and the write that
 * records it happens behind her.
 *
 * WHY THIS EXISTS. Found live on production, under Chrome's Slow 3G
 * profile: tapping the Weekly Root Review's "Got it" left the modal on
 * screen, with every button in it disabled and the page behind it locked
 * against scrolling, for the whole server round trip — just under three
 * seconds on a good day, longer on a cold serverless function. Nothing was
 * broken and nothing was lost; the app simply stopped answering, which is
 * indistinguishable from broken from the other side of the screen.
 *
 * The shape that caused it is the ordinary one:
 *
 *     startTransition(async () => {
 *       const result = await theWrite();   // <- the freeze
 *       if (result.ok) closeTheThing();
 *     });
 *
 * Two things go wrong at once there. The visible consequence of the tap is
 * sequenced AFTER the network, and `isPending` (true for the whole round
 * trip) is wired to `disabled` on the buttons, so the pop-up is both
 * unchanged and untouchable while it waits.
 *
 * NOT DROPPING THE WRITE IS THE OTHER HALF. Answering instantly is easy if
 * you are willing to lose writes; this is not. `acknowledge` runs first,
 * then the write runs with retries and only reports a loss after every
 * attempt has failed. Both call sites' writes are idempotent by
 * construction — the weekly review's acknowledgement is a conditional
 * claim on `acknowledged_at IS NULL`, the priority card's outcome an
 * UPDATE conditional on `member_response IS NULL` — so a retry can only
 * ever land the same single row, never a second one.
 *
 * PURE ON PURPOSE. No React, no fetch, no timers of its own that a test
 * cannot control. That is what lets the "she waits no time at all"
 * property be asserted with a clock in tests/popup-response-latency.test.ts
 * rather than asserted by reading the code and hoping.
 */

export type OptimisticWriteOptions = {
  /**
   * Everything the member should see as a result of her tap. Runs
   * SYNCHRONOUSLY, before the first await, before the first request.
   */
  acknowledge: () => void;
  /**
   * The write. Resolves true when the row landed, false when it did not.
   * A rejection is treated exactly like false — a call site is never asked
   * to remember to catch.
   */
  write: () => Promise<boolean>;
  /**
   * Called once, and only once, after every attempt has failed. This is
   * the only place a call site may show an error or roll its optimistic
   * state back, because it is the only point at which the write is
   * genuinely lost.
   */
  onLost?: () => void;
  /** Total attempts, first try included. */
  attempts?: number;
  /** Backoff before attempt n (1-based, so `delayMs(1)` precedes the second attempt). */
  delayMs?: (attempt: number) => number;
  /** Injectable for tests. Real callers get setTimeout. */
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_ATTEMPTS = 3;

/**
 * Doubling from a short first wait: 400ms, then 800ms. Long enough to ride
 * out a lost packet or a cold function, short enough that a member who
 * closes the tab a few seconds later has already had her answer recorded.
 */
function defaultDelayMs(attempt: number): number {
  return 400 * 2 ** (attempt - 1);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves true when the write landed on some attempt, false when it was
 * lost. Never rejects: there is no failure here a call site could handle
 * better than `onLost` already does.
 *
 * Deliberately NOT awaited by its callers. The returned promise exists for
 * tests and for a caller that genuinely wants to know later.
 */
export async function optimisticWrite(options: OptimisticWriteOptions): Promise<boolean> {
  const {
    acknowledge,
    write,
    onLost,
    attempts = DEFAULT_ATTEMPTS,
    delayMs = defaultDelayMs,
    sleep = defaultSleep,
  } = options;

  // First, and synchronously. Everything below this line is allowed to be
  // slow; nothing above it is.
  acknowledge();

  const total = Math.max(1, attempts);
  for (let attempt = 1; attempt <= total; attempt++) {
    let landed = false;
    try {
      landed = await write();
    } catch {
      landed = false;
    }
    if (landed) return true;
    if (attempt < total) await sleep(delayMs(attempt));
  }

  onLost?.();
  return false;
}
