/**
 * What a coach reads, and what a member reads at the end.
 *
 * TWO CLAIMS, BOTH OF WHICH THE BRIEF MADE EXPLICIT.
 *
 *   Every line on either surface is something she actually answered. A fact
 *     she did not give produces no line at all rather than a line saying
 *     "none", and there are exactly two deliberate exceptions, both named
 *     and both tested.
 *   What the member reported and what a coach might ask are different
 *     objects, so a prompt can never be mistaken for a fact she gave.
 */

import { describe, it, expect } from 'vitest';
import { buildHealthContextView, followUpLine } from '@/lib/health-intake/coachView';
import { buildExploringPrompts, FORBIDDEN_CAUSATION_WORDS } from '@/lib/health-intake/exploring';
import { buildMemberSummary } from '@/lib/health-intake/memberSummary';
import { HLI_COPY } from '@/lib/health-intake/copy';
import { healthContextDigest } from '@/lib/coach-detail/digests';
import type { IntakeAnswers } from '@/lib/health-intake/types';

/** The density target the brief printed, as a real set of answers. */
const EBONY: IntakeAnswers = {
  full_name: 'Ebony',
  date_of_birth: '1986-04-02',
  occupation: 'Nurse',
  primary_concerns: ['sleep', 'energy', 'stress'],
  concern_onset: 'three_to_six',
  stress_level: 8,
  stress_sources: ['work', 'family', 'sleep'],
  night_waking: 'yes',
  night_waking_time: '03:00',
  best_period: 'morning',
  worst_period: 'afternoon',
  movement_areas: ['reaching'],
  movement_impact: { reaching: 'moderately' },
  history_gate: 'yes',
  history_events: [
    {
      event_year: '2019',
      event_type: 'surgery',
      event_what: 'Right knee surgery',
      event_status: 'Recovered, occasional discomfort',
    },
  ],
  medications_gate: 'yes',
  medications: [
    { medication_name: 'Levothyroxine', medication_reason: 'Thyroid' },
    { medication_name: 'Sertraline' },
  ],
  tried: ['diet', 'exercise'],
  tried_helped: 'Walking in the morning',
};

function row(view: ReturnType<typeof buildHealthContextView>, label: string): string | undefined {
  return view.rows.find((entry) => entry.label === label)?.value;
}

describe('the coach block reads at the density the brief asked for', () => {
  const view = buildHealthContextView(EBONY);

  it('names her concerns, her load, her rhythm, her movement and her history', () => {
    expect(row(view, 'Primary concerns')).toBe('Sleep · Energy · Stress');
    expect(row(view, 'Stress')).toBe('8/10, Work · Family · Sleep');
    expect(row(view, 'Sleep rhythm')).toContain('Wakes around 03:00');
    expect(row(view, 'Sleep rhythm')).toContain('Lowest: afternoon');
    expect(row(view, 'Movement')).toBe('Reaching, moderately');
    expect(row(view, 'History')).toBe('Right knee surgery, 2019');
    expect(row(view, 'Reported')).toContain('2 medications');
    expect(row(view, 'Already tried')).toBe('Diet changes · Exercise or training');
  });

  it('lists the detail under its own named groups', () => {
    const medications = view.groups.find((group) => group.label === 'Prescription medications');
    expect(medications?.items).toEqual(['Levothyroxine, Thyroid', 'Sertraline']);
    const events = view.groups.find(
      (group) => group.label === 'Surgeries, injuries and hospital stays'
    );
    expect(events?.items).toEqual(['2019, Right knee surgery, Recovered, occasional discomfort']);
  });

  it('prints what she wrote, verbatim, under its own label', () => {
    expect(view.notes).toContainEqual({
      label: 'What seemed to help',
      text: 'Walking in the morning',
    });
  });

  it('says the follow-up line even when there is nothing to follow up', () => {
    expect(followUpLine(view.safetySignals)).toBe('No immediate safety flag');
  });
});

describe('a fact she did not give produces no line', () => {
  it('draws almost nothing for an almost empty sitting', () => {
    const view = buildHealthContextView({ primary_concerns: ['energy'] });
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]!.label).toBe('Primary concerns');
    expect(view.groups).toHaveLength(0);
    expect(view.notes).toHaveLength(0);
    expect(view.exploring).toHaveLength(0);
  });

  it('never prints an empty state as if it were an answer', () => {
    const view = buildHealthContextView({});
    for (const entry of view.rows) {
      expect(entry.value.length).toBeGreaterThan(0);
      expect(entry.value.toLowerCase()).not.toBe('none');
    }
  });

  it('says nothing about weight when she preferred not to answer', () => {
    expect(row(buildHealthContextView({ weight_change: 'prefer_not' }), 'Weight')).toBeUndefined();
  });
});

