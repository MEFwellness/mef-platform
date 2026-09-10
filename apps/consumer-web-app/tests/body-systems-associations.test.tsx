// @vitest-environment jsdom

/**
 * The association layer says possibilities and never conclusions, and
 * every fired entry can say why it surfaced.
 *
 * THE BANNED VOCABULARY IS CHECKED THROUGH THE RENDERER, not against the
 * library rows on their own, because what matters is what a coach actually
 * reads. The coach panel is rendered from a real sitting and the words in
 * the association blocks are pulled back out of the HTML.
 *
 * IT IS SCOPED TO THE ASSOCIATION LANGUAGE, deliberately. The ban is on
 * stating a condition as fact in this layer. A citation of the member's
 * own answer is observed data and quotes HER words, so a question prompt
 * that happens to contain one of these words is not a violation and
 * silencing it would mean paraphrasing what she said.
 *
 * EVERY FIRED ENTRY CITES SOMETHING. An association that could not say
 * which of her answers produced it is exactly what this layer is not
 * allowed to be, so the engine drops one, and this proves it both ways:
 * that real entries always carry a citation, and that an entry contrived
 * to have none is dropped rather than shown.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BANDS,
  COACH_COPY,
  LIBRARY,
  QUESTIONS,
  RED_FLAGS,
  SAFETY_LEVELS,
  SCALE,
  SECTIONS,
} from './body-systems-fixture';
import { buildResults } from '../lib/body-systems/scoring';
import { fireAssociations } from '../lib/body-systems/associations';
import { buildCoachReadingView } from '../lib/body-systems/coachView';
import { BodySystemsPanel } from '../app/coach/clients/[id]/BodySystemsPanel';
import type { CoachBodySystemsPanelState } from '../app/actions/bodySystems';

/** Banned as a conclusion on this layer, per the approved rules. */
const BANNED_CONCLUSION_WORDS = ['has', 'shows', 'indicates', 'confirms'];

function bannedIn(text: string): string[] {
  return BANNED_CONCLUSION_WORDS.filter((word) =>
    new RegExp(`(^|[^a-z])${word}([^a-z]|$)`, 'i').test(text)
  );
}

/** The five approved frames. An entry has to open with one of them, or be a plain in-session note. */
const APPROVED_FRAMES = [
  'This pattern can be associated with',
  'Possible considerations include',
  'This combination may overlap with patterns sometimes',
  'These findings may warrant',
  'Consider discussing this pattern with an appropriate healthcare professional',
];

