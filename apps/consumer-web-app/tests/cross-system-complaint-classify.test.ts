/**
 * AUTOMATIC COMPLAINT UNDERSTANDING, driven over the SHIPPED lexicon.
 *
 * Every case below hands the real matcher the real rows migrations 247 and
 * 249 put into production, so a passing test says a member writing this
 * sentence really is understood by what is deployed, not that an algorithm
 * works against six invented phrases.
 *
 * THE SAFEGUARD IS TESTED AS A SHAPE, NOT AS A STRING SEARCH. The
 * classifier's output type has no field that could hold a cause, so the
 * proof that it cannot diagnose is that there is nowhere for a diagnosis to
 * go, and the test asserts exactly that over every key it ever produces.
 */

import { describe, expect, it } from 'vitest';
import {
  CLASSIFIER_REVISION,
  classifyComplaint,
  normalizeComplaintText,
  orderPhrases,
} from '@/lib/cross-system-complaints/classify';
import { signalDraftsFor } from '@/lib/cross-system-complaints/data';
import type { SignalLibrary } from '@/lib/cross-system-signals/types';
import { shippedLexicon } from './cross-system-complaint-fixture';

const LEXICON = shippedLexicon();

function slugs(text: string): string[] {
  return classifyComplaint(text, LEXICON).map((draft) => draft.signalSlug);
}

function draftFor(text: string, slug: string) {
  return classifyComplaint(text, LEXICON).find((draft) => draft.signalSlug === slug);
}

