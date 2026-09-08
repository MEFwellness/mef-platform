/**
 * The Life You're Building: the copy is the brief, word for word.
 *
 * WHY A TEST AND NOT A REVIEW. Every string in this experience was written
 * for this experience and approved as written. A stray edit to a question
 * prompt does not break a type, does not fail a render and does not look
 * wrong on a screen, so nothing but an assertion catches it. These are the
 * approved sentences, pasted here from the brief rather than imported from
 * the module they check, which is the only way this test can disagree with
 * the code.
 *
 * IT ALSO GUARDS THE FORMAT ROTATION. The standing rule for this family is
 * that no two consecutive templates feel alike. Your Own Company's
 * signature is the instinct pick, the rapid round and the sentence that
 * replaces another, so this template may use none of them, and there is no
 * shelf here and nothing dragged either. That is asserted against the real
 * source rather than trusted.
 *
 * AND THE TWO STANDING RULES THIS EXPERIENCE CARRIES: no em dash anywhere a
 * member or coach can read, including inside the migration, which the
 * repository-wide guard (tests/no-em-dash-guard.test.ts) cannot see because
 * it only walks app/, components/ and lib/. And the naming rule: the
 * medical title, in both of its forms, appears nowhere in this feature.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  TLYB_CLOSING_KEY,
  TLYB_FOLLOW_UP_KEY,
  TLYB_FOLLOW_UP_PREFIX,
  TLYB_FOLLOW_UP_SUFFIX,
  TLYB_QUESTIONS,
  TLYB_SENTENCE_KEY,
  TLYB_SLIDER_KEYS,
  TLYB_STONE_KEY,
  TLYB_WRITTEN_KEYS,
  followUpPromptFor,
  tlybLeadPromptFor,
} from '@/lib/the-life-youre-building/questions';
import {
  TLYB_AREA,
  TLYB_CLOSING_FOLLOW_UP_LINE,
  TLYB_CLOSING_NOW_LABEL,
  TLYB_CLOSING_STANDALONE_LINE,
  TLYB_CLOSING_THEN_LABEL,
  TLYB_COACH_COPY,
  TLYB_COPY,
  TLYB_INTRO_BODY_LINES,
  TLYB_INTRO_FOLLOW_UP_LINE,
  TLYB_LABEL,
  TLYB_RESOURCE,
  TLYB_SECTIONS,
  TLYB_SLIDER_COPY,
} from '@/lib/the-life-youre-building/copy';
import {
  TLYB_EXPERIMENT_ACTION,
  TLYB_EXPERIMENT_DAILY_QUESTION,
  buildTlybExperiment,
} from '@/lib/the-life-youre-building/experiment';
import {
  TLYB_EXPERIMENT_DURATION_DAYS,
  TLYB_ROUTE,
} from '@/lib/the-life-youre-building/constants';

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '../..');
const MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/00000000000219_the_life_youre_building.sql'
);

/** Every file this feature owns, member facing or not. */
const FEATURE_FILES = [
  'lib/the-life-youre-building/constants.ts',
  'lib/the-life-youre-building/questions.ts',
  'lib/the-life-youre-building/sliders.ts',
  'lib/the-life-youre-building/copy.ts',
  'lib/the-life-youre-building/followUp.ts',
  'lib/the-life-youre-building/data.ts',
  'lib/the-life-youre-building/access.ts',
  'lib/the-life-youre-building/service.ts',
  'lib/the-life-youre-building/view.ts',
  'lib/the-life-youre-building/experiment.ts',
  'lib/the-life-youre-building/dailyLogsData.ts',
  'app/the-life-youre-building/page.tsx',
  'app/actions/theLifeYoureBuilding.ts',
  'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx',
  'components/the-life-youre-building/TheLifeYoureBuildingEntry.tsx',
  'components/the-life-youre-building/TheLifeYoureBuildingResource.tsx',
  'components/the-life-youre-building/TheLifeYoureBuildingExperimentPanel.tsx',
  'app/coach/clients/[id]/TheLifeYoureBuildingPanel.tsx',
];

