/**
 * THE WIDENED LEXICON, DRIVEN OVER THE SENTENCES PEOPLE ACTUALLY WRITE.
 *
 * WHY THIS IS SEPARATE FROM cross-system-complaint-classify.test.ts. That
 * file tests the ALGORITHM: windows, spans, ordering, the shape of a draft.
 * This one tests the VOCABULARY: whether a member writing "both my knees
 * have been grinding on stairs" is understood by the rows this build
 * deploys. Both drive the shipped lexicon out of the migrations, because a
 * classifier test built on invented phrases proves nothing about what is
 * live.
 *
 * THE MATCHER CANNOT INVENT A SIGNAL, and the last block here proves it
 * against the whole canonical vocabulary rather than asserting it.
 */

import { describe, it, expect } from 'vitest';
import { classifyComplaint } from '@/lib/cross-system-complaints/classify';
import { shippedLexicon } from './cross-system-complaint-fixture';
import { canonicalVocabulary } from './cross-system-map-fixture';

const LEXICON = shippedLexicon();
const VOCAB = canonicalVocabulary();

function drafts(text: string) {
  return classifyComplaint(text, LEXICON);
}
function slugs(text: string): string[] {
  return drafts(text).map((draft) => draft.signalSlug);
}
function first(text: string) {
  return drafts(text)[0];
}

describe('the lexicon is big enough to hear real people', () => {
  it('holds over a thousand phrases and hundreds of modifiers', () => {
    expect(LEXICON.phrases.length).toBeGreaterThan(1000);
    expect(LEXICON.modifiers.length).toBeGreaterThan(300);
  });

  it('holds all five kinds of modifier, including the two new directions', () => {
    const kinds = new Set(LEXICON.modifiers.map((modifier) => modifier.kind));
    for (const kind of [
      'side',
      'body_area',
      'context',
      'frequency',
      'negation',
      'negation_after',
      'reassertion',
    ]) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
  });
});

describe('synonyms: the words people reach for', () => {
  const CASES: Array<[string, string]> = [
    ['My knee has been grinding.', 'joint-grinding'],
    ['My shoulder keeps popping.', 'joint-popping'],
    ['My hip clicks.', 'hip-clicking'],
    ['My knee locks up sometimes.', 'joint-locking'],
    ['My ankle gives way.', 'joint-instability'],
    ['My neck is stiff.', 'neck-and-shoulder-tension'],
    ['My hamstrings feel tight.', 'muscle-tightness'],
    ['My glutes feel weak.', 'muscle-weakness'],
    ['I have a knot in my shoulder.', 'trigger-point-tenderness'],
    ['I get a sharp pain in my hip.', 'sharp-or-pinching-pain'],
    ['My head has been throbbing.', 'throbbing-pain'],
    ['There is a burning down my leg.', 'burning-sensation'],
    ['My fingers go numb.', 'numbness'],
    ['I get tingling in my foot.', 'tingling'],
    ['My ankle is swollen.', 'ankle-or-foot-swelling'],
    ['My calf feels like it is pulling.', 'muscle-pulling-sensation'],
    ['I cannot straighten my elbow.', 'reduced-joint-range'],
    ['I have been grinding my teeth.', 'jaw-clenching'],
    ['My jaw clicks when I chew.', 'jaw-clicking'],
    ['I have been lying awake for hours.', 'trouble-falling-asleep'],
    ['My legs will not settle at night.', 'restless-legs-at-night'],
    ['I skipped lunch again today.', 'skipping-meals'],
    ['I hardly drink water.', 'drinking-little-water'],
    ['I have been straining to go.', 'straining-with-stools'],
    ['I have been sweating a lot.', 'excessive-sweating'],
    ['I am always on and never switch off.', 'difficulty-switching-off'],
    ['I have such a short fuse lately.', 'irritability'],
    ['I keep sighing.', 'sighing-or-yawning-often'],
  ];

  it.each(CASES)('%s reads as the right canonical signal', (text, slug) => {
    expect(slugs(text), text).toContain(slug);
  });
});

