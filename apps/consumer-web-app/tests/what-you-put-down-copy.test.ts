/**
 * What You Put Down: the copy is the brief, word for word.
 *
 * WHY A TEST AND NOT A REVIEW. Every string in this experience was written
 * for this experience and approved as written. A stray edit to a question
 * prompt does not break a type, does not fail a render and does not look
 * wrong on a screen, so nothing but an assertion catches it. These are the
 * approved sentences, pasted here from the brief rather than imported from
 * the module they check, which is the only way this test can disagree with
 * the code.
 *
 * IT ALSO GUARDS THE TWO STANDING RULES THIS EXPERIENCE CARRIES: no em dash
 * anywhere a member or coach can read, including inside the migration,
 * which the repository-wide guard (tests/no-em-dash-guard.test.ts) cannot
 * see because it only walks app/, components/ and lib/. And the naming
 * rule: the medical title, in both of its forms, appears nowhere in this
 * feature.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  WYPD_QUESTIONS,
  WYPD_CARDS_KEY,
  WYPD_CLOSING_KEY,
  WYPD_COLUMN_KEY,
  WYPD_OPENER_KEY,
  wypdWritesProse,
} from '@/lib/what-you-put-down/questions';
import {
  WYPD_AREA,
  WYPD_CLOSING_LABEL,
  WYPD_CLOSING_LINE,
  WYPD_COACH_COPY,
  WYPD_COPY,
  WYPD_INTRO_BODY_LINES,
  WYPD_LABEL,
  WYPD_RESOURCE,
  WYPD_SECTIONS,
  WYPD_SHELF_COPY,
} from '@/lib/what-you-put-down/copy';
import {
  WYPD_EXPERIMENT_ACTION,
  WYPD_EXPERIMENT_DAILY_QUESTION,
  buildWypdExperiment,
} from '@/lib/what-you-put-down/experiment';
import { WYPD_POLES } from '@/lib/what-you-put-down/shelf';
import {
  WYPD_EXPERIMENT_DURATION_DAYS,
  WYPD_ROUTE,
} from '@/lib/what-you-put-down/constants';

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '../..');
const MIGRATION = path.join(REPO_ROOT, 'supabase/migrations/00000000000217_what_you_put_down.sql');

/** Every file this feature owns, member facing or not. */
const FEATURE_FILES = [
  'lib/what-you-put-down/constants.ts',
  'lib/what-you-put-down/questions.ts',
  'lib/what-you-put-down/shelf.ts',
  'lib/what-you-put-down/copy.ts',
  'lib/what-you-put-down/data.ts',
  'lib/what-you-put-down/access.ts',
  'lib/what-you-put-down/service.ts',
  'lib/what-you-put-down/view.ts',
  'lib/what-you-put-down/experiment.ts',
  'lib/what-you-put-down/dailyLogsData.ts',
  'app/what-you-put-down/page.tsx',
  'app/actions/whatYouPutDown.ts',
  'components/what-you-put-down/WhatYouPutDownExperience.tsx',
  'components/what-you-put-down/WhatYouPutDownEntry.tsx',
  'components/what-you-put-down/WhatYouPutDownResource.tsx',
  'components/what-you-put-down/WhatYouPutDownExperimentPanel.tsx',
  'app/coach/clients/[id]/WhatYouPutDownPanel.tsx',
];

/** The shared treatment, whose interactive half this build also owns. */
const SHARED_FILES = [
  'lib/happiness-deep-dive/motion.ts',
  'lib/happiness-deep-dive/interactive.ts',
  'components/happiness-deep-dive/AmbientDrift.tsx',
  'components/happiness-deep-dive/ChapterCard.tsx',
  'components/happiness-deep-dive/HoldRing.tsx',
  'components/happiness-deep-dive/QuestionStage.tsx',
  'components/happiness-deep-dive/ClosingCenterpiece.tsx',
  'components/happiness-deep-dive/WordCard.tsx',
  'components/happiness-deep-dive/CardShelf.tsx',
  'components/happiness-deep-dive/PlacingDeck.tsx',
  'components/happiness-deep-dive/PoleSlider.tsx',
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
  it('is What You Put Down, under Happiness, on its own route', () => {
    expect(WYPD_LABEL).toBe('What You Put Down');
    expect(WYPD_AREA).toBe('Happiness');
    expect(WYPD_ROUTE).toBe('/what-you-put-down');
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
    expect(WYPD_COPY.introTitle).toBe('What You Put Down');
    expect(WYPD_INTRO_BODY_LINES.join(' ')).toBe(
      'No scores, no right answers. Root has nine questions about the versions of yourself you set aside to carry everything else. Fifteen to twenty minutes, somewhere quiet.'
    );
  });

  it('uses the shared typewriter component rather than a second one', () => {
    const experience = read('components/what-you-put-down/WhatYouPutDownExperience.tsx');
    expect(experience).toContain("import { IntroReveal } from '@/components/IntroReveal'");
    expect(experience).toContain('<IntroReveal');
  });
});