/** The shared treatment, whose read-only pole picture this build also owns. */
const SHARED_FILES = [
  'lib/happiness-deep-dive/motion.ts',
  'lib/happiness-deep-dive/interactive.ts',
  'components/happiness-deep-dive/AmbientDrift.tsx',
  'components/happiness-deep-dive/ChapterCard.tsx',
  'components/happiness-deep-dive/HoldRing.tsx',
  'components/happiness-deep-dive/QuestionStage.tsx',
  'components/happiness-deep-dive/FollowUpPrompt.tsx',
  'components/happiness-deep-dive/ClosingCenterpiece.tsx',
  'components/happiness-deep-dive/WordCard.tsx',
  'components/happiness-deep-dive/CardShelf.tsx',
  'components/happiness-deep-dive/PlacingDeck.tsx',
  'components/happiness-deep-dive/PoleSlider.tsx',
  'components/happiness-deep-dive/PoleMap.tsx',
  'components/happiness-deep-dive/InstinctPair.tsx',
  'components/happiness-deep-dive/RapidRound.tsx',
  'components/happiness-deep-dive/SupersededPair.tsx',
  'components/happiness-deep-dive/useHappinessSittingMotion.ts',
  'components/happiness-deep-dive/index.ts',
];

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/**
 * The code with its prose removed.
 *
 * Several assertions below are about what the CODE does, and this feature's
 * files explain those same rules in comments using the same words. Matching
 * a rule's own description and calling it a violation is how a
 * source-scanning test reports a defect that is not there.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the name', () => {
  it("is The Life You're Building, under Happiness, on its own route", () => {
    expect(TLYB_LABEL).toBe("The Life You're Building");
    expect(TLYB_AREA).toBe('Happiness');
    expect(TLYB_ROUTE).toBe('/the-life-youre-building');
  });

  it('never uses the medical title, in either form, anywhere in the feature or its migration', () => {
    const sources = [
      ...FEATURE_FILES.map(read),
      ...SHARED_FILES.map(read),
      fs.readFileSync(MIGRATION, 'utf8'),
    ];
    for (const source of sources) {
      expect(source).not.toMatch(/\bDoctors?\b/i);
      expect(source).not.toMatch(/\bDr\./i);
    }
  });
});

describe('the intro', () => {
  it('is the approved headline and body, and the line split changes not one word', () => {
    expect(TLYB_COPY.introTitle).toBe("The Life You're Building");
    expect(TLYB_INTRO_BODY_LINES.join(' ')).toBe(
      'No scores, no right answers. Root has nine questions, and this time they all face forward. Fifteen to twenty minutes, somewhere quiet.'
    );
  });

  it('carries one extra approved line, and only in follow-up mode', () => {
    expect(TLYB_INTRO_FOLLOW_UP_LINE).toBe(
      'A while back, you wrote a sentence and asked Root to hold onto it. Root kept it. You will see it again at the end.'
    );
    // It is not part of the standard body, so a standalone member is never
    // handed it at all.
    expect([...TLYB_INTRO_BODY_LINES]).not.toContain(TLYB_INTRO_FOLLOW_UP_LINE);
    // And it arrives as its own typed beat, appended after the standard
    // body rather than replacing any of it.
    const experience = stripComments(
      read('components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx')
    );
    expect(experience).toContain('[...TLYB_INTRO_BODY_LINES, TLYB_INTRO_FOLLOW_UP_LINE]');
  });

  it('uses the shared typewriter component rather than a second one', () => {
    const experience = read(
      'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx'
    );
    expect(experience).toContain("import { IntroReveal } from '@/components/IntroReveal'");
    expect(experience).toContain('<IntroReveal');
  });
});

describe("the format rotates: none of template seven's signature appears here", () => {
  it('there is no instinct pair, no rapid round and no superseded sentence', () => {
    const experience = read(
      'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx'
    );
    expect(experience).not.toContain('InstinctPair');
    expect(experience).not.toContain('RapidRound');
    expect(experience).not.toContain('SupersededPair');
  });

  it('there is no shelf and no deck either, and nothing is dragged', () => {
    const experience = stripComments(
      read('components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx')
    );
    expect(experience).not.toContain('CardShelf');
    expect(experience).not.toContain('PlacingDeck');
    expect(experience).not.toContain('WordCard');
    for (const file of [
      'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx',
      'components/happiness-deep-dive/PoleSlider.tsx',
      'components/happiness-deep-dive/PoleMap.tsx',
    ]) {
      const source = stripComments(read(file));
      expect(source, file).not.toContain('pointerdown');
      expect(source, file).not.toContain('setPointerCapture');
    }
    for (const line of Object.values(TLYB_SLIDER_COPY)) {
      expect(line).not.toMatch(/\bdrag\b/i);
      expect(line).not.toMatch(/\btap the one\b/i);
    }
  });

  it('its own signature is the place-yourself slider, and three of the nine open with one', () => {
    expect(TLYB_QUESTIONS.filter((question) => question.kind === 'slider')).toHaveLength(3);
    expect(TLYB_QUESTIONS.filter((question) => question.kind === 'written')).toHaveLength(6);
    expect(TLYB_SLIDER_KEYS).toEqual([
      'built_or_handed',
      'beginning_or_almost',
      'what_is_between',
    ]);
    // And it is the shared slider from template six, not a second one.
    const experience = read(
      'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx'
    );
    expect(experience).toContain("from '@/components/happiness-deep-dive'");
    expect(experience).toContain('<PoleSlider');
    expect(experience).not.toContain('function PoleSlider');
  });

  it('the written half of a slider question is genuinely absent until she has placed her mark', () => {
    const experience = stripComments(
      read('components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx')
    );
    // Conditional rendering, not a hidden element: she cannot type ahead of
    // a question she has not been asked.
    expect(experience).toContain(
      'tlybPositionFor(sliders, question.key) !== null && (\n                  <div className="mt-7">{writtenHalf(question)}</div>'
    );
  });
});

describe('the three screens and the nine questions', () => {
  it('are titled Where You Stand, The Materials and The First Stone', () => {
    expect(TLYB_SECTIONS.map((section) => section.title)).toEqual([
      'Where You Stand',
      'The Materials',
      'The First Stone',
    ]);
  });

  it('are the approved prompts, in the approved order, three to a screen', () => {
    const APPROVED: Array<{ screen: 1 | 2 | 3; kind: string; prompt: string }> = [
      {
        screen: 1,
        kind: 'slider',
        prompt: 'What parts did you actually choose? What came with the territory?',
      },
      {
        screen: 1,
        kind: 'slider',
        prompt:
          'At the beginning of what, or almost where? Name what you are building toward, as specifically as you can.',
      },
      {
        screen: 1,
        kind: 'written',
        prompt:
          'Describe one ordinary day in your life three years from now, if everything you have been working on takes root. Walk through it morning to night. Small details count.',
      },
      {
        screen: 2,
        kind: 'written',
        prompt:
          'What do you already have that this future is built from? Name what is already in your hands: strengths, people, ground you have gained.',
      },
      { screen: 2, kind: 'slider', prompt: 'Name it. What is the thing?' },
      {
        screen: 2,
        kind: 'written',
        prompt:
          'What have you learned about yourself lately that the woman from three years ago did not know? What would surprise her most?',
      },
      {
        screen: 3,
        kind: 'written',
        prompt:
          'Of everything in your three-years-from-now day, which single piece matters most? The one that, if it existed, would make the rest feel possible.',
      },
      {
        screen: 3,
        kind: 'written',
        prompt:
          'What is the first stone? One act in the next seven days that belongs to that life, not this one.',
      },
      {
        screen: 3,
        kind: 'written',
        prompt:
          'Write the sentence you would want Root to hold onto from today. The one that tells the truth about who you are becoming.',
      },
    ];

    expect(TLYB_QUESTIONS).toHaveLength(9);
    expect(
      TLYB_QUESTIONS.map((question) => ({
        screen: question.screen,
        kind: question.kind,
        prompt: question.prompt,
      }))
    ).toEqual(APPROVED);
  });

  it('the three things Root says first above a line are the approved statements', () => {
    expect(TLYB_QUESTIONS.map(tlybLeadPromptFor)).toEqual([
      'The life I am living is...',
      'Right now I feel...',
      // A plain written question asks its own prompt and nothing before it.
      TLYB_QUESTIONS[2]?.prompt,
      TLYB_QUESTIONS[3]?.prompt,
      'The main thing between me and that life is...',
      TLYB_QUESTIONS[5]?.prompt,
      TLYB_QUESTIONS[6]?.prompt,
      TLYB_QUESTIONS[7]?.prompt,
      TLYB_QUESTIONS[8]?.prompt,
    ]);
  });

  it('the three lines carry the approved pairs of words', () => {
    expect(TLYB_QUESTIONS[0]?.poles).toEqual({ near: 'Built by me', far: 'Handed to me' });
    expect(TLYB_QUESTIONS[1]?.poles).toEqual({
      near: 'At the beginning',
      far: 'Almost there',
    });
    expect(TLYB_QUESTIONS[4]?.poles).toEqual({ near: 'Outside me', far: 'Inside me' });
    // And only those three carry any.
    expect(TLYB_QUESTIONS.filter((question) => question.poles)).toHaveLength(3);
  });

  it('EVERY one of the nine carries writing, so no mark ever replaces a sentence', () => {
    expect(TLYB_WRITTEN_KEYS).toHaveLength(9);
    expect(TLYB_WRITTEN_KEYS).toEqual(TLYB_QUESTIONS.map((question) => question.key));
    for (const question of TLYB_QUESTIONS) {
      expect(question.prompt.trim().length, question.key).toBeGreaterThan(0);
    }
  });

  it('question nine is the one that can quote her back to herself, and it is the only one', () => {
    expect(TLYB_QUESTIONS[8]?.followsUp).toBe(true);
    expect(TLYB_QUESTIONS.filter((question) => question.followsUp)).toHaveLength(1);
    expect(TLYB_FOLLOW_UP_KEY).toBe(TLYB_QUESTIONS[8]?.key);
  });

  it('the follow-up wording is the approved sentence, with her own words dropped in', () => {
    expect(TLYB_FOLLOW_UP_PREFIX).toBe('You once asked Root to hold onto this: ');
    expect(TLYB_FOLLOW_UP_SUFFIX).toBe(
      'Read it now, from where you are standing today. What do you want to say back to it?'
    );
    expect(followUpPromptFor('I am allowed to take up room')).toBe(
      'You once asked Root to hold onto this: I am allowed to take up room. Read it now, from where you are standing today. What do you want to say back to it?'
    );
  });

  it('does not double the punctuation when she ended on a sentence herself', () => {
    expect(followUpPromptFor('I am enough as I am.')).toContain('I am enough as I am. Read it now');
    expect(followUpPromptFor('I am enough as I am')).toContain('I am enough as I am. Read it now');
    // Whitespace around her sentence is trimmed, and nothing inside it is.
    expect(followUpPromptFor('  I  am   enough  ')).toContain('I  am   enough.');
  });

  it('question eight and question nine each get their own column', () => {
    expect(TLYB_QUESTIONS[7]?.key).toBe(TLYB_STONE_KEY);
    expect(TLYB_STONE_KEY).toBe('the_first_stone');
    expect(TLYB_QUESTIONS[8]?.key).toBe(TLYB_SENTENCE_KEY);
    expect(TLYB_SENTENCE_KEY).toBe('the_sentence_forward');
    // And the closing prints question nine.
    expect(TLYB_CLOSING_KEY).toBe(TLYB_SENTENCE_KEY);
  });

  it('every written question is open writing, with no options and no character cap', () => {
    const experience = read(
      'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx'
    );
    expect(experience).toContain('<textarea');
    expect(experience).not.toContain('maxLength');
    expect(experience).not.toContain('role="checkbox"');
  });
});

describe('everything the lines say out loud', () => {
  it('names every control, so nothing here needs sight or a mouse to use', () => {
    expect(TLYB_SLIDER_COPY.unset.length).toBeGreaterThan(0);
    expect(TLYB_SLIDER_COPY.hint.length).toBeGreaterThan(0);
    expect(TLYB_SLIDER_COPY.mapHeading.length).toBeGreaterThan(0);
    expect(TLYB_SLIDER_COPY.mapLabel.length).toBeGreaterThan(0);
  });

  it('the line is a real range input, named by the statement she is completing', () => {
    const slider = read('components/happiness-deep-dive/PoleSlider.tsx');
    expect(slider).toContain('type="range"');
    expect(slider).toContain('aria-label={label}');
    expect(slider).toContain('aria-valuetext={words}');
    const experience = read(
      'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx'
    );
    expect(experience).toContain('label={tlybLeadPromptFor(question)}');
  });

  it('says out loud that there is no right place to stand', () => {
    expect(TLYB_SLIDER_COPY.hint).toContain('There is no right place');
  });
});

describe('the closing', () => {
  it('is the approved sentence in each mode, exactly', () => {
    expect(TLYB_CLOSING_STANDALONE_LINE).toBe('This one Root will hold onto too.');
    expect(TLYB_CLOSING_FOLLOW_UP_LINE).toBe(
      'You wrote the first one too. Look how far the writer has come.'
    );
  });

  it('labels the two sentences Then and Now, in that order', () => {
    expect(TLYB_CLOSING_THEN_LABEL).toBe('Then');
    expect(TLYB_CLOSING_NOW_LABEL).toBe('Now');
    // Inside the closing itself, not in the import list, which is
    // alphabetical and says nothing about the order they are printed in.
    const source = stripComments(
      read('components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx')
    );
    const closing = source.slice(source.indexOf('function TheClosing'));
    const thenAt = closing.indexOf('TLYB_CLOSING_THEN_LABEL');
    const nowAt = closing.indexOf('TLYB_CLOSING_NOW_LABEL');
    expect(thenAt).toBeGreaterThan(-1);
    expect(nowAt).toBeGreaterThan(thenAt);
  });

  it('neither fixed line claims anything about this member', () => {
    for (const line of [TLYB_CLOSING_STANDALONE_LINE, TLYB_CLOSING_FOLLOW_UP_LINE]) {
      expect(line).not.toMatch(/\bYou are\b/i);
      expect(line).not.toMatch(/\byour answer (?:says|shows|tells|means)\b/i);
    }
    // The standalone line's claim is one the database actually keeps: the
    // sentence is stored in a column of its own.
    expect(
      fs.readFileSync(MIGRATION, 'utf8')
    ).toContain('add column if not exists forward_sentence text');
  });

  it('the claim it does make is one the app actually keeps', () => {
    expect(TLYB_COPY.closingBody).toContain('your coach can read what you wrote');
    expect(read('app/coach/clients/[id]/TheLifeYoureBuildingPanel.tsx')).toContain(
      'TLYB_QUESTIONS.filter'
    );
  });

  it('prints her three marks as one composition, then her sentence, and nothing is clamped', () => {
    const experience = read(
      'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx'
    );
    expect(experience).toContain('<PoleMap');
    expect(experience).toContain('<ClosingCenterpiece');
    expect(experience).toContain('TLYB_CLOSING_STANDALONE_LINE');
    expect(experience).toContain('TLYB_CLOSING_FOLLOW_UP_LINE');
    for (const file of [
      'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx',
      'components/happiness-deep-dive/PoleMap.tsx',
    ]) {
      expect(stripComments(read(file)), file).not.toContain('line-clamp');
      expect(stripComments(read(file)), file).not.toContain('truncate');
    }
  });

  it('the composition prints only her own positions, and interprets none of them', () => {
    const map = stripComments(read('components/happiness-deep-dive/PoleMap.tsx'));
    // Her position is put back into words by the ONE shared function, which
    // the live slider and the coach card also read.
    expect(map).toContain('hddPolePositionInWords');
    // And nothing here is a score, a total or a judgement.
    expect(map).not.toMatch(/\bscore\b/i);
    expect(map).not.toMatch(/\btotal\b/i);
    expect(map).not.toMatch(/\baverage\b/i);
    expect(map).not.toMatch(/\bseverity\b/i);
    // The map is read-only: no control on it does anything.
    expect(map).not.toContain('<button');
    expect(map).not.toContain('<input');
  });

  it('Root reports what happened and says nothing about her', () => {
    expect(TLYB_COPY.closingHeading).toBe('Nothing here was graded.');
    expect(TLYB_COPY.closingBody).toContain(
      'Root scored none of this and interpreted none of it'
    );
  });
});

describe('the experiment', () => {
  it('offers the approved action, for seven days', () => {
    expect(TLYB_EXPERIMENT_ACTION).toBe('Lay the first stone you named, once this week.');
    const offer = buildTlybExperiment();
    expect(offer.action).toBe(TLYB_EXPERIMENT_ACTION);
    expect(offer.durationDays).toBe(7);
    expect(TLYB_EXPERIMENT_DURATION_DAYS).toBe(7);
    expect(offer.protocol).toContain(TLYB_EXPERIMENT_ACTION);
  });

  it('asks the approved daily question, verbatim', () => {
    expect(TLYB_EXPERIMENT_DAILY_QUESTION).toBe(
      'Did today have anything in it that belongs to the life you are building?'
    );
  });

  it('logs Yes or Not today, and nothing else', () => {
    const panel = read(
      'components/the-life-youre-building/TheLifeYoureBuildingExperimentPanel.tsx'
    );
    expect(panel).toContain('>\n            Yes\n          </button>');
    expect(panel).toContain('>\n            Not today\n          </button>');
  });

  it('never bakes her own first stone into the stored protocol', () => {
    const offer = buildTlybExperiment();
    expect(offer.protocol).toContain('the first stone you named');
    const experimentSource = stripComments(read('lib/the-life-youre-building/experiment.ts'));
    expect(experimentSource).not.toContain('TlybAnswers');
    expect(experimentSource).not.toContain('firstStone');
    expect(experimentSource).not.toContain('sliders');
  });

  it('has a decline path and reads the shared two experiment cap', () => {
    expect(TLYB_COPY.experimentDecline).toBe('Not right now');
    expect(TLYB_COPY.experimentDeclined.length).toBeGreaterThan(0);
    const action = read('app/actions/theLifeYoureBuilding.ts');
    expect(action).toContain('MAX_ACTIVE_EXPERIMENTS');
    expect(action).toContain('startLifestyleExperiment');
  });
});

describe('the pop-up', () => {
  it('is the approved sentence', () => {
    expect(TLYB_COPY.popupBody).toBe(
      "Your coach asked Root to sit down with you on this one. It is called The Life You're Building. Nine questions, all facing forward."
    );
    expect(TLYB_COPY.popupTitle).toBe(TLYB_LABEL);
  });
});

describe('the resource', () => {
  it('is titled You Are Already Building It and is summary first', () => {
    expect(TLYB_RESOURCE.title).toBe('You Are Already Building It');
    expect(TLYB_RESOURCE.body.length).toBeGreaterThan(0);
    expect(TLYB_RESOURCE.full.length).toBeGreaterThan(TLYB_RESOURCE.body.length);
  });

  it('is roughly the four hundred words that were asked for', () => {
    const words = `${TLYB_RESOURCE.body} ${TLYB_RESOURCE.full}`.trim().split(/\s+/).length;
    expect(words).toBeGreaterThan(320);
    expect(words).toBeLessThan(520);
  });

  it('covers the two things it was asked to cover', () => {
    const whole = `${TLYB_RESOURCE.body} ${TLYB_RESOURCE.full}`;
    // Futures are made of ordinary days.
    expect(whole).toMatch(/ordinary/i);
    expect(whole).toMatch(/\bTuesday\b/);
    // And the evidence is usually already present in small form.
    expect(whole).toMatch(/evidence/i);
    expect(whole).toMatch(/smaller form|small(?:er)? version|any size/i);
  });

  it('is observational, and tells her to do nothing', () => {
    expect(TLYB_RESOURCE.full).not.toMatch(/\byou should\b/i);
    expect(TLYB_RESOURCE.full).not.toMatch(/\btry to\b/i);
    expect(TLYB_RESOURCE.full).not.toMatch(/\bmake sure\b/i);
    expect(TLYB_RESOURCE.full).not.toMatch(/\bstart by\b/i);
  });
});

describe('Root claims nothing about her', () => {
  it('no line of copy begins a claim about the member', () => {
    for (const line of Object.values(TLYB_COPY)) {
      expect(line).not.toMatch(/\bYou are (?:someone|a person|the kind)\b/i);
      expect(line).not.toMatch(/\bwhat this (?:says|tells us) about you\b/i);
    }
  });

  it('there is no scoring vocabulary anywhere in the feature', () => {
    for (const file of FEATURE_FILES) {
      const source = stripComments(read(file));
      expect(source, file).not.toMatch(/\bseverity\b/i);
      expect(source, file).not.toMatch(/registry_entries/);
      expect(source, file).not.toMatch(/source_feature/);
    }
  });

  it('her three positions are never combined into a fourth number', () => {
    for (const file of [
      'lib/the-life-youre-building/sliders.ts',
      'components/happiness-deep-dive/PoleMap.tsx',
      'app/coach/clients/[id]/TheLifeYoureBuildingPanel.tsx',
    ]) {
      const source = stripComments(read(file));
      expect(source, file).not.toMatch(/\.reduce\(/);
      expect(source, file).not.toMatch(/\baverage\b/i);
    }
  });
});

describe("the coach's own headings", () => {
  it('put her positions first, then the first stone, then the writing', () => {
    expect(TLYB_COACH_COPY.slidersHeading).toBe('Where they placed themselves');
    expect(TLYB_COACH_COPY.openerHeading).toBe('The first stone');
    expect(TLYB_COACH_COPY.answersHeading).toBe('What they wrote');
    expect(TLYB_COACH_COPY.followUpHeading).toBe('Follow-up from Owning Your Value');
  });
});

describe('no em dash', () => {
  it('appears nowhere in this feature, the shared treatment, or the migration', () => {
    for (const file of [...FEATURE_FILES, ...SHARED_FILES]) {
      expect(read(file), `${file} contains an em dash`).not.toContain('—');
    }
    expect(fs.readFileSync(MIGRATION, 'utf8')).not.toContain('—');
  });
});