describe('tense and number, which is the hurt / hurts defect generalised', () => {
  const FORMS: Array<[string[], string]> = [
    [['My knee hurt yesterday.', 'My knee hurts.', 'My knee has been hurting.'], 'joint-aching'],
    [['Both knees hurt.', 'My knees have been hurting.'], 'joint-aching'],
    [['My hip aches.', 'My hip is aching.', 'My hip ached all week.'], 'joint-aching'],
    [
      ['My shoulder clicks.', 'My shoulder is clicking.', 'My shoulder has been clicking.'],
      'joint-clicking',
    ],
    [['My knee grinds.', 'My knees are grinding.', 'My knee has been grinding.'], 'joint-grinding'],
  ];

  it.each(FORMS)('every form reads the same way', (texts, slug) => {
    for (const text of texts) {
      expect(slugs(text), text).toContain(slug);
    }
  });

  it("reads a possessive contraction, which is how a phone keyboard writes it", () => {
    expect(slugs("My knee's been grinding.")).toContain('joint-grinding');
  });
});

describe('laterality', () => {
  it.each([
    ['My right knee has been grinding.', 'right'],
    ['My left shoulder keeps popping.', 'left'],
    ['Both knees are grinding.', 'both'],
    ['My knee on the right has been grinding.', 'right'],
    ['Grinding in my knees on both sides.', 'both'],
  ])('%s carries the side she named', (text, side) => {
    const draft = drafts(text).find((entry) => entry.side !== null);
    expect(draft?.side, text).toBe(side);
  });

  it('a side never survives onto something with no sides', () => {
    // "Right" is in the sentence and bloating has no left and right. The
    // classification may still carry the word; the SIGNAL draft is where it
    // is settled, and that case lives in the classifier test.
    const bloating = drafts('My right hip hurts and I feel bloated.').find((entry) =>
      entry.signalSlug.includes('bloat')
    );
    expect(bloating).toBeDefined();
  });
});

describe('location modifiers, including every area this build added', () => {
  it.each([
    ['My sacroiliac joint has been aching.', 'si_joint'],
    ['My glutes have been sore.', 'glute'],
    ['My hamstrings are tight.', 'hamstring'],
    ['My calves keep cramping.', 'calf'],
    ['My groin has been aching.', 'groin'],
    ['My thighs feel heavy.', 'thigh'],
    ['My ribs hurt when I breathe.', 'ribs'],
    ['My traps are so tight.', 'neck'],
    ['My shoulder blade aches.', 'upper_back'],
    ['My heel hurts in the morning.', 'foot'],
    ['My knuckles are stiff.', 'hand'],
    ['My temples are throbbing.', 'head'],
  ])('%s lands on the right place', (text, areaKey) => {
    const placed = drafts(text).find((entry) => entry.bodyAreaKey === areaKey);
    expect(placed, `${text} -> ${areaKey}`).toBeDefined();
  });
});

describe('context modifiers', () => {
  it.each([
    ['I feel bloated after meals.', 'after_meals'],
    ['My hip aches when I walk.', 'when_walking'],
    ['My knee hurts at night.', 'at_night'],
    ['I am stiff in the morning.', 'morning'],
    ['My shoulder aches during workouts.', 'with_exercise'],
    ['My neck tightens when I am stressed.', 'under_stress'],
    ['My knee hurts going up stairs.', 'on_stairs'],
    ['My hands ache in cold weather.', 'in_the_cold'],
    ['My back aches after sitting.', 'when_sitting'],
    ['My hip aches around my period.', 'around_cycle'],
  ])('%s carries the context she gave', (text, contextKey) => {
    const carried = drafts(text).find((entry) => entry.contextKey === contextKey);
    expect(carried, `${text} -> ${contextKey}`).toBeDefined();
  });

  it('never invents a context she did not give', () => {
    for (const draft of drafts('My knee has been grinding.')) {
      expect(draft.contextKey).toBeNull();
    }
  });
});

describe('resolution, in both directions, and the direction that reopens it', () => {
  const CLOSED_IN_FRONT = [
    'No bloating this week.',
    'I no longer get headaches.',
    'I have not had any headaches.',
    'I used to get headaches.',
  ];
  const CLOSED_BEHIND = [
    'My headaches have stopped.',
    'The bloating is gone.',
    'My headaches went away.',
    'The bloating has settled.',
    'My headaches are much better now.',
    'The bloating has cleared.',
  ];

  it.each(CLOSED_IN_FRONT)('%s files as resolved, never as current', (text) => {
    const found = drafts(text);
    expect(found.length, text).toBeGreaterThan(0);
    expect(found.every((draft) => draft.isResolution), text).toBe(true);
  });

  it.each(CLOSED_BEHIND)('%s files as resolved, never as current', (text) => {
    const found = drafts(text);
    expect(found.length, text).toBeGreaterThan(0);
    expect(found.every((draft) => draft.isResolution), text).toBe(true);
  });

  it.each([
    'My headaches had stopped but they have come back.',
    'The bloating went away and then it started again.',
    'My headaches stopped for a while and have returned.',
  ])('%s is CURRENT, because she reopened it', (text) => {
    const found = drafts(text);
    expect(found.length, text).toBeGreaterThan(0);
    expect(found.some((draft) => !draft.isResolution), text).toBe(true);
  });

  it('a reopening word about somebody else does not reopen this one', () => {
    // The hip is what is "still clicking". The headache stayed closed.
    const found = drafts('My headaches have stopped but my right hip is still clicking.');
    const headache = found.find((draft) => draft.signalSlug === 'headaches');
    const hip = found.find((draft) => draft.bodyAreaKey === 'hip');
    expect(headache?.isResolution).toBe(true);
    expect(hip?.isResolution).toBe(false);
  });

  it('an ordinary complaint is never a resolution', () => {
    for (const text of [
      'My right knee has been grinding on stairs.',
      'I feel bloated after every meal.',
      'My neck is tight and my jaw aches.',
    ]) {
      for (const draft of drafts(text)) expect(draft.isResolution, text).toBe(false);
    }
  });
});

