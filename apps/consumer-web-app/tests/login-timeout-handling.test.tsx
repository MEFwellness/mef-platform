// @vitest-environment jsdom
/**
 * THE LOGIN THAT TOLD HER "WE COULD NOT CONFIRM THAT IN TIME" WHILE SHE
 * HELD A CORRECT PASSWORD. (2026-09-11)
 *
 * Reported from a phone, and then measured on production at a throttled
 * mobile profile with scripts/measure-login-token-live.mjs: the bot
 * check's script was not even ASKED FOR until roughly 1.6 seconds after
 * /login was opened, because components/auth/TurnstileGate.tsx appended it
 * from a mount effect, which is to say after the app's own JavaScript had
 * downloaded, parsed and hydrated. Cloudflare could only begin its own
 * round trips after that, so a member who typed quickly reached the button
 * before a token existed.
 *
 * What happened then is the part that turned slow into broken. The
 * submission went out with NO token, Supabase refused it for exactly that
 * reason, and lib/turnstile/submit.ts started its one silent retry by
 * calling `refresh()`, which throws the widget's challenge away and starts
 * another from nothing. But nothing had been spent: the first attempt
 * carried no token at all, and very often the challenge had FINISHED
 * during the round trip to Supabase. So a perfectly good, unspent,
 * seconds-old token was deleted and the retry spent a second full wait
 * getting back to where it already was, and when that one also ran out she
 * was told to try again.
 *
 * The three things that fixes, held here:
 *
 *   THE SCRIPT IS IN THE SERVER-RENDERED HTML, so the download starts
 *   during parse rather than after hydration.
 *   THE RETRY ASKS THE QUESTION THAT MATCHES WHAT HAPPENED. Nothing spent,
 *   therefore ask for a token; a token spent, therefore refresh.
 *   AND A SUBMISSION THAT NEVER GOT ONE IS STILL SENT, because that is the
 *   safety property of this whole build and is not being traded away.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { submitWithFreshCaptcha, type TurnstileTokenSource } from '../lib/turnstile/submit';
import { TURNSTILE_SCRIPT_SRC } from '../lib/turnstile/script';
import { TurnstilePreload } from '../components/auth/TurnstilePreload';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** GoTrue's own wording when the dashboard captcha switch refuses a request. */
const REFUSED = 'captcha protection: request disallowed (invalid-input-response)';

describe('the retry after a submission that carried no token', () => {
  it('asks for a token rather than restarting the challenge, because nothing was spent', async () => {
    const calls: string[] = [];
    let solved = false;
    const gate: TurnstileTokenSource = {
      async getToken() {
        calls.push('getToken');
        // The first ask times out with the challenge still running. By the
        // second, Cloudflare has answered: this is the real phone case.
        if (!solved) {
          solved = true;
          return null;
        }
        return 'tok-arrived-during-the-round-trip';
      },
      async refresh() {
        calls.push('refresh');
        return 'tok-from-a-brand-new-challenge';
      },
      reset() {
        calls.push('reset');
      },
    };

    const sent: (string | null)[] = [];
    const result = await submitWithFreshCaptcha(gate, async (token) => {
      sent.push(token);
      return token === null ? { error: REFUSED } : {};
    });

    expect(calls).toEqual(['getToken', 'getToken', 'reset']);
    expect(calls).not.toContain('refresh');
    expect(sent).toEqual([null, 'tok-arrived-during-the-round-trip']);
    expect(result.error).toBeUndefined();
  });

  it('still refreshes when the first attempt really did spend one', async () => {
    const calls: string[] = [];
    const gate: TurnstileTokenSource = {
      async getToken() {
        calls.push('getToken');
        return 'tok-held';
      },
      async refresh() {
        calls.push('refresh');
        return 'tok-new';
      },
      reset() {
        calls.push('reset');
      },
    };
    await submitWithFreshCaptcha(gate, async () => ({ error: REFUSED }));
    expect(calls).toEqual(['getToken', 'refresh', 'reset']);
  });

  it('submits anyway when neither ask produces one, rather than blocking her', async () => {
    const gate: TurnstileTokenSource = {
      async getToken() {
        return null;
      },
      async refresh() {
        return null;
      },
      reset() {},
    };
    const sent: (string | null)[] = [];
    await submitWithFreshCaptcha(gate, async (token) => {
      sent.push(token);
      return { error: REFUSED };
    });
    expect(sent).toEqual([null, null]);
  });

  it('never runs a third attempt, however the second one is obtained', async () => {
    let attempts = 0;
    const gate: TurnstileTokenSource = {
      async getToken() {
        return null;
      },
      async refresh() {
        return null;
      },
      reset() {},
    };
    await submitWithFreshCaptcha(gate, async () => {
      attempts += 1;
      return { error: REFUSED };
    });
    expect(attempts).toBe(2);
  });
});

describe('the challenge starts before the app hydrates', () => {
  const withKey = <T,>(key: string | undefined, run: () => T): T => {
    const previous = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (key === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = key;
    try {
      return run();
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
      else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = previous;
    }
  };

  it('puts the script and a warm connection in the server-rendered HTML', () => {
    const html = withKey('0xTEST', () => renderToStaticMarkup(<TurnstilePreload />));
    expect(html).toContain(`src="${TURNSTILE_SCRIPT_SRC}"`);
    expect(html).toContain('rel="preconnect"');
    expect(html).toContain('https://challenges.cloudflare.com');
    // Without crossorigin the warmed connection is not the one an
    // anonymous script fetch then uses, and the handshake is paid twice.
    expect(html).toMatch(/crossorigin/i);
    // async, so it never blocks the parser it is racing.
    expect(html).toMatch(/<script[^>]*\basync\b/);
  });

  it('renders nothing at all when bot protection is not configured', () => {
    const html = withKey(undefined, () => renderToStaticMarkup(<TurnstilePreload />));
    expect(html).toBe('');
  });

  it('is on every screen that carries a widget', () => {
    expect(read('app/(auth)/layout.tsx')).toContain('<TurnstilePreload />');
    // The one signed-in form with a bot check on it.
    expect(read('app/account/password/page.tsx')).toContain('<TurnstilePreload />');
  });

  it('asks for the same URL the widget waits on, from one definition', () => {
    const gate = read('components/auth/TurnstileGate.tsx');
    const preload = read('components/auth/TurnstilePreload.tsx');
    // Neither file may carry its own copy of the literal: a second
    // spelling is a second download and a widget waiting on the wrong tag.
    expect(gate).not.toContain('https://challenges.cloudflare.com/turnstile');
    expect(preload).not.toContain('https://challenges.cloudflare.com/turnstile');
    expect(gate).toContain("from '@/lib/turnstile/script'");
    expect(preload).toContain("from '@/lib/turnstile/script'");
  });

  it('does not wait on a load event that may already be in the past', () => {
    const gate = read('components/auth/TurnstileGate.tsx');
    // The tag is normally already in the HTML and has normally already
    // run by the time the widget mounts. A `load` listener attached then
    // never fires, which would be a widget that never renders and a login
    // that can never succeed. The loader polls for the API instead.
    expect(gate).toMatch(/if \(window\.turnstile\) return resolve\(\);/);
    expect(gate).toContain('SCRIPT_POLL_LIMIT_MS');
  });
});
