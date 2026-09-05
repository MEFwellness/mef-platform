'use client';

/**
 * The bot check that sits on every auth form, and does nothing at all until
 * a site key exists.
 *
 * Renders null when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (see
 * lib/turnstile/env.ts): no script tag, no network request to Cloudflare,
 * no hidden field, no layout shift. That is what let the code go live
 * before the Supabase dashboard switch was flipped rather than after it,
 * which is the only safe order.
 *
 * With a key set, the widget runs in Cloudflare's interaction-only
 * appearance: it stays invisible and solves itself in the background for a
 * normal member, and only paints something on screen in the case it exists
 * for, which is a visitor it cannot clear silently. Almost nobody ever sees
 * it. That is the point.
 *
 * THE TOKEN IS KEPT FRESH, NOT JUST FETCHED ONCE (2026-09-05). This
 * component used to mint one token on page load and hand out that same
 * value forever, treating an expiry or an error as a permanent null. On a
 * real iPhone that produced a signup form which refused the first tap of
 * Continue every time and only worked on the second, because only the
 * failure path re-armed the widget. The whole lifetime rule now lives in
 * lib/turnstile/tokenLifecycle.ts, which explains that failure in full;
 * this component is the wiring: it renders the widget, reports what
 * Cloudflare says, re-arms when the tab comes back into view, and exposes
 * three verbs to the forms.
 *
 * Returning null is still deliberate and is still the safety property of
 * this whole build: a missing token is submitted as a missing token, not as
 * a blocked submission. While the Supabase switch is off, that request
 * succeeds exactly as it always did, so a bad day at Cloudflare can never
 * lock members out of an app that is not yet asking for a token. Once the
 * switch is on, Supabase refuses the request, lib/turnstile/submit.ts
 * quietly tries once more with a genuinely new token, and only a failure
 * that survives that reaches the member as the calm message in
 * lib/turnstile/env.ts. The decision about whether a token is genuine
 * belongs to Supabase, which holds the secret key; this component only
 * carries it.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { getTurnstileSiteKey } from '@/lib/turnstile/env';
import { TurnstileTokenLifecycle } from '@/lib/turnstile/tokenLifecycle';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileRenderOptions {
  sitekey: string;
  appearance?: 'always' | 'execute' | 'interaction-only';
  theme?: 'light' | 'dark' | 'auto';
  retry?: 'auto' | 'never';
  'refresh-expired'?: 'auto' | 'manual' | 'never';
  'refresh-timeout'?: 'auto' | 'manual' | 'never';
  callback?: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Shared across every instance and every mount: the script is fetched once
 * per page load however many auth forms happen to exist. Cleared on failure
 * so a later form can retry rather than inheriting a permanently rejected
 * promise.
 */
let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const target = existing ?? document.createElement('script');
    target.addEventListener('load', () => resolve());
    target.addEventListener('error', () => {
      scriptPromise = null;
      reject(new Error('Turnstile script did not load'));
    });
    if (!existing) {
      target.src = SCRIPT_SRC;
      target.async = true;
      target.defer = true;
      document.head.appendChild(target);
    }
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  /**
   * The token to send with this submission, or null if there is nothing to
   * send (bot protection off, Cloudflare unreachable). Never returns a
   * token that is old enough to have expired on the way: when the held one
   * is stale it starts a new challenge and waits for that instead. Callers
   * submit either way, see this file's header for why.
   */
  getToken(): Promise<string | null>;
  /**
   * A token that is definitely not the one just spent. For the retry after
   * the check refuses a submission, see lib/turnstile/submit.ts.
   */
  refresh(): Promise<string | null>;
  /**
   * Throws away the used token and starts a fresh challenge, without
   * waiting for it. Turnstile tokens are single use, so this runs after
   * every submission that reached Supabase, successful or not.
   */
  reset(): void;
}