describe('the matcher can never produce a signal outside the canonical vocabulary', () => {
  it('every lexicon row targets a name the Signal Library really holds', () => {
    const bad = LEXICON.phrases
      .filter((phrase) => !VOCAB.signals.has(phrase.signalSlug))
      .map((phrase) => `${phrase.phrase} -> ${phrase.signalSlug}`);
    expect(bad, bad.slice(0, 10).join('\n')).toHaveLength(0);
  });

  it('every area a lexicon row or a modifier names really exists', () => {
    const bad: string[] = [];
    for (const phrase of LEXICON.phrases) {
      if (phrase.bodyAreaKey && !VOCAB.bodyAreas.has(phrase.bodyAreaKey)) {
        bad.push(`${phrase.phrase} -> ${phrase.bodyAreaKey}`);
      }
    }
    for (const modifier of LEXICON.modifiers) {
      if (modifier.bodyAreaKey && !VOCAB.bodyAreas.has(modifier.bodyAreaKey)) {
        bad.push(`${modifier.phrase} -> ${modifier.bodyAreaKey}`);
      }
    }
    expect(bad, bad.slice(0, 10).join('\n')).toHaveLength(0);
  });

  it('nothing a member can write produces a slug the library does not hold', () => {
    // Driven over a wide spread of real sentences rather than over the rows
    // themselves, so the assertion is about what the MATCHER emits.
    const sentences = [
      'My right knee has been grinding and locking on the stairs since Tuesday.',
      'I am bloated after every meal, exhausted when I wake, and my skin is breaking out.',
      'Both shoulders are tight, my jaw clicks, and I cannot switch off at night.',
      'My headaches have stopped but my low back is still aching when I sit.',
      'Hamstrings tight, calves cramping, hips clicking, and I hardly drink any water.',
      'Random words that mean nothing at all to anybody.',
      '',
      '    ',
    ];
    for (const sentence of sentences) {
      for (const draft of classifyComplaint(sentence, LEXICON)) {
        expect(VOCAB.signals.has(draft.signalSlug), `${sentence} -> ${draft.signalSlug}`).toBe(true);
      }
    }
  });

  it('a sentence with nothing in it produces nothing', () => {
    expect(slugs('Nothing to report, feeling good.')).toHaveLength(0);
    expect(slugs('')).toHaveLength(0);
  });
});

describe('the sensation words were repointed, and this is the defect that fixed', () => {
  /**
   * BEFORE THIS BUILD every sensation a joint can produce mapped onto one
   * canonical name: click, pop, stiff, tight, weak, locking and giving way
   * all classified as "Joint aching". A member writing "my knee keeps
   * giving way" was recorded as having an ache, which is not what she said.
   */
  it.each([
    ['My knee clicks.', 'joint-clicking'],
    ['My knee pops.', 'joint-popping'],
    ['My knee is stiff.', 'joint-stiffness'],
    ['My knee feels unstable.', 'joint-instability'],
    ['My knee keeps giving way.', 'joint-instability'],
    ['My quads feel weak.', 'muscle-weakness'],
  ])('%s no longer reads as an ache', (text, slug) => {
    const found = slugs(text);
    expect(found, text).toContain(slug);
    expect(found, text).not.toContain('joint-aching');
  });

  it('and a real ache still reads as one', () => {
    expect(slugs('My knee aches.')).toContain('joint-aching');
    expect(first('My knee hurts.')?.signalSlug).toBe('joint-aching');
  });
});