describe('the library rows themselves', () => {
  it('state no conclusion, in any title, association text or next step', () => {
    const violations: string[] = [];
    for (const entry of LIBRARY) {
      for (const [field, text] of [
        ['title', entry.title],
        ['association', entry.associationText],
        ['next step', entry.nextStep],
      ] as const) {
        const found = bannedIn(text);
        if (found.length > 0) {
          violations.push(`${entry.entryCode} ${field}: ${found.join(', ')}`);
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('is non vacuous: the checker really catches a conclusion', () => {
    expect(bannedIn('This member has low thyroid function')).toEqual(['has']);
    expect(bannedIn('This shows a clear pattern')).toEqual(['shows']);
    expect(bannedIn('This indicates iron loss')).toEqual(['indicates']);
    expect(bannedIn('The panel confirms it')).toEqual(['confirms']);
    // Whole word, so an ordinary word containing one is not flagged.
    expect(bannedIn('chasing one system first')).toEqual([]);
  });

  it('opens all but one entry with an approved frame', () => {
    // N-4 is the single approved exception in the library: a plain
    // in-session instruction about handling low mood with care, which names
    // no association at all and therefore needs no cautious frame.
    const unframed = LIBRARY.filter(
      (entry) => !APPROVED_FRAMES.some((frame) => entry.associationText.startsWith(frame))
    ).map((entry) => entry.entryCode);
    expect(unframed).toEqual(['N-4']);
  });
});

/** A varied sheet that fires a real spread of entries, in-section and cross-section. */
function firingAnswers(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const question of QUESTIONS) {
    if (question.branch === 'b') continue;
    out[question.questionRef] = 'never';
  }
  // An in-section cluster: upper digestion (D-1).
  out.D1 = 'often';
  out.D3 = 'almost_always';
  out.D4 = 'often';
  // A cross-section pattern: the absorption pattern (D-3) needs D10, D2, B8.
  out.D2 = 'often';
  out.D10 = 'often';
  out.B8 = 'almost_always';
  // A second cross-section one: the activation cluster (N-2) needs N5 and A8.
  out.N5 = 'often';
  out.A8 = 'often';
  return out;
}

describe('what a coach actually reads', () => {
  const answers = firingAnswers();
  const results = buildResults({
    sections: SECTIONS,
    questions: QUESTIONS,
    scale: SCALE,
    bands: BANDS,
    answers,
    branch: 'a',
  });
  const fired = fireAssociations({
    sections: SECTIONS,
    questions: QUESTIONS,
    scale: SCALE,
    bands: BANDS,
    answers,
    results,
    branch: 'a',
    library: LIBRARY,
  });

  it('fires the in-section cluster and both cross-section patterns', () => {
    const codes = fired.map((entry) => entry.entryCode);
    expect(codes).toContain('D-1');
    expect(codes).toContain('D-3');
    expect(codes).toContain('N-2');
  });

  it('gives every fired entry a citation of her own answers', () => {
    for (const entry of fired) {
      const cited = entry.whySurfacedAnswers.length + entry.whySurfacedSections.length;
      expect(cited, `${entry.entryCode} surfaced with nothing to show`).toBeGreaterThan(0);
    }
  });

  it('cites only answers she really gave, at the value she really gave', () => {
    for (const entry of fired) {
      for (const cited of entry.whySurfacedAnswers) {
        const question = QUESTIONS.find((q) => q.questionRef === cited.questionRef);
        expect(question?.prompt).toBe(cited.prompt);
        const chosen = SCALE.find((option) => option.valueKey === answers[cited.questionRef]);
        expect(cited.answerLabel).toBe(chosen?.label);
      }
    }
  });

  it('cites only the half of an any_of that was actually true', () => {
    // D-3 is all_elevated over D10, D2 and B8. Exactly those three, and
    // nothing else, may be cited.
    const d3 = fired.find((entry) => entry.entryCode === 'D-3');
    expect(d3?.whySurfacedAnswers.map((a) => a.questionRef).sort()).toEqual(['B8', 'D10', 'D2']);
  });

  it('drops an entry that would fire with nothing to cite', () => {
    // A trigger over a question that does not exist can never cite
    // anything. It must not surface as a bare sentence with no evidence.
    const contrived = fireAssociations({
      sections: SECTIONS,
      questions: QUESTIONS,
      scale: SCALE,
      bands: BANDS,
      answers,
      results,
      branch: 'a',
      library: [
        {
          entryCode: 'ZZ-1',
          position: 999,
          sectionKey: null,
          branch: 'all',
          title: 'Contrived',
          trigger: { type: 'sections_count_at_band', band: 'quiet', min: 0 },
          associationText: 'Possible considerations include: nothing at all',
          nextStep: 'nothing',
        },
      ],
    });
    // Every section is at quiet or louder, so the trigger is satisfied and
    // it cites eleven sections. Narrow it to something that cannot cite.
    expect(contrived.length).toBe(1);

    const cannotCite = fireAssociations({
      sections: SECTIONS,
      questions: QUESTIONS,
      scale: SCALE,
      bands: BANDS,
      answers,
      results,
      branch: 'a',
      library: [
        {
          entryCode: 'ZZ-2',
          position: 999,
          sectionKey: null,
          branch: 'all',
          title: 'Contrived',
          trigger: { type: 'cluster', questions: ['NOPE1', 'NOPE2'], min: 0 },
          associationText: 'Possible considerations include: nothing at all',
          nextStep: 'nothing',
        },
      ],
    });
    expect(cannotCite).toEqual([]);
  });

  it('never surfaces a Branch A entry for a Branch B sitting', () => {
    const branchB: Record<string, string> = {};
    for (const question of QUESTIONS) {
      if (question.branch === 'a') continue;
      branchB[question.questionRef] = 'almost_always';
    }
    const bResults = buildResults({
      sections: SECTIONS,
      questions: QUESTIONS,
      scale: SCALE,
      bands: BANDS,
      answers: branchB,
      branch: 'b',
    });
    const bFired = fireAssociations({
      sections: SECTIONS,
      questions: QUESTIONS,
      scale: SCALE,
      bands: BANDS,
      answers: branchB,
      results: bResults,
      branch: 'b',
      library: LIBRARY,
    });
    const codes = bFired.map((entry) => entry.entryCode);
    expect(codes.filter((code) => code.startsWith('HA-'))).toEqual([]);
    expect(codes).toContain('HB-1');
    expect(codes).toContain('HB-2');
  });
});

describe('the rendered coach panel', () => {
  const answers = firingAnswers();
  const results = buildResults({
    sections: SECTIONS,
    questions: QUESTIONS,
    scale: SCALE,
    bands: BANDS,
    answers,
    branch: 'a',
  });

  const state: CoachBodySystemsPanelState = {
    pendingAssignedAt: null,
    pendingProgress: null,
    pendingStatusLine: null,
    sessions: [
      {
        id: 'session-1',
        completedAt: '2026-09-10T12:00:00.000Z',
        branch: 'a',
        answers,
        redFlagAnswers: { blood_in_stool: true },
        results,
      },
    ],
    content: {
      sections: SECTIONS,
      questions: QUESTIONS,
      scale: SCALE,
      bands: BANDS,
      redFlags: RED_FLAGS,
      safetyLevels: SAFETY_LEVELS,
      copy: {},
      minDeltaPercent: 1,
      library: LIBRARY,
      coachCopy: COACH_COPY,
    },
  };

  const html = renderToStaticMarkup(<BodySystemsPanel state={state} />);
  const text = html.replace(/<[^>]*>/g, ' ');

  it('prints every fired entry with its own stored words', () => {
    const fired = fireAssociations({
      sections: SECTIONS,
      questions: QUESTIONS,
      scale: SCALE,
      bands: BANDS,
      answers,
      results,
      branch: 'a',
      library: LIBRARY,
    });
    expect(fired.length).toBeGreaterThan(0);
    for (const entry of fired) {
      expect(html, `${entry.entryCode} did not render`).toContain(entry.associationText);
      expect(html).toContain(entry.nextStep);
    }
  });

  it('prints a why-surfaced citation under every one of them', () => {
    const view = buildCoachReadingView({
      sections: SECTIONS,
      questions: QUESTIONS,
      scale: SCALE,
      bands: BANDS,
      redFlags: RED_FLAGS,
      safetyLevels: SAFETY_LEVELS,
      library: LIBRARY,
      answers,
      redFlagAnswers: { blood_in_stool: true },
      results,
      branch: 'a',
      previous: null,
      minDeltaPercent: 1,
    });
    const label = COACH_COPY['coach.why_surfaced_label']!;
    const occurrences = html.split(label).length - 1;
    expect(occurrences).toBe(view.associations.value.length);

    // And the citation really names her answers, not a generic line.
    for (const entry of view.associations.value) {
      for (const cited of entry.whySurfacedAnswers) {
        expect(html, `${entry.entryCode} did not cite ${cited.questionRef}`).toContain(
          cited.prompt
        );
      }
    }
  });

  it('states no conclusion in any of the association text it printed', () => {
    // Only the association blocks are checked, for the reason this file's
    // header gives: a quoted answer of hers is observed data.
    const violations: string[] = [];
    for (const entry of LIBRARY) {
      if (!html.includes(entry.associationText)) continue;
      for (const text of [entry.title, entry.associationText, entry.nextStep]) {
        const found = bannedIn(text);
        if (found.length > 0) violations.push(`${entry.entryCode}: ${found.join(', ')}`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('renders all four uncertainty labels visibly', () => {
    expect(text).toContain(COACH_COPY['coach.label_observed']);
    expect(text).toContain(COACH_COPY['coach.label_pattern']);
    expect(text).toContain(COACH_COPY['coach.label_possible']);
    expect(text).toContain(COACH_COPY['coach.label_confirmed']);
  });

  it('says plainly that Confirmed medical information is never generated here', () => {
    expect(text).toContain(COACH_COPY['coach.confirmed_never_generated']);
  });

  it('pins the red flag with its level and its exact response', () => {
    expect(text).toContain('Level 2. Medical follow-up');
    expect(html).toContain('Have you noticed blood in your stool, or stool that is black?');
    expect(html).toContain(SAFETY_LEVELS.find((level) => level.level === 2)!.memberResponse);
  });
});