export const TurnstileGate = forwardRef<TurnstileHandle>(function TurnstileGate(_props, ref) {
  const siteKey = getTurnstileSiteKey();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const lifecycleRef = useRef<TurnstileTokenLifecycle | null>(null);

  /**
   * Built once per mounted component, lazily, and deliberately without
   * touching `window`: this component is rendered on the server too, and
   * every port method below is only ever invoked from an effect or a
   * button press.
   */
  const lifecycle = useCallback((): TurnstileTokenLifecycle => {
    if (lifecycleRef.current === null) {
      lifecycleRef.current = new TurnstileTokenLifecycle({
        rearm: () => {
          const id = widgetIdRef.current;
          if (id === null || typeof window === 'undefined' || !window.turnstile) return false;
          try {
            window.turnstile.reset(id);
            return true;
          } catch {
            // Widget not in a resettable state. Reported as "nothing is
            // running", which is the honest answer and leaves the caller
            // waiting rather than believing a challenge is in flight.
            return false;
          }
        },
        now: () => Date.now(),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (id) => window.clearTimeout(id),
      });
    }
    return lifecycleRef.current;
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    const machine = lifecycle();
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        // React runs effects twice in development's strict mode; without
        // this the container would hold two widgets, only one of which
        // anything holds an id for.
        if (widgetIdRef.current !== null) {
          machine.markRunning();
          return;
        }

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          theme: 'light',
          retry: 'auto',
          // Cloudflare's own half of keeping a token usable. Stated rather
          // than left to the default so it cannot change under us: this
          // component's re-arming is the backstop for the cases these two
          // do not cover, not a replacement for them.
          'refresh-expired': 'auto',
          'refresh-timeout': 'auto',
          callback: (token: string) => machine.onSolved(token),
          'error-callback': () => machine.onFailed(),
          'expired-callback': () => machine.onFailed(),
          'timeout-callback': () => machine.onFailed(),
        });
        machine.markRunning();
      })
      .catch(() => {
        if (!cancelled) machine.onFailed();
      });

    /**
     * A phone that went to the mail app, a password manager or the home
     * screen comes back with a challenge that iOS may have suspended and a
     * token that may have expired while it was away. This is the moment to
     * put a live one back in flight, before she taps anything.
     */
    const onVisible = () => {
      if (document.visibilityState === 'visible') machine.refreshIfStale();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      machine.dispose();
      const id = widgetIdRef.current;
      widgetIdRef.current = null;
      if (id !== null && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          // Already gone, or removed with the container. Nothing to undo.
        }
      }
    };
  }, [siteKey, lifecycle]);

  useImperativeHandle(
    ref,
    (): TurnstileHandle => ({
      async getToken() {
        if (!siteKey) return null;
        return await lifecycle().getToken();
      },
      async refresh() {
        if (!siteKey) return null;
        return await lifecycle().refresh();
      },
      reset() {
        if (!siteKey) return;
        lifecycle().reset();
      },
    }),
    [siteKey, lifecycle]
  );

  if (!siteKey) return null;

  /**
   * Deliberately no card, no border, no caption of our own.
   *
   * The first live run of this against production caught exactly why. A
   * headless browser is automation, Turnstile correctly refused to clear it
   * silently, and Cloudflare's own interactive challenge never painted
   * anything into the container. Anything this component had drawn around
   * that container on the strength of "a challenge is coming" would have
   * been a cream box with a sentence in it and nothing to click, on every
   * auth screen, for anyone Turnstile decides to look at twice. A label
   * over an empty space is worse than no label.
   *
   * So the container is only ever a container. Empty, it has no height and
   * no member can tell it is there. Occupied, what fills it is Cloudflare's
   * own familiar "Verify you are human" control, which explains itself and
   * cannot be restyled from here in any case. This element carries the
   * app's typeface and the vertical rhythm of the form it sits in, and
   * nothing else, so the two states are honest: invisible, or a real
   * control.
   */
  return (
    <div
      ref={containerRef}
      data-testid="turnstile-gate"
      className="empty:hidden font-[family-name:var(--font-dm-sans)]"
    />
  );
});