describe('the fixture really is the shipped vocabulary', () => {
  it('holds the whole lexicon, not a sample of it', () => {
    expect(LEXICON.phrases.length).toBeGreaterThan(300);
    expect(LEXICON.modifiers.length).toBeGreaterThan(100);
  });

  it('applies migration 249s deletes, so no phrase exists in two states at once', () => {
    const negations = LEXICON.modifiers.filter((m) => m.kind === 'negation').map((m) => m.phrase);
    const trailing = LEXICON.modifiers
      .filter((m) => m.kind === 'negation_after')
      .map((m) => m.phrase);
    expect(trailing).toContain('stopped');
    expect(negations).not.toContain('stopped');
  });

  it('points every phrase at a slug, never at a free-form name', () => {
    for (const phrase of LEXICON.phrases) {
      expect(phrase.signalSlug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

// ---------------------------------------------------------------------
// 1 to 9. Each kind of complaint the brief names is recognized.
// ---------------------------------------------------------------------

describe('a free-text complaint becomes structured signals', () => {
  it('1. a hip complaint becomes hip clicking and hip aching, both at the hip', () => {
    const drafts = classifyComplaint(
      'My right hip has been clicking and aching when I walk.',
      LEXICON
    );
    const found = drafts.map((draft) => draft.signalSlug);
    expect(found).toContain('hip-clicking');
    expect(found).toContain('joint-aching');
    for (const draft of drafts) expect(draft.bodyAreaKey).toBe('hip');
  });

  it('2. a skin complaint is recognized, alongside the digestive one beside it', () => {
    const found = slugs(
      'My skin has been breaking out and I have been really bloated after meals.'
    );
    expect(found).toContain('skin-breakouts');
    expect(found.some((slug) => slug.includes('bloat'))).toBe(true);
  });

  it('3. a sleep complaint is recognized', () => {
    expect(slugs("I haven't been sleeping well.")).toContain('lighter-or-broken-sleep');
    expect(slugs('I feel exhausted when I wake up.')).toContain(
      'waking-tired-after-full-sleep'
    );
  });

  it('4. a stress complaint is recognized', () => {
    expect(slugs("I've been really stressed lately.")).toContain('feeling-tense');
  });

  it('5. a mood complaint is recognized', () => {
    expect(slugs('My mood has been all over the place.')).toContain(
      'mood-shifts-through-the-month'
    );
    expect(slugs('I have been really irritable.')).toContain('flatter-or-more-irritable-mood');
  });

  it('6. a digestive complaint is recognized', () => {
    expect(slugs('My stomach gets bloated after meals.').join(' ')).toMatch(/bloat/);
    expect(slugs('I have been so constipated.')).toContain('constipation');
  });

  it('7. a hormonal complaint is recognized', () => {
    expect(slugs('My period has been different.')).toContain('irregular-cycle');
    expect(slugs('The hot flashes are constant.')).toContain('hot-flashes');
  });

  it('8. a food and eating complaint is recognized', () => {
    expect(slugs("I've been craving sugar all afternoon.")).toContain('sugar-cravings');
    expect(slugs('Certain foods bother me.')).toContain('food-triggered-reactions');
  });

  it('9. a pain complaint is recognized', () => {
    expect(slugs('My shoulder keeps bothering me.')).toContain('joint-aching');
    expect(slugs('My headaches have been worse.')).toContain('headaches');
    expect(slugs('My lower back pain is bad today.')).toContain('low-back-ache');
  });
});

// ---------------------------------------------------------------------
// 10 and 11. Laterality and her exact words.
// ---------------------------------------------------------------------

describe('what the complaint carried is carried through', () => {
  it('10. keeps the side where her words had one', () => {
    expect(draftFor('My right hip has been clicking.', 'hip-clicking')?.side).toBe('right');
    expect(draftFor('My left shoulder keeps bothering me.', 'joint-aching')?.side).toBe('left');
    expect(draftFor('Both knees hurt.', 'joint-aching')?.side).toBe('both');
  });

  it('10b. invents no side where her words had none', () => {
    expect(draftFor('My hip has been clicking.', 'hip-clicking')?.side).toBeNull();
  });

  it('10c. a side never survives onto an area that has no sides', () => {
    // "Right" is in the sentence, and bloating has no left and right. The
    // signal draft is where that is settled, because the body area's own
    // takes_side row is the thing that knows.
    const drafts = classifyComplaint('My right hip hurts and I am bloated.', LEXICON);
    const bloating = drafts.find((draft) => draft.signalSlug.includes('bloat'));
    expect(bloating).toBeDefined();
    const library = miniLibrary();
    const signals = signalDraftsFor(REPORT, drafts, library);
    const bloatRow = signals.find((row) => row.signalSlug.includes('bloat'));
    expect(bloatRow?.side).toBeNull();
  });

  it('11. preserves her exact wording, with her capitals and her apostrophe', () => {
    // The span reported is HERS, not the lexicon's tidier version of it.
    // The matcher works over a flattened string and maps back, so a capital
    // and an apostrophe that were never in the lexicon row survive.
    const caps = draftFor('My RIGHT HIP HAS BEEN CLICKING.', 'hip-clicking');
    expect(caps?.matchedPhrase).toBe('HIP HAS BEEN CLICKING');
    const sleep = draftFor("I haven't been sleeping well.", 'lighter-or-broken-sleep');
    expect(sleep?.matchedPhrase).toBe("haven't been sleeping well");
  });

  it("11c. reads a possessive contraction, which is how a phone keyboard writes it", () => {
    const draft = draftFor("My right hip's been clicking.", 'hip-clicking');
    expect(draft).toBeDefined();
    expect(draft?.side).toBe('right');
    expect(draft?.bodyAreaKey).toBe('hip');
  });

  it('11b. the span it reports is really a substring of what she wrote', () => {
    const text = 'My right hip has been clicking and aching when I walk.';
    for (const draft of classifyComplaint(text, LEXICON)) {
      expect(text).toContain(draft.matchedPhrase);
    }
  });
});

// ---------------------------------------------------------------------
// 12. It identifies. It never diagnoses.
// ---------------------------------------------------------------------

describe('the classifier identifies and never diagnoses', () => {
  const SENTENCES = [
    'My right hip has been clicking and aching when I walk.',
    'My skin has been breaking out badly.',
    'I barely slept this week and I have been really irritable.',
    'My period has been different and I am exhausted.',
    'I have been bloated after meals and my headaches are worse.',
  ];

  it('12. produces no key that could hold a cause, a condition or a score', () => {
    const forbidden = /cause|condition|diagnos|disease|organ|confidence|score|severity|risk/i;
    for (const sentence of SENTENCES) {
      for (const draft of classifyComplaint(sentence, LEXICON)) {
        for (const key of Object.keys(draft)) {
          expect(key, `${key} on a classification`).not.toMatch(forbidden);
        }
      }
    }
  });

  it('12b. every value it emits is a key from the vocabulary or her own words', () => {
    for (const sentence of SENTENCES) {
      for (const draft of classifyComplaint(sentence, LEXICON)) {
        // The only free text it can ever produce is the span of HER text.
        expect(sentence).toContain(draft.matchedPhrase);
        expect(draft.signalSlug).toMatch(/^[a-z0-9-]+$/);
        if (draft.bodyAreaKey) expect(draft.bodyAreaKey).toMatch(/^[a-z_]+$/);
      }
    }
  });

  it('12c. cannot name a signal the vocabulary does not hold', () => {
    const known = new Set(LEXICON.phrases.map((phrase) => phrase.signalSlug));
    for (const sentence of SENTENCES) {
      for (const draft of classifyComplaint(sentence, LEXICON)) {
        expect(known.has(draft.signalSlug)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------
// The two ways a sentence can say "this is NOT happening".
// ---------------------------------------------------------------------

describe('a sentence that closes something out files it as SETTLED, not as nothing', () => {
  /**
   * THE BEHAVIOUR THIS BLOCK USED TO ASSERT WAS WRONG, and it is worth
   * saying why rather than quietly changing the expectations.
   *
   * The matcher recognized "my headaches have stopped" and then threw the
   * whole match away. Nothing was written: no classification, no row, and
   * no way for a coach to know she had said it. That is not neutral. The
   * Signal Library is APPEND OVER TIME and the engine reads the LATEST
   * row, so the silence left last month's headache complaint standing as
   * the newest thing she had ever said on the subject. A member closing a
   * symptom out had her closing ignored and her complaint preserved.
   *
   * A resolution is now an ordinary row at nought, which
   * lib/cross-system-root/evidence.ts already reads as RESOLVED and
   * lib/cross-system-patterns/match.ts already refuses as support.
   */
  function resolutionOf(text: string, slug: string) {
    return classifyComplaint(text, LEXICON).find((draft) => draft.signalSlug === slug);
  }

  it('reads a closing word that comes first, and marks it as a resolution', () => {
    const bloating = resolutionOf('No bloating this week.', 'bloated-stomach');
    expect(bloating?.isResolution).toBe(true);
    const headaches = resolutionOf('I have not had any headaches.', 'headaches');
    expect(headaches?.isResolution).toBe(true);
  });

  it('reads one that comes last, which is where English often puts it', () => {
    expect(resolutionOf('My headaches have stopped.', 'headaches')?.isResolution).toBe(true);
    expect(resolutionOf('The bloating is gone.', 'bloated-stomach')?.isResolution).toBe(true);
  });

  it('writes a resolution as a row at nought, which is what makes it resolved', () => {
    const drafts = classifyComplaint('The bloating is gone.', LEXICON);
    const rows = signalDraftsFor(REPORT, drafts, miniLibrary());
    const bloating = rows.find((row) => row.signalSlug === 'bloated-stomach');
    expect(bloating).toBeDefined();
    expect(bloating?.valueNumeric).toBe(0);
    expect(bloating?.valueKey).toBe('never');
    expect(bloating?.valueLabel).toBe('No longer reported');
    // And an ordinary complaint still writes a presence, unchanged.
    const live = signalDraftsFor(
      REPORT,
      classifyComplaint('My right hip has been clicking.', LEXICON),
      miniLibrary()
    ).find((row) => row.signalSlug === 'hip-clicking');
    expect(live?.valueKind).toBe('presence');
    expect(live?.valueNumeric).toBeNull();
  });

  it('a live complaint in the same sentence stays live', () => {
    // "stopped" closes the headache. The hip is a separate clause and must
    // survive as a CURRENT complaint, or one settled symptom would silence
    // a live one.
    const drafts = classifyComplaint(
      'My headaches have stopped but my right hip is still clicking.',
      LEXICON
    );
    const headache = drafts.find((draft) => draft.signalSlug === 'headaches');
    expect(headache?.isResolution).toBe(true);
    const hip = drafts.find((draft) => draft.bodyAreaKey === 'hip');
    expect(hip).toBeDefined();
    expect(hip?.side).toBe('right');
    expect(hip?.isResolution).toBe(false);
  });

  it('a reopening word cancels a closing one, in the sentence a member really writes', () => {
    // THE DIRECTION THAT OPENS IT AGAIN. "Stopped, but they have come
    // back" contains a closing word and is a CURRENT complaint, and a
    // matcher that only knew how to close would have filed it as settled.
    const back = resolutionOf(
      'My headaches had stopped but they have come back this week.',
      'headaches'
    );
    expect(back).toBeDefined();
    expect(back?.isResolution).toBe(false);
  });

  it('an ordinary complaint is never marked as a resolution', () => {
    for (const draft of classifyComplaint('My right hip has been clicking.', LEXICON)) {
      expect(draft.isResolution).toBe(false);
    }
  });

  it('a sentence with nothing in it produces nothing', () => {
    expect(slugs('Nothing to report, feeling good.')).toHaveLength(0);
    expect(slugs('')).toHaveLength(0);
    expect(slugs('   ')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// The disambiguation rule, which is the whole of how it tells phrases apart.
// ---------------------------------------------------------------------

describe('the longer phrase wins', () => {
  it('orders the lexicon longest first', () => {
    const ordered = orderPhrases([
      { phrase: 'tired', signalSlug: 'a', bodyAreaKey: null, specificity: 99 },
      { phrase: 'waking up tired', signalSlug: 'b', bodyAreaKey: null, specificity: 0 },
    ]);
    expect(ordered[0]!.signalSlug).toBe('b');
  });

  it('files "waking up tired" as waking tired, not as two separate things', () => {
    const found = slugs('I have been waking up tired.');
    expect(found).toContain('waking-tired-after-full-sleep');
    expect(found).not.toContain('lower-energy-than-before');
  });

  it('claims a span once, so one complaint is not filed twice', () => {
    const drafts = classifyComplaint('I am bloated after meals.', LEXICON);
    const bloatRows = drafts.filter((draft) => draft.signalSlug.includes('bloat'));
    expect(bloatRows).toHaveLength(1);
  });
});

describe('normalization', () => {
  it('drops apostrophes rather than splitting the word around them', () => {
    expect(normalizeComplaintText("can't").text).toBe(' cant ');
  });

  it('collapses punctuation and runs of space into one separator', () => {
    expect(normalizeComplaintText('hip,   sore!!').text).toBe(' hip sore ');
  });

  it('maps every emitted character back to where it came from', () => {
    const input = 'My hip!';
    const norm = normalizeComplaintText(input);
    for (let i = 0; i < norm.text.length; i += 1) {
      const origin = norm.map[i]!;
      expect(origin).toBeGreaterThanOrEqual(0);
      expect(origin).toBeLessThanOrEqual(input.length);
    }
  });
});

describe('the classifier names which reading produced a finding', () => {
  it('carries a revision, so a finding stays explainable after the lexicon grows', () => {
    expect(CLASSIFIER_REVISION).toMatch(/^deterministic-lexicon-/);
  });
});

// ---------------------------------------------------------------------
// The classified complaint becomes an ORDINARY signal row.
// ---------------------------------------------------------------------

const REPORT = {
  id: 'report-1',
  rawText: 'My right hip has been clicking.',
  fieldRef: 'optional_notes',
  fieldPrompt: 'Anything else you want to note about today?',
  surfaceKey: 'daily_checkin_notes',
  surfaceLabel: 'Daily check-in notes',
  reportedOn: '2026-09-15',
  reportedAt: '2026-09-15T12:00:00.000Z',
  authorRole: 'member' as const,
};

function miniLibrary(): SignalLibrary {
  return {
    categories: new Map(),
    bodyAreas: new Map([
      ['hip', { areaKey: 'hip', position: 1, displayName: 'Hip', takesSide: true }],
      ['abdomen', { areaKey: 'abdomen', position: 2, displayName: 'Abdomen', takesSide: false }],
      ['skin', { areaKey: 'skin', position: 3, displayName: 'Skin', takesSide: false }],
    ]),
    symptoms: new Map(),
    names: new Map([
      [
        'hip-clicking',
        {
          signalSlug: 'hip-clicking',
          displayName: 'Hip clicking',
          categoryKey: 'joint_movement',
          defaultBodyAreaKey: 'hip',
          defaultSymptomKey: 'clicking',
          searchTerms: '',
          isCoachAddable: true,
        },
      ],
      [
        'joint-aching',
        {
          signalSlug: 'joint-aching',
          displayName: 'Joint aching',
          categoryKey: 'joint_movement',
          defaultBodyAreaKey: null,
          defaultSymptomKey: 'aching',
          searchTerms: '',
          isCoachAddable: true,
        },
      ],
      [
        'bloated-stomach',
        {
          signalSlug: 'bloated-stomach',
          displayName: 'Bloated stomach',
          categoryKey: 'digestion',
          defaultBodyAreaKey: 'abdomen',
          defaultSymptomKey: null,
          searchTerms: '',
          isCoachAddable: true,
        },
      ],
      [
        'bloating-after-eating',
        {
          signalSlug: 'bloating-after-eating',
          displayName: 'Bloating after eating',
          categoryKey: 'digestion',
          defaultBodyAreaKey: 'abdomen',
          defaultSymptomKey: null,
          searchTerms: '',
          isCoachAddable: true,
        },
      ],
    ]),
    sources: new Map([
      [
        'member_reported',
        {
          sourceKey: 'member_reported',
          position: 7,
          displayName: 'Reported by the member',
          assessmentDefinitionId: null,
        },
      ],
    ]),
    mappings: new Map(),
  };
}

describe('a classified complaint is an ordinary signal row', () => {
  it('writes into the same shape a questionnaire adapter writes', () => {
    const drafts = classifyComplaint(REPORT.rawText, LEXICON).filter(
      (draft) => draft.signalSlug === 'hip-clicking'
    );
    const [row] = signalDraftsFor(REPORT, drafts, miniLibrary());
    expect(row).toBeDefined();
    expect(row!.signalName).toBe('Hip clicking');
    expect(row!.categoryKey).toBe('joint_movement');
    expect(row!.bodyAreaKey).toBe('hip');
    expect(row!.side).toBe('right');
    expect(row!.sourceKey).toBe('member_reported');
    expect(row!.sourceLabel).toBe('Reported by the member');
    expect(row!.capturedOn).toBe('2026-09-15');
  });

  it('keeps her own words on the row, and the prompt she was answering', () => {
    const drafts = classifyComplaint(REPORT.rawText, LEXICON).filter(
      (draft) => draft.signalSlug === 'hip-clicking'
    );
    const [row] = signalDraftsFor(REPORT, drafts, miniLibrary());
    expect(row!.note).toBe('hip has been clicking');
    expect(row!.sourceQuestionPrompt).toBe('Anything else you want to note about today?');
    expect(row!.sourceRecordId).toBe('report-1');
  });

  it('is a presence when she said no frequency, and a scale when she did', () => {
    const plain = signalDraftsFor(
      REPORT,
      classifyComplaint('My hip is clicking.', LEXICON),
      miniLibrary()
    );
    expect(plain[0]!.valueKind).toBe('presence');
    expect(plain[0]!.valueNumeric).toBeNull();

    const often = signalDraftsFor(
      REPORT,
      classifyComplaint('My hip keeps clicking.', LEXICON),
      miniLibrary()
    );
    expect(often[0]!.valueKind).toBe('scale');
    // The Body Systems Survey's own point value for Often, so one timeline
    // rather than two that never meet.
    expect(often[0]!.valueNumeric).toBe(6);
  });

  it('gives every row a fingerprint, so re-reading one note writes nothing twice', () => {
    const drafts = classifyComplaint(REPORT.rawText, LEXICON);
    const rows = signalDraftsFor(REPORT, drafts, miniLibrary());
    const prints = rows.map((row) => row.ingestFingerprint);
    expect(new Set(prints).size).toBe(prints.length);
    for (const print of prints) expect(print).toContain('report-1');
  });

  it('skips a slug the library does not hold rather than labelling it with itself', () => {
    const rows = signalDraftsFor(
      REPORT,
      [
        {
          position: 0,
          signalSlug: 'not-a-real-signal',
          isResolution: false,
          bodyAreaKey: null,
          side: null,
          matchedPhrase: 'whatever',
          contextKey: null,
          frequencyKey: null,
          frequencyLabel: null,
          frequencyNumeric: null,
        },
      ],
      miniLibrary()
    );
    expect(rows).toHaveLength(0);
  });
});
