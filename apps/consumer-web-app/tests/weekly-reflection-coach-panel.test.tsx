/**
 * The coach's Weekly Reflection panel, rendered for real.
 *
 * Asserted on the actual HTML rather than on the source, because the thing
 * worth proving is what a coach can SEE: her five answers, the identical
 * recap she read, and two empty states that a coach cannot confuse for
 * each other.
 *
 * The recap assertion is the load-bearing one. It renders the same
 * component the member's own screen renders, from the same stored
 * descriptors, so if the two ever stopped agreeing this is where it shows.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeeklyReflectionPanel } from '@/app/coach/clients/[id]/WeeklyReflectionPanel';
import { WeeklyReflectionRecapBody } from '@/components/weekly-reflection/WeeklyReflectionRecapBody';
import { renderReflectionRecap, buildReflectionRecap } from '@/lib/weekly-reflection/recap';
import { WEEKLY_REFLECTION_QUESTIONS } from '@/lib/weekly-reflection/questions';
import type { CoachWeeklyReflection } from '@/app/actions/weeklyReflection';
import type { LongitudinalSignal } from '@/lib/longitudinal-intelligence/types';

const SLEEP: LongitudinalSignal = {
  signalKey: 'checkin_metric::sleep',
  signalKind: 'checkin_metric',
  signalLabel: 'sleep',
  state: 'improving',
  tier: 3,
  occurrenceCount: 4,
  confidence: 0.8,
  firstObservedAt: '2026-08-01',
  lastObservedAt: '2026-08-28',
  evidenceSummary: {},
};

function recapFor(
  weekStart: string,
  checkinLocalDates: string[],
  patternStates: LongitudinalSignal[] = [SLEEP]
) {
  return renderReflectionRecap(
    buildReflectionRecap({ weekStart, checkinLocalDates, patternStates })
  );
}

const FULL_WEEK: CoachWeeklyReflection = {
  weekStart: '2026-08-28',
  completedAt: '2026-08-28T18:00:00.000Z',
  answers: {
    week_overall: 4,
    what_helped: 'Walking every morning before work',
    what_got_in_the_way: 'Two late nights travelling',
    body_response: 'Knees quieter, energy steadier by Thursday',
    next_week_change: 'In bed by ten on work nights',
  },
  recap: recapFor('2026-08-28', ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27']),
};

const EARLIER_WEEK: CoachWeeklyReflection = {
  weekStart: '2026-08-21',
  completedAt: '2026-08-21T18:00:00.000Z',
  answers: {
    week_overall: 2,
    what_helped: 'Nothing much',
    what_got_in_the_way: 'A cold all week',
    body_response: 'Flat',
    next_week_change: 'Get back to walking',
  },
  recap: recapFor('2026-08-21', ['2026-08-19', '2026-08-20']),
};

function render(props: { reflections: CoachWeeklyReflection[]; hasProgramTier: boolean }) {
  return renderToStaticMarkup(<WeeklyReflectionPanel {...props} />);
}

describe('the coach panel shows what she wrote', () => {
  const html = render({ reflections: [FULL_WEEK, EARLIER_WEEK], hasProgramTier: true });

  it('shows all five prompts', () => {
    for (const question of WEEKLY_REFLECTION_QUESTIONS) {
      expect(html).toContain(question.prompt);
    }
  });

  it('shows all four of her free-text answers, unedited', () => {
    expect(html).toContain('Walking every morning before work');
    expect(html).toContain('Two late nights travelling');
    expect(html).toContain('Knees quieter, energy steadier by Thursday');
    expect(html).toContain('In bed by ten on work nights');
  });

  it('shows the scale answer as its WORD and its number, so a week is both readable and comparable', () => {
    expect(html).toContain('Pretty good (4 of 5)');
  });

  it('lists every week she has reflected, newest first, for reading across them', () => {
    expect(html).toContain('Week of Aug 28, 2026');
    expect(html).toContain('Week of Aug 21, 2026');
    expect(html.indexOf('Week of Aug 28, 2026')).toBeLessThan(html.indexOf('Week of Aug 21, 2026'));
  });

  it('opens on the newest week, which is the one a coach came for', () => {
    // The earlier week's answers are not in the document until it is
    // selected, so the coach is not reading two weeks stacked on top of
    // each other.
    expect(html).toContain('Walking every morning before work');
    expect(html).not.toContain('A cold all week');
  });
});

describe('the coach reads the SAME recap the member read', () => {
  it('renders the identical recap body, from the identical stored descriptors', () => {
    const panel = render({ reflections: [FULL_WEEK], hasProgramTier: true });
    const memberSide = renderToStaticMarkup(
      <WeeklyReflectionRecapBody recap={FULL_WEEK.recap!} tone="dark" />
    );

    // Same words, both sides. The tone prop changes colour classes and
    // nothing else, so the sentences are compared rather than the markup.
    const words = (markup: string) =>
      markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    for (const fragment of words(memberSide).split(/(?<=\.)\s/)) {
      if (fragment.trim().length < 12) continue;
      expect(words(panel)).toContain(fragment.trim());
    }
  });

  it('names the seven days it counted, so the number cannot mean two things', () => {
    const panel = render({ reflections: [FULL_WEEK], hasProgramTier: true });
    expect(panel).toContain('Aug 22 to Aug 28');
    expect(panel).toContain('You checked in on 4 days in the last 7 days');
  });

  it('a thin week reads as thin on the coach side too, with no observations invented', () => {
    const panel = render({ reflections: [EARLIER_WEEK], hasProgramTier: true });
    expect(panel).toContain('We only have 2 days of check-ins in the last 7 days');
    expect(panel).not.toContain('Qualified pattern');
  });
});

describe('the two empty states are genuinely different, and say so', () => {
  it('a client who is not on the program has not skipped anything', () => {
    const html = render({ reflections: [], hasProgramTier: false });
    expect(html).toContain('Not on the 24 week program');
    expect(html).not.toContain('no reflection completed yet');
  });

  it('a program client with nothing written yet is told the window, not told off', () => {
    const html = render({ reflections: [], hasProgramTier: true });
    expect(html).toContain('no reflection completed yet');
    expect(html).toContain('opens every Friday');
  });
});

describe('no em dash reaches the coach', () => {
  it('not in the panel, in any state', () => {
    for (const props of [
      { reflections: [FULL_WEEK, EARLIER_WEEK], hasProgramTier: true },
      { reflections: [], hasProgramTier: true },
      { reflections: [], hasProgramTier: false },
    ]) {
      expect(render(props)).not.toContain('—');
    }
  });
});