describe('questions worth exploring', () => {
  it('fires only when both of the things it names genuinely exist', () => {
    // Half the pair is not the pair.
    expect(buildExploringPrompts({ stress_level: 8 })).toHaveLength(0);
    expect(buildExploringPrompts({ night_waking: 'yes' })).toHaveLength(0);
    const prompts = buildExploringPrompts({ stress_level: 8, night_waking: 'yes' });
    expect(prompts.map((prompt) => prompt.key)).toContain('stress_and_night_waking');
  });

  it('does not fire the stress pairs below the named threshold', () => {
    expect(buildExploringPrompts({ stress_level: 6, night_waking: 'yes' })).toHaveLength(0);
    expect(buildExploringPrompts({ stress_level: 7, night_waking: 'yes' })).toHaveLength(1);
  });

  it('holds between five and eight rules, all of them reachable', () => {
    const everything: IntakeAnswers = {
      ...EBONY,
      symptoms: ['fatigue', 'constipation', 'sleep_difficulty'],
      tried: ['diet', 'exercise', 'sleep_changes'],
      stress_sources: ['work', 'family', 'sleep', 'caregiving'],
      weight_change: 'gained',
      weight_intentional: 'no',
      primary_concerns: ['sleep', 'energy', 'stress', 'digestion'],
    };
    const prompts = buildExploringPrompts(everything);
    expect(prompts.length).toBeGreaterThanOrEqual(5);
    expect(prompts.length).toBeLessThanOrEqual(8);
    expect(new Set(prompts.map((prompt) => prompt.key)).size).toBe(prompts.length);
  });

  it('separates what she reported from the question, in every prompt', () => {
    const prompts = buildExploringPrompts(EBONY);
    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      expect(prompt.reported.length).toBeGreaterThan(0);
      expect(prompt.question).toContain('were both reported.');
      expect(prompt.question).toContain('Consider exploring');
    }
  });

  it('never says one thing caused another, and never names a condition', () => {
    const everything: IntakeAnswers = {
      ...EBONY,
      symptoms: ['fatigue', 'constipation', 'sleep_difficulty'],
      tried: ['sleep_changes'],
      stress_sources: ['caregiving'],
      weight_change: 'fluctuating',
    };
    for (const prompt of buildExploringPrompts(everything)) {
      const text = `${prompt.question} ${prompt.reported.join(' ')}`.toLowerCase();
      for (const word of FORBIDDEN_CAUSATION_WORDS) {
        expect(text, `"${prompt.question}" contains "${word}"`).not.toContain(word);
      }
    }
  });

  it('prints her own reported facts in the reported half', () => {
    const prompts = buildExploringPrompts(EBONY);
    const sleep = prompts.find((prompt) => prompt.key === 'stress_and_night_waking')!;
    expect(sleep.reported).toContain('Stress load 8 out of 10');
    expect(sleep.reported.join(' ')).toContain('03:00');
  });
});

describe('the three cards she reads at the end', () => {
  it('is built only from real answers, and drops a card with nothing in it', () => {
    const summary = buildMemberSummary({ primary_concerns: ['energy'] }, { safetyTriggered: false });
    const titles = summary.cards.map((card) => card.title);
    expect(titles).toContain(HLI_COPY.completionCardOneTitle);
    // She reported nothing else, so the second card is not drawn at all.
    expect(titles).not.toContain(HLI_COPY.completionCardTwoTitle);
    expect(titles).toContain(HLI_COPY.completionCardThreeTitle);
  });

  it('prints her own concerns, including the one she typed herself', () => {
    const summary = buildMemberSummary(
      {
        primary_concerns: ['energy', 'concern_other'],
        primary_concerns_other: 'Ringing in my ears',
      },
      { safetyTriggered: false }
    );
    expect(summary.cards[0]!.lines).toEqual(['Energy', 'Ringing in my ears']);
  });

  it('prints the things she told us about, and only those', () => {
    const summary = buildMemberSummary(EBONY, { safetyTriggered: false });
    const areas = summary.cards.find((card) => card.title === HLI_COPY.completionCardTwoTitle)!;
    expect(areas.lines).toContain('Stress load 8 out of 10');
    expect(areas.lines).toContain('2019, Right knee surgery');
    expect(areas.lines).toContain('Hardest part of your day: afternoon');
    expect(areas.lines).toContain('Harder than it was: Reaching');
    expect(areas.lines.join(' ')).not.toContain('Digestion');
  });

  it('always ends on what happens next, and says nothing it cannot keep', () => {
    const summary = buildMemberSummary({}, { safetyTriggered: false });
    const last = summary.cards[summary.cards.length - 1]!;
    expect(last.title).toBe(HLI_COPY.completionCardThreeTitle);
    expect(last.lines).toEqual([HLI_COPY.completionCardThreeBody]);
    expect(last.lines[0]!.toLowerCase()).not.toContain('will reply');
    expect(last.lines[0]!.toLowerCase()).not.toContain('within');
  });

  it('carries no score, no band and no colour', () => {
    const printed = JSON.stringify(buildMemberSummary(EBONY, { safetyTriggered: true }));
    expect(printed.toLowerCase()).not.toContain('score');
    expect(printed.toLowerCase()).not.toContain('band');
    expect(printed).not.toContain('#');
  });
});

describe('the folded header says what the card says', () => {
  it('goes gold only when a rule fired', () => {
    expect(
      healthContextDigest({ completed: 1, waiting: false, safetySignals: 1, exploringPrompts: 2 })
        .dot
    ).toBe('gold');
    expect(
      healthContextDigest({ completed: 1, waiting: false, safetySignals: 0, exploringPrompts: 2 })
        .dot
    ).toBe('green');
  });

  it('is grey and honest before anything has been sent', () => {
    const digest = healthContextDigest({
      completed: 0,
      waiting: false,
      safetySignals: 0,
      exploringPrompts: 0,
    });
    expect(digest.dot).toBe('grey');
    expect(digest.text).toBe('Not sent yet');
  });

  it('names a waiting one without going gold, because it is asking her and not the coach', () => {
    const digest = healthContextDigest({
      completed: 0,
      waiting: true,
      safetySignals: 0,
      exploringPrompts: 0,
    });
    expect(digest.dot).toBe('green');
    expect(digest.text).toBe('one waiting');
  });
});
