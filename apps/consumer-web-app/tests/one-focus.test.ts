/**
 * ONE FOCUS, EVERYWHERE.
 *
 * The audit counted six member surfaces naming five different focuses on
 * the morning of 2026-08-17:
 *
 *   Home, Root's Daily Brief          "TODAY'S FOCUS, Stress"
 *   Home, noticing carousel           "Today's focus: Consistency"
 *   Root Score                        "Complete today's movement session"
 *   Today                             "Take a few minutes for your Daily Reset"
 *   Movement                          "TODAY'S FOCUS, Strength & conditioning"
 *   Root Map                          "Stress & Nervous System Regulation..."
 *
 * The Priority Card decision engine is the only author now. These tests are
 * mostly source sweeps, because the property being asserted is an absence:
 * no OTHER surface may name a focus, and an absence is exactly what an
 * ordinary unit test cannot notice coming back.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { toMemberFocus } from '../lib/member-interpretation/focus';
import type { PriorityView } from '../lib/priority/types';

const ROOT = path.resolve(__dirname, '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
}

/**
 * A file's own leading doc comment necessarily names the old behaviour it
 * describes fixing, so every sweep below strips comments before scanning.
 * A comment explaining a removal must not be able to fail the check that
 * the removal happened.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * The surfaces the audit caught, plus the shared components each renders
 * through. `app/today/page.tsx` and Home both legitimately render the
 * Priority Card itself, which is the one thing allowed to name a focus.
 */
const SURFACES_THAT_MUST_NOT_AUTHOR_A_FOCUS = [
  'components/MorningBriefCard.tsx',
  'components/dashboard/RecommendationsCard.tsx',
  'components/dashboard/WhatWereNoticingCard.tsx',
  'components/RootMapCard.tsx',
  'app/root-score/page.tsx',
  'app/movement/page.tsx',
  'app/root-map/page.tsx',
  'app/recommendations/page.tsx',
  'app/noticing/page.tsx',
  'app/progress/WellnessStoryPanel.tsx',
];

describe('only the Priority Card engine names the focus', () => {
  it.each(SURFACES_THAT_MUST_NOT_AUTHOR_A_FOCUS)(
    '%s does not print a focus heading of its own',
    (file) => {
      const source = withoutComments(read(file));
      expect(source, `${file} still says "Today's Focus"`).not.toMatch(/Today&apos;s Focus/i);
      expect(source, `${file} still says "Today's focus"`).not.toMatch(/Today's focus/i);
      expect(source, `${file} still says "Prioritized Next Action"`).not.toMatch(
        /Prioritized Next Action/i
      );
      expect(source, `${file} still heads a section "Your Focus"`).not.toMatch(/>Your Focus</i);
    }
  );

  /**
   * Home is held to the stricter rule: the Priority Card is the single
   * primary action and NOTHING else on the screen may use the words focus,
   * priority, or today's anything.
   */
  it('nothing on Home outside the Priority Card uses focus, priority, or "today\'s"', () => {
    const forbidden = [/Today&apos;s Focus/i, /Today's focus/i, /Your priority/i, /Priority Today/i];
    for (const file of [
      'components/MorningBriefCard.tsx',
      'components/dashboard/RecommendationsCard.tsx',
      'components/dashboard/WhatWereNoticingCard.tsx',
      'components/dashboard/RootDiscoveryCard.tsx',
      'components/dashboard/CoachingMessageCard.tsx',
      'components/dashboard/QuickActionsGrid.tsx',
      'components/RootMapCard.tsx',
    ]) {
      const source = withoutComments(read(file));
      for (const pattern of forbidden) {
        expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  /** The Daily Brief's focus line is gone, not relabelled. */
  it('the Daily Brief no longer renders a focus line at all', () => {
    const source = withoutComments(read('components/MorningBriefCard.tsx'));
    expect(source).not.toContain('brief.focus_label');
  });

  /** Nothing persists a row that calls itself the day's focus. */
  it('no recommendation row is titled "Today\'s coaching focus"', () => {
    const source = withoutComments(read('lib/intelligence-engine/recommendations.ts'));
    expect(source).not.toMatch(/Today's coaching focus/i);
  });

  /**
   * The one-focus rule only means anything if the surfaces that DO name it
   * all read the same accessor. Each of these must render the shared
   * component, which has exactly one source.
   */
  it.each([
    'app/root-score/page.tsx',
    'app/movement/page.tsx',
    'app/root-map/page.tsx',
    'app/recommendations/page.tsx',
  ])('%s names the focus through the shared component', (file) => {
    expect(read(file)).toContain('<TodaysFocusLine');
  });

  it('the shared component has exactly one source, and it is the priority engine', () => {
    const source = read('components/focus/TodaysFocusLine.tsx');
    expect(source).toContain("from '@/lib/member-interpretation/focus'");
    expect(source).toContain('getMemberFocus');
    // No second source to fall back on when the engine has none.
    expect(source).not.toContain('focusLabel');
    expect(source).not.toContain('brainDecision');
  });

  it('the focus accessor reads the priority engine and nothing else', () => {
    const source = read('lib/member-interpretation/focus.ts');
    expect(source).toContain("from '../priority/view'");
    expect(source).not.toContain('intelligence');
    expect(source).not.toContain('scoring');
  });
});

describe('Talk to Root cannot disagree with Home', () => {
  it('the prompt is given the same focus title the screens render', () => {
    const source = read('lib/conversation-coach/prompt.ts');
    expect(source).toContain('context.focusTitle');
    expect(source).toMatch(/never invent a different one/i);
  });

  it('the prompt is given the real Root Score, and told not to guess it', () => {
    const source = read('lib/conversation-coach/prompt.ts');
    expect(source).toContain('context.rootScore');
    expect(source).toMatch(/Never say it has not calculated/i);
    expect(source).toMatch(/do not guess a number/i);
  });

  it('the context reads both from the shared sources rather than deriving them', () => {
    const source = read('lib/conversation-coach/context.ts');
    expect(source).toContain('getMemberFocus');
    expect(source).toContain('getMyRootScore');
  });

  /**
   * The Coaching Brain's area label is still in the prompt, because the
   * lesson is built from it. It must be labelled as background, never as
   * the member's focus.
   */
  it('the Coaching Brain area is explicitly not presented as the focus', () => {
    const source = read('lib/conversation-coach/prompt.ts');
    expect(source).toMatch(/it is NOT her focus/);
  });
});

describe('the focus itself', () => {
  function view(overrides: Partial<PriorityView['selected']> = {}): PriorityView {
    return {
      selected: {
        rule: 'daily_reset',
        priorityKey: null,
        title: 'Take a few minutes for your Daily Reset.',
        reason: null,
        help: 'h',
        href: '/checkin',
        actionType: 'reset',
        threadKey: 'daily_reset::-',
        approach: 0,
        evidence: {},
        ...overrides,
      },
      status: 'active',
      localDate: '2026-08-17',
      bridge: null,
      isReEntry: false,
      welcomeLine: null,
      frictionQuestion: null,
    };
  }

  it('is exactly the engine\'s title, never re-worded', () => {
    expect(toMemberFocus(view())!.title).toBe('Take a few minutes for your Daily Reset.');
  });

  it('is null rather than a substitute when the engine has none', () => {
    expect(toMemberFocus(null)).toBeNull();
  });

  it('carries the engine status, so a completed focus reads as done everywhere at once', () => {
    const done = { ...view(), status: 'done' as const };
    expect(toMemberFocus(done)!.status).toBe('done');
  });
});
