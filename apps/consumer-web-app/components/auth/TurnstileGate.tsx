'use client';

/**
 * The bot check that sits on every auth form, and does nothing at all until
 * a site key exists.
 *
 * Renders null when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (see
 * lib/turnstile/env.ts) — no script tag, no network request to Cloudflare,
 * no hidden field, no layout shift. That is the state this ships in, and it
 * is what lets the code go live before the Supabase dashboard switch is
 * flipped rather than after it, which is the only safe order: the moment
 * captcha is enabled in Supabase, every request without a token is rejected,
 * so the token has to already be arriving.
 *
 * With a key set, the widget runs in Cloudflare's interaction-only
 * appearance: it stays invisible and solves itself in the background for a
 * normal member, and only paints something on screen in the case it exists
 * for, which is a visitor it cannot clear silently. Almost nobody ever sees
 * it. That is the point.
 *
 * The token is fetched ahead of time rather than on submit, so the common
 * path adds nothing to how long logging in takes. `getToken()` returns
 * whatever is ready, waits a bounded moment if the challenge is still in
 * flight, and returns null rather than hanging if Cloudflare never answers.
 *
 * Returning null is deliberate and is the safety property of this whole
 * build: a missing token is submitted as a missing token, not as a blocked
 * submission. While the Supabase switch is off, that request succeeds
 * exactly as it always did, so a bad day at Cloudflare can never lock
 * members out of an app that is not yet asking for a token. Once the switch
 * is on, Supabase refuses the request and the calm message in
 * lib/auth/errors.ts explains it. The decision about whether a token is
 * genuine belongs to Supabase, which holds the secret key; this component
 * only carries it.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { getTurnstileSiteKey } from '@/lib/turnstile/env';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/**
 * How long getToken() will wait for a challenge that has not finished. Long
 * enough for a slow phone on a slow network to complete a silent check,
 * short enough that a member never sits looking at a stuck button.
 */
const TOKEN_WAIT_MS = 8000;

interface TurnstileRenderOptions {
  sitekey: string;
  appearance?: 'always' | 'execute' | 'interaction-only';
  theme?: 'light' | 'dark' | 'auto';
  retry?: 'auto' | 'never';
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
   * send (bot protection off, challenge unfinished, Cloudflare unreachable).
   * Callers submit either way — see this file's header for why.
   */
  getToken(): Promise<string | null>;
  /**
   * Throws away the used token and starts a fresh challenge. Turnstile
   * tokens are single-use, so this must run after every submission that
   * reached Supabase, successful or not, or a retry would send a token
   * that has already been spent and be refused for the wrong reason.
   */
  reset(): void;
}

export const TurnstileGate = forwardRef<TurnstileHandle>(function TurnstileGate(_props, ref) {
  const siteKey = getTurnstileSiteKey();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  /** Resolvers for getToken() calls made while a challenge is still running. */
  const waitersRef = useRef<Array<(token: string | null) => void>>([]);

  const settle = useCallback((token: string | null) => {
    tokenRef.current = token;
    const waiting = waitersRef.current;
    waitersRef.current = [];
    for (const resolve of waiting) resolve(token);
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        // React runs effects twice in development's strict mode; without
        // this the container would hold two widgets, only one of which
        // anything holds an id for.
        if (widgetIdRef.current !== null) return;

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          theme: 'light',
          retry: 'auto',
          callback: (token: string) => settle(token),
          // A failed or expired challenge resolves waiters with null rather
          // than leaving them pending: the submission proceeds without a
          // token and Supabase decides, which is the same rule as everywhere
          // else here.
          'error-callback': () => settle(null),
          'expired-callback': () => settle(null),
          'timeout-callback': () => settle(null),
        });
      })
      .catch(() => {
        if (!cancelled) settle(null);
      });

    return () => {
      cancelled = true;
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
  }, [siteKey, settle]);

  useImperativeHandle(
    ref,
    (): TurnstileHandle => ({
      async getToken() {
        if (!siteKey) return null;
        if (tokenRef.current) return tokenRef.current;
        return await new Promise<string | null>((resolve) => {
          let done = false;
          const finish = (token: string | null) => {
            if (done) return;
            done = true;
            resolve(token);
          };
          waitersRef.current.push(finish);
          window.setTimeout(() => finish(null), TOKEN_WAIT_MS);
        });
      },
      reset() {
        if (!siteKey) return;
        tokenRef.current = null;
        const id = widgetIdRef.current;
        if (id !== null && window.turnstile) {
          try {
            window.turnstile.reset(id);
          } catch {
            // Widget not in a resettable state; the next mount rebuilds it.
          }
        }
      },
    }),
    [siteKey]
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
