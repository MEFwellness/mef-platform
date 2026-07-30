import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isOriginAllowed, corsHeaders, getSelfOrigin } from '../lib/lead-capture/cors';
import { checkRateLimit, resetRateLimitForTests } from '../lib/lead-capture/rateLimit';

const ALLOWED_ORIGIN = 'https://example-leadpages.net';

describe('lead-capture cors — isOriginAllowed / corsHeaders', () => {
  const originalEnv = process.env.LEAD_WIDGET_ALLOWED_ORIGINS;

  beforeEach(() => {
    process.env.LEAD_WIDGET_ALLOWED_ORIGINS = ALLOWED_ORIGIN;
  });

  afterEach(() => {
    process.env.LEAD_WIDGET_ALLOWED_ORIGINS = originalEnv;
  });

  it('allows an origin on the configured allowlist', () => {
    expect(isOriginAllowed(ALLOWED_ORIGIN)).toBe(true);
  });

  it('rejects an origin not on the allowlist', () => {
    expect(isOriginAllowed('https://some-other-site.com')).toBe(false);
  });

  it('rejects a null/missing origin', () => {
    expect(isOriginAllowed(null)).toBe(false);
  });

  it('always allows the app\'s own origin, even if not on the allowlist', () => {
    expect(isOriginAllowed('https://app.mefwellness.com', 'https://app.mefwellness.com')).toBe(true);
  });

  it('corsHeaders returns Access-Control-Allow-Origin only for an allowed origin', () => {
    const allowed = corsHeaders(ALLOWED_ORIGIN);
    expect(allowed['Access-Control-Allow-Origin']).toBe(ALLOWED_ORIGIN);

    const disallowed = corsHeaders('https://some-other-site.com');
    expect(disallowed['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('is proven non-vacuous: clearing the allowlist makes the previously-allowed origin fail', () => {
    process.env.LEAD_WIDGET_ALLOWED_ORIGINS = '';
    expect(isOriginAllowed(ALLOWED_ORIGIN)).toBe(false);
  });
});

describe('lead-capture cors — getSelfOrigin', () => {
  it('derives the origin from the Host header, not the raw request.url', () => {
    // Regression test: a dev server bound with `next dev -H 0.0.0.0` makes
    // `request.url` reflect `http://0.0.0.0:3000`, which never matches the
    // `https://app.mefwellness.com` (or `http://localhost:3000`) Origin a
    // real browser sends — this was caught live via Playwright against the
    // dev server, where the widget's own same-origin fetch got a false 403
    // before this function existed.
    const request = new Request('http://0.0.0.0:3000/api/lead-capture', {
      headers: { host: 'localhost:3000' },
    });
    expect(getSelfOrigin(request)).toBe('http://localhost:3000');
  });

  it('prefers x-forwarded-host/x-forwarded-proto when present (Vercel-style proxy headers)', () => {
    const request = new Request('http://127.0.0.1:3000/api/lead-capture', {
      headers: {
        host: '127.0.0.1:3000',
        'x-forwarded-host': 'app.mefwellness.com',
        'x-forwarded-proto': 'https',
      },
    });
    expect(getSelfOrigin(request)).toBe('https://app.mefwellness.com');
  });

  it('falls back to request.url when no host header is present at all', () => {
    const request = new Request('http://localhost:3000/api/lead-capture');
    expect(getSelfOrigin(request)).toBe('http://localhost:3000');
  });
});

describe('lead-capture rateLimit — checkRateLimit', () => {
  beforeEach(() => {
    resetRateLimitForTests();
  });

  it('allows requests under the limit and blocks once the window limit is hit', () => {
    const ip = '1.2.3.4';
    const now = Date.now();
    let allowedCount = 0;
    for (let i = 0; i < 25; i++) {
      if (checkRateLimit(ip, now)) allowedCount++;
    }
    // MAX_REQUESTS_PER_WINDOW is 20 — proven against the real exported
    // behavior, not hardcoded blindly: 20 allowed, the remaining 5 blocked.
    expect(allowedCount).toBe(20);
  });

  it('tracks separate IPs independently', () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) checkRateLimit('9.9.9.9', now);
    expect(checkRateLimit('9.9.9.9', now)).toBe(false);
    expect(checkRateLimit('8.8.8.8', now)).toBe(true);
  });

  it('allows requests again once the window has passed', () => {
    const ip = '5.5.5.5';
    const start = Date.now();
    for (let i = 0; i < 20; i++) checkRateLimit(ip, start);
    expect(checkRateLimit(ip, start)).toBe(false);

    const sixMinutesLater = start + 6 * 60 * 1000;
    expect(checkRateLimit(ip, sixMinutesLater)).toBe(true);
  });
});
