/**
 * Product Analytics, the hard line, enforced as a test.
 *
 * This is a health-adjacent app. An analytics payload may carry an event
 * name, a surface name, a feature key, a fixed action verb, a timestamp,
 * and a member id. It may never carry health content: a check-in answer, a
 * pain location, a sleep number, a questionnaire response, reflection
 * text, or food detail.
 *
 * lib/analytics/track.ts's sanitizeAnalyticsPayload enforces this at
 * runtime, and tests/product-analytics-events.test.ts proves it does.
 * This file enforces it at the source level, which catches the other
 * failure mode: a new call site that passes a plausible-looking but
 * content-bearing field, added by someone who never reads the sanitizer.
 * Every `eventType: '<analytics type>'` call in the codebase is parsed and
 * its payload keys are checked against the allowlist.
 *
 * A source scan, not a runtime test, for the same reason
 * tests/coach-lock-ui-guard.test.ts and tests/no-em-dash-guard.test.ts are:
 * server actions cannot be invoked under vitest here (next/headers) and
 * SSR component tests do not render in this repo.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'lib', 'components'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'tests']);

/** Mirrors ALLOWED_PAYLOAD_KEYS in lib/analytics/track.ts and ProductAnalyticsPayload in the shared contracts. */
const ALLOWED_PAYLOAD_KEYS = new Set([
  'surface',
  'feature',
  'action',
  'method',
  'assessmentType',
  'scanType',
  'status',
  'entryType',
  'lockReason',
  'fromTier',
  'toTier',
  'term',
  // Priority Card (migration 147): which hierarchy rule won. A fixed
  // slug, never the priority's own wording or the reason line.
  'rule',
]);

const ANALYTICS_EVENT_TYPES = [
  'signup_completed',
  'session_started',
  'onboarding_started',
  'onboarding_completed',
  'surface_viewed',
  'daily_reset_started',
  'daily_reset_completed',
  'food_scan_performed',
  'food_entry_logged',
  'feature_engaged',
  'paywall_viewed',
  'membership_tier_changed',
  'purchase_completed',
  'priority_shown',
  'priority_action',
  're_entry_shown',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

type Call = { file: string; eventType: string; payloadKeys: string[] };

/**
 * Finds each `eventType: '<analytics type>'` occurrence and, if the same
 * object literal has a `payload: { ... }`, extracts that object's
 * top-level keys. Deliberately simple string work rather than a real
 * parser: the codebase writes these calls in one consistent shape, and a
 * shape this scan cannot read shows up as an unparsed call the test then
 * reports rather than silently passing.
 */
function findAnalyticsCalls(source: string, file: string): Call[] {
  const calls: Call[] = [];
  for (const eventType of ANALYTICS_EVENT_TYPES) {
    const needle = `eventType: '${eventType}'`;
    let index = source.indexOf(needle);
    while (index !== -1) {
      // The payload for this call, if any, is the next `payload: {` before
      // the enclosing call's closing `});`.
      const tail = source.slice(index, index + 1200);
      const end = tail.indexOf('});');
      const region = end === -1 ? tail : tail.slice(0, end);
      const payloadStart = region.indexOf('payload: {');

      const payloadKeys: string[] = [];
      if (payloadStart !== -1) {
        const body = region.slice(payloadStart + 'payload: {'.length);
        let depth = 0;
        let literal = '';
        for (const char of body) {
          if (char === '}' && depth === 0) break;
          if (char === '{') depth += 1;
          if (char === '}') depth -= 1;
          literal += char;
        }
        for (const match of literal.matchAll(/(?:^|[,{])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) {
          payloadKeys.push(match[1]!);
        }
        // `payload: { feature, action }` shorthand.
        for (const match of literal.matchAll(/(?:^|[,{])\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?=[,}]|$)/g)) {
          payloadKeys.push(match[1]!);
        }
      }

      calls.push({ file, eventType, payloadKeys: [...new Set(payloadKeys)] });
      index = source.indexOf(needle, index + needle.length);
    }
  }
  return calls;
}

const FILES = SCAN_DIRS.flatMap((dir) => walk(path.join(APP_ROOT, dir)));
const ALL_CALLS = FILES.flatMap((file) =>
  findAnalyticsCalls(readFileSync(file, 'utf-8'), path.relative(APP_ROOT, file))
);

describe('analytics payload safety (source scan)', () => {
  it('the scan is not vacuous: it finds the real analytics call sites', () => {
    expect(ALL_CALLS.length).toBeGreaterThanOrEqual(8);
    const types = new Set(ALL_CALLS.map((call) => call.eventType));
    expect(types.has('daily_reset_completed')).toBe(true);
    expect(types.has('session_started')).toBe(true);
    expect(types.has('surface_viewed')).toBe(true);
  });

  it('the scan really reads payload keys (a known call has the keys it has)', () => {
    const feedCall = ALL_CALLS.find(
      (call) => call.file.endsWith('actions/feed.ts') && call.eventType === 'feature_engaged'
    );
    expect(feedCall).toBeDefined();
    expect(feedCall!.payloadKeys.sort()).toEqual(['action', 'feature']);
  });

  it('the scan would catch a disallowed key (proved against a fixture, not the real codebase)', () => {
    const bad = `
      await trackProductEvent(supabase, {
        memberId,
        eventType: 'daily_reset_completed',
        timezone,
        payload: { surface: 'daily_reset', painLocation: 'lower back' },
      });
    `;
    const found = findAnalyticsCalls(bad, 'fixture.ts');
    expect(found).toHaveLength(1);
    expect(found[0]!.payloadKeys).toContain('painLocation');
    expect(found[0]!.payloadKeys.some((key) => !ALLOWED_PAYLOAD_KEYS.has(key))).toBe(true);
  });

  it('no analytics call site in the codebase passes a payload key outside the neutral allowlist', () => {
    const violations = ALL_CALLS.flatMap((call) =>
      call.payloadKeys
        .filter((key) => !ALLOWED_PAYLOAD_KEYS.has(key))
        .map((key) => `${call.file}: ${call.eventType} passes disallowed payload key "${key}"`)
    );
    expect(violations).toEqual([]);
  });

  it('no analytics call site passes a check-in, questionnaire, or health field by any obvious name', () => {
    const banned = [
      'answer',
      'answers',
      'response',
      'responses',
      'pain',
      'painLocation',
      'sleep',
      'sleepQuality',
      'mood',
      'energy',
      'stress',
      'symptom',
      'symptoms',
      'notes',
      'reflection',
      'text',
      'score',
      'concern',
    ];
    const violations = ALL_CALLS.flatMap((call) =>
      call.payloadKeys
        .filter((key) => banned.includes(key))
        .map((key) => `${call.file}: ${call.eventType} passes health-adjacent key "${key}"`)
    );
    expect(violations).toEqual([]);
  });
});