describe('the three screens and the nine questions', () => {
  it('are titled What Was Carried Away, The Story Around It and Picking It Back Up', () => {
    expect(WYPD_SECTIONS.map((section) => section.title)).toEqual([
      'What Was Carried Away',
      'The Story Around It',
      'Picking It Back Up',
    ]);
  });

  it('are the approved prompts, in the approved order, three to a screen', () => {
    const APPROVED: Array<{ screen: 1 | 2 | 3; kind: string; prompt: string }> = [
      {
        screen: 1,
        kind: 'written',
        prompt:
          'Complete this sentence: I used to be someone who... Write every ending that comes to you, one per line. Do not filter.',
      },
      {
        screen: 1,
        kind: 'shelf_place',
        prompt: 'Here they are, in your own words. Put each one on the shelf.',
      },
      {
        screen: 1,
        kind: 'written',
        prompt: 'When did you stop being that? What took its place?',
      },
      {
        screen: 2,
        kind: 'written',
        prompt:
          'What is the reason you would give someone for why that part of you ended? Write it. Then, underneath it, write the more honest reason.',
      },
      { screen: 2, kind: 'slider', prompt: 'How far away does she feel?' },
      {
        screen: 2,
        kind: 'written',
        prompt:
          'If you watched a friend put down the exact same thing for the exact same reasons, what would you tell her?',
      },
      {
        screen: 3,
        kind: 'shelf_lift',
        prompt: 'Which one still has a pulse? Lift it off the shelf.',
      },
      {
        screen: 3,
        kind: 'written',
        prompt:
          'What is the smallest possible return to it? Not the old version at full scale. A doorway. Something within reach in the next two weeks.',
      },
      {
        screen: 3,
        kind: 'written',
        prompt:
          'Write a sentence to the version of you who put it down. What do you want her to know?',
      },
    ];

    expect(WYPD_QUESTIONS).toHaveLength(9);
    expect(
      WYPD_QUESTIONS.map((question) => ({
        screen: question.screen,
        kind: question.kind,
        prompt: question.prompt,
      }))
    ).toEqual(APPROVED);
  });

  it('the two prompts that come after an interaction are the approved ones', () => {
    expect(WYPD_QUESTIONS[1]?.secondPrompt).toBe('Tap the one that stings most to read back.');
    expect(WYPD_QUESTIONS[4]?.secondPrompt).toBe('Why there, and not further away?');
  });

  it("the line's two ends are Right here and A stranger", () => {
    expect(WYPD_POLES.near).toBe('Right here');
    expect(WYPD_POLES.far).toBe('A stranger');
  });

  it('six of the nine are writing, and the interactive ones set writing up rather than replacing it', () => {
    expect(WYPD_QUESTIONS.filter(wypdWritesProse)).toHaveLength(7);
    // Seven writing boxes across nine questions: six pure written questions
    // plus the written half of the slider. The other two questions are
    // choices, and each one is what the question directly after it is
    // about.
    expect(WYPD_QUESTIONS.filter((question) => question.kind === 'written')).toHaveLength(6);
    expect(WYPD_QUESTIONS.filter((question) => !wypdWritesProse(question))).toHaveLength(2);
  });

  it('question one is what the cards are made from, and nothing else is', () => {
    expect(WYPD_QUESTIONS[0]?.key).toBe(WYPD_CARDS_KEY);
    const shelf = stripComments(read('lib/what-you-put-down/shelf.ts'));
    expect(shelf).toContain('hddLinesToCardTexts');
  });

  it('question three is the one that quotes her card back to her, and it is the only one', () => {
    expect(WYPD_QUESTIONS[2]?.quotesStingCard).toBe(true);
    expect(WYPD_QUESTIONS.filter((question) => question.quotesStingCard)).toHaveLength(1);
  });

  it('question eight gets its own column, question nine is what the closing prints, and question seven opens the coach session', () => {
    expect(WYPD_QUESTIONS[7]?.key).toBe(WYPD_COLUMN_KEY);
    expect(WYPD_QUESTIONS[8]?.key).toBe(WYPD_CLOSING_KEY);
    expect(WYPD_QUESTIONS[6]?.key).toBe(WYPD_OPENER_KEY);
    // Three different questions, on purpose: the doorway is the actionable
    // one, the sentence is the one she should read last, and the lifted
    // card is the one a coach opens with.
    expect(new Set([WYPD_COLUMN_KEY, WYPD_CLOSING_KEY, WYPD_OPENER_KEY]).size).toBe(3);
  });

  it('every written question is open writing, with no options and no character cap', () => {
    const experience = read('components/what-you-put-down/WhatYouPutDownExperience.tsx');
    expect(experience).toContain('<textarea');
    expect(experience).not.toContain('maxLength');
    expect(experience).not.toContain('role="radio"');
    expect(experience).not.toContain('role="checkbox"');
  });
});

