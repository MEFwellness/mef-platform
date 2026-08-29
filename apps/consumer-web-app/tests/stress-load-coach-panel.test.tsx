/**
 * The coach's Stress & Load Deep-Dive card, rendered for real.
 *
 * Asserted on the actual HTML rather than on the source, because the thing
 * worth proving is what a coach can SEE when they open a client an hour
 * before a session:
 *
 *   the sentence the session opens on, at the top, in her own words
 *   the pattern name, and the two sides, separately
 *   what already restores her and who she can lean on, named
 *   her eleven answers, grouped under the three screen headings
 *
 * The reading assertion is the load-bearing one. This panel renders the
 * same component the member's own screen renders, from the same stored
 * descriptors, so if the two ever stopped agreeing this is where it shows.
 *
 * The three states are asserted as three different sentences, because a
 * coach reading "not assigned" about a client who is halfway through one
 * would draw the wrong conclusion.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const { StressLoadPanel } = await import('@/app/coach/clients/[id]/StressLoadPanel');
const { StressLoadReadingBody } = await import(
  '@/components/stress-load/StressLoadReadingBody'
);
const { buildStressLoadReading } = await import('@/lib/stress-load/patterns');
const { STRESS_LOAD_QUESTIONS } = await import('@/lib/stress-load/questions');
const { fullAnswers } = await import('./stress-load-questions.test');

const ANSWERS = fullAnswers({
  load_weight: 5,
  load_sources: { selected: ['work', 'money', 'health'], otherText: null },
  load_follows_home: 'money',
  load_would_drop: 'The Thursday board call I never wanted.',
  body_signals: { selected: ['sleep', 'energy'], otherText: null },
  recovery_amount: 'none',
  recovery_sources: { selected: ['music', 'outside'], otherText: null },
  lean_on: { selected: ['partner', 'friend'], otherText: null },
});

const INTERPRETATION = { ...buildStressLoadReading(ANSWERS), crossReference: null };

function panel(state: Parameters<typeof StressLoadPanel>[0]['state']) {
  return renderToStaticMarkup(<StressLoadPanel clientId="client-1" state={state} />);
}

const COMPLETED = {
  pendingAssignedAt: null,
  sessions: [
    {
      id: 'session-1',
      completedAt: '2026-08-29T10:04:00.000Z',
      answers: ANSWERS,
      interpretation: INTERPRETATION,
    },
  ],
};

describe('the three states, said as three different things', () => {
  it('not assigned: the button, and a sentence saying nothing is offered yet', () => {
    const html = panel({ pendingAssignedAt: null, sessions: [] });
    expect(html).toContain('Assign Stress &amp; Load Deep-Dive');
    expect(html).toContain('Not assigned.');
    expect(html).not.toContain('not completed yet');
  });

  it('assigned and waiting: the date it was sent, and no button', () => {
    const html = panel({ pendingAssignedAt: '2026-08-27T09:00:00.000Z', sessions: [] });
    expect(html).toContain('not completed yet');
    expect(html).toContain('Aug 27, 2026');
    expect(html).not.toContain('Assign Stress &amp; Load Deep-Dive');
  });

  it('finished, with no assignment open: the button comes back, and says a fresh sitting is a fresh sitting', () => {
    const html = panel(COMPLETED);
    expect(html).toContain('Assign Stress &amp; Load Deep-Dive');
    expect(html).toContain('starts a fresh sitting and keeps everything below');
  });
});

describe('a finished sitting, as the coach reads it', () => {
  const html = panel(COMPLETED);

  it('opens on what she would drop tomorrow, in her own words', () => {
    expect(html).toContain('What they would drop tomorrow');
    expect(html).toContain('The Thursday board call I never wanted.');

    // And it really is at the top: it comes before the pattern name, and
    // before her answer list.
    expect(html.indexOf('What they would drop tomorrow')).toBeLessThan(
      html.indexOf('Heavy Load, Thin Recovery')
    );
    expect(html.indexOf('What they would drop tomorrow')).toBeLessThan(
      html.indexOf('In their own words')
    );
  });

  it('shows the pattern name and the two sides, separately', () => {
    expect(html).toContain('Heavy Load, Thin Recovery');
    expect(html).toContain('The load side');
    expect(html).toContain('The recovery side');
    // Two band labels, two different values.
    expect(html).toContain('>High<');
    expect(html).toContain('>Thin<');
  });

  it('renders the identical reading component the member read, from the identical descriptors', () => {
    const memberHtml = renderToStaticMarkup(
      <StressLoadReadingBody interpretation={INTERPRETATION} answers={ANSWERS} tone="light" />
    );
    expect(html).toContain(memberHtml);
  });

  it('names what to protect: her recovery sources and who she can lean on', () => {
    expect(html).toContain('What restores them');
    expect(html).toContain('Music and Being outside');
    expect(html).toContain('Who they can lean on');
    expect(html).toContain('Partner and A friend');
  });

  it('groups her answers under the three screen headings', () => {
    expect(html).toContain('In their own words');
    expect(html).toContain('The Load');
    expect(html).toContain('The Body&#x27;s Answer');
    expect(html).toContain('The Recovery Side');
  });

  it('shows every one of the eleven questions with an answer under it', () => {
    for (const question of STRESS_LOAD_QUESTIONS) {
      expect(html, question.key).toContain(escapeHtml(question.prompt));
    }
    expect(html).toContain('Crushing (5 of 5)');
    expect(html).toContain('Money');
  });

  it('carries no em dash anywhere a coach can read', () => {
    expect(html).not.toContain('—');
  });
});

describe('a sitting whose stored answers cannot be read', () => {
  it('says so rather than rendering half a card', () => {
    const html = panel({
      pendingAssignedAt: null,
      sessions: [
        { id: 'session-1', completedAt: '2026-08-29T10:04:00.000Z', answers: null, interpretation: null },
      ],
    });
    expect(html).toContain('could not be read');
    expect(html).not.toContain('What they would drop tomorrow');
  });
});

/** React escapes these on the way into the markup, so a prompt with an apostrophe still matches. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