describe('everything the shelf and the line say out loud', () => {
  it('names every control, so nothing here needs sight or a mouse to use', () => {
    expect(WYPD_SHELF_COPY.shelfLabel.length).toBeGreaterThan(0);
    expect(WYPD_SHELF_COPY.placeCard.length).toBeGreaterThan(0);
    expect(WYPD_SHELF_COPY.placeHere.length).toBeGreaterThan(0);
    expect(WYPD_SHELF_COPY.chooseSting.length).toBeGreaterThan(0);
    expect(WYPD_SHELF_COPY.chooseLift.length).toBeGreaterThan(0);
    expect(WYPD_SHELF_COPY.lineLabel.length).toBeGreaterThan(0);
    expect(WYPD_SHELF_COPY.lineUnset.length).toBeGreaterThan(0);
  });

  it('never asks her to drag, because a drag is never required', () => {
    for (const line of Object.values(WYPD_SHELF_COPY)) {
      expect(line).not.toMatch(/\bdrag\b/i);
      expect(line).not.toMatch(/\bdrop\b/i);
    }
  });
});

describe('the closing', () => {
  it('is the approved sentence, exactly', () => {
    expect(WYPD_CLOSING_LINE).toBe('She is still in there. She just read this.');
    expect(WYPD_CLOSING_LABEL).toBe('To the one who put it down');
  });

  it('the fixed line claims nothing specific about this member', () => {
    // It is true by construction: question nine asked her to write to the
    // version of herself who put it down, and the person reading that
    // sentence on this screen is her. It says nothing about what she wrote
    // or about whether she will go back to anything.
    expect(WYPD_CLOSING_LINE).not.toMatch(/\bYou are\b/i);
    expect(WYPD_CLOSING_LINE).not.toMatch(/\byour answer (?:says|shows|tells|means)\b/i);
    expect(WYPD_CLOSING_LINE).not.toMatch(/\bwill\b/i);
  });

  it('the claim it does make is one the app actually keeps', () => {
    expect(WYPD_COPY.closingBody).toContain('your coach can read what you wrote');
    expect(read('app/coach/clients/[id]/WhatYouPutDownPanel.tsx')).toContain('WYPD_QUESTIONS.filter');
  });

  it('prints her shelf and her own question nine sentence, and nothing is clamped', () => {
    const experience = read('components/what-you-put-down/WhatYouPutDownExperience.tsx');
    expect(experience).toContain('WYPD_CLOSING_KEY');
    expect(experience).toContain('WYPD_CLOSING_LINE');
    expect(experience).toContain('WYPD_CLOSING_LABEL');
    expect(experience).toContain('<CardShelf');
    // The serif face is applied by the shared centerpiece and the shared card.
    expect(read('components/happiness-deep-dive/ClosingCenterpiece.tsx')).toContain(
      'font-cormorant-garamond'
    );
    expect(read('components/happiness-deep-dive/WordCard.tsx')).toContain(
      'font-cormorant-garamond'
    );
    for (const file of [
      'components/what-you-put-down/WhatYouPutDownExperience.tsx',
      'components/happiness-deep-dive/WordCard.tsx',
      'components/happiness-deep-dive/CardShelf.tsx',
    ]) {
      expect(stripComments(read(file)), file).not.toContain('line-clamp');
      expect(stripComments(read(file)), file).not.toContain('truncate');
    }
  });

  it('Root reports what happened and says nothing about her', () => {
    expect(WYPD_COPY.closingHeading).toBe('Nothing here was graded.');
    expect(WYPD_COPY.closingBody).toContain('Root scored none of this and interpreted none of it');
  });
});

describe('the experiment', () => {
  it('offers the approved action, for seven days', () => {
    expect(WYPD_EXPERIMENT_ACTION).toBe('Step through the doorway you named, once this week.');
    const offer = buildWypdExperiment();
    expect(offer.action).toBe(WYPD_EXPERIMENT_ACTION);
    expect(offer.durationDays).toBe(7);
    expect(WYPD_EXPERIMENT_DURATION_DAYS).toBe(7);
    expect(offer.protocol).toContain(WYPD_EXPERIMENT_ACTION);
  });

  it('asks the approved daily question, verbatim', () => {
    expect(WYPD_EXPERIMENT_DAILY_QUESTION).toBe(
      'Did you touch the thing you put down today, even for a minute?'
    );
  });

  it('logs Yes or Not today, and nothing else', () => {
    const panel = read('components/what-you-put-down/WhatYouPutDownExperimentPanel.tsx');
    expect(panel).toContain('>\n            Yes\n          </button>');
    expect(panel).toContain('>\n            Not today\n          </button>');
  });

  it('never bakes her own doorway into the stored protocol', () => {
    const offer = buildWypdExperiment();
    expect(offer.protocol).toContain('the doorway you named');
    const experimentSource = stripComments(read('lib/what-you-put-down/experiment.ts'));
    expect(experimentSource).not.toContain('answers');
    expect(experimentSource).not.toContain('WypdAnswers');
    expect(experimentSource).not.toContain('shelf');
  });

  it('has a decline path and reads the shared two experiment cap', () => {
    expect(WYPD_COPY.experimentDecline).toBe('Not right now');
    expect(WYPD_COPY.experimentDeclined.length).toBeGreaterThan(0);
    const action = read('app/actions/whatYouPutDown.ts');
    expect(action).toContain('MAX_ACTIVE_EXPERIMENTS');
    expect(action).toContain('startLifestyleExperiment');
  });
});

describe('the pop-up', () => {
  it('is the approved sentence', () => {
    expect(WYPD_COPY.popupBody).toBe(
      'Your coach asked Root to sit down with you on this one. It is called What You Put Down. Nine questions about the versions of yourself you set aside.'
    );
    expect(WYPD_COPY.popupTitle).toBe(WYPD_LABEL);
  });
});

describe('the resource', () => {
  it('is titled You Are Allowed to Come Back and is summary first', () => {
    expect(WYPD_RESOURCE.title).toBe('You Are Allowed to Come Back');
    expect(WYPD_RESOURCE.body.length).toBeGreaterThan(0);
    expect(WYPD_RESOURCE.full.length).toBeGreaterThan(WYPD_RESOURCE.body.length);
  });

  it('is roughly the four hundred words that were asked for', () => {
    const words = `${WYPD_RESOURCE.body} ${WYPD_RESOURCE.full}`.trim().split(/\s+/).length;
    expect(words).toBeGreaterThan(320);
    expect(words).toBeLessThan(520);
  });

  it('covers the three things it was asked to cover', () => {
    const whole = `${WYPD_RESOURCE.body} ${WYPD_RESOURCE.full}`;
    // Abandoned identities do not expire.
    expect(whole).toMatch(/\bexpire/i);
    // Why returning feels like trespassing.
    expect(whole).toMatch(/\btrespass/i);
    // Why the smallest return counts as a return.
    expect(whole).toMatch(/\bdoorway\b/i);
    expect(whole).toMatch(/\bsmall|\bscale\b/i);
  });

  it('tells her to do nothing, because the experiment beside it is the only ask', () => {
    expect(WYPD_RESOURCE.full).not.toMatch(/\byou should\b/i);
    expect(WYPD_RESOURCE.full).not.toMatch(/\btry to\b/i);
    expect(WYPD_RESOURCE.full).not.toMatch(/\bmake sure\b/i);
    expect(WYPD_RESOURCE.full).not.toMatch(/\bstart by\b/i);
  });
});

describe('Root claims nothing about her', () => {
  it('no line of copy begins a claim about the member', () => {
    for (const line of Object.values(WYPD_COPY)) {
      expect(line).not.toMatch(/\bYou are (?:someone|a person|the kind)\b/i);
      expect(line).not.toMatch(/\bwhat this (?:says|tells us) about you\b/i);
    }
    expect(WYPD_CLOSING_LINE).not.toMatch(/\bYou are\b/i);
  });

  it('there is no scoring vocabulary anywhere in the feature', () => {
    for (const file of FEATURE_FILES) {
      const source = stripComments(read(file));
      expect(source, file).not.toMatch(/\bseverity\b/i);
      expect(source, file).not.toMatch(/registry_entries/);
      expect(source, file).not.toMatch(/source_feature/);
    }
  });

  it('the position on the line is read back as words, never as a number or a percentage', () => {
    const panel = read('app/coach/clients/[id]/WhatYouPutDownPanel.tsx');
    expect(panel).toContain('hddPolePositionInWords');
    expect(panel).not.toContain('%`');
    const slider = read('components/happiness-deep-dive/PoleSlider.tsx');
    expect(stripComments(slider)).toContain('hddPolePositionInWords');
  });
});

describe("the coach's own headings", () => {
  it('put the shelf first, then question seven, then the writing', () => {
    expect(WYPD_COACH_COPY.shelfHeading).toBe('What went on the shelf');
    expect(WYPD_COACH_COPY.openerHeading).toBe('Open the session with this');
    expect(WYPD_COACH_COPY.answersHeading).toBe('What they wrote');
    expect(WYPD_COACH_COPY.distanceLabel).toBe('Placed her at');
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
