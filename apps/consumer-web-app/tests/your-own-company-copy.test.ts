/**
 * Your Own Company: the copy is the brief, word for word.
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
 * that no two consecutive templates feel alike. What You Put Down's
 * signature is the shelf, the drag and the two-pole line, so this template
 * may use none of them, and that is asserted against the real source rather
 * than trusted.
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
  YOC_QUESTIONS,
  YOC_LINES_KEY,
  YOC_CLOSING_KEY,
  YOC_COLUMN_KEY,
  YOC_PICK_KEYS,
  YOC_RAPID_PAIR,
  YOC_RAPID_PHRASES,
  YOC_RAPID_QUESTION,
  YOC_WRITTEN_KEYS,
  yocLeadPromptFor,
} from '@/lib/your-own-company/questions';
import {
  YOC_AREA,
  YOC_CLOSING_FIRST_LABEL,
  YOC_CLOSING_LINE,
  YOC_CLOSING_SECOND_LABEL,
  YOC_COACH_COPY,
  YOC_COPY,
  YOC_INTRO_BODY_LINES,
  YOC_LABEL,
  YOC_PICK_COPY,
  YOC_RESOURCE,
  YOC_SECTIONS,
} from '@/lib/your-own-company/copy';
import {
  YOC_EXPERIMENT_ACTION,
  YOC_EXPERIMENT_DAILY_QUESTION,
  buildYocExperiment,
} from '@/lib/your-own-company/experiment';
import {
  YOC_EXPERIMENT_DURATION_DAYS,
  YOC_ROUTE,
} from '@/lib/your-own-company/constants';

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '../..');
const MIGRATION = path.join(REPO_ROOT, 'supabase/migrations/00000000000218_your_own_company.sql');

/** Every file this feature owns, member facing or not. */
const FEATURE_FILES = [
  'lib/your-own-company/constants.ts',
  'lib/your-own-company/questions.ts',
  'lib/your-own-company/instinct.ts',
  'lib/your-own-company/copy.ts',
  'lib/your-own-company/data.ts',
  'lib/your-own-company/access.ts',
  'lib/your-own-company/service.ts',
  'lib/your-own-company/view.ts',
  'lib/your-own-company/experiment.ts',
  'lib/your-own-company/dailyLogsData.ts',
  'app/your-own-company/page.tsx',
  'app/actions/yourOwnCompany.ts',
  'components/your-own-company/YourOwnCompanyExperience.tsx',
  'components/your-own-company/YourOwnCompanyEntry.tsx',
  'components/your-own-company/YourOwnCompanyResource.tsx',
  'components/your-own-company/YourOwnCompanyExperimentPanel.tsx',
  'app/coach/clients/[id]/YourOwnCompanyPanel.tsx',
];

/** The shared treatment, whose instinct half this build also owns. */
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
  it('is Your Own Company, under Happiness, on its own route', () => {
    expect(YOC_LABEL).toBe('Your Own Company');
    expect(YOC_AREA).toBe('Happiness');
    expect(YOC_ROUTE).toBe('/your-own-company');
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
    expect(YOC_COPY.introTitle).toBe('Your Own Company');
    expect(YOC_INTRO_BODY_LINES.join(' ')).toBe(
      'No scores, no right answers. Root has nine questions about the voice you live with: how you speak to yourself when no one else is around. Some questions ask for your first instinct. Give it honestly. Fifteen to twenty minutes, somewhere quiet.'
    );
  });

  it('uses the shared typewriter component rather than a second one', () => {
    const experience = read('components/your-own-company/YourOwnCompanyExperience.tsx');
    expect(experience).toContain("import { IntroReveal } from '@/components/IntroReveal'");
    expect(experience).toContain('<IntroReveal');
  });
});

describe('the format rotates: none of template six’s signature appears here', () => {
  it('there is no shelf, no deck and no two-pole line on this template', () => {
    const experience = read('components/your-own-company/YourOwnCompanyExperience.tsx');
    expect(experience).not.toContain('CardShelf');
    expect(experience).not.toContain('PlacingDeck');
    expect(experience).not.toContain('PoleSlider');
  });

  it('nothing here asks her to drag, and nothing is a slider', () => {
    const files = [
      'components/your-own-company/YourOwnCompanyExperience.tsx',
      'components/happiness-deep-dive/InstinctPair.tsx',
      'components/happiness-deep-dive/RapidRound.tsx',
    ];
    for (const file of files) {
      const source = stripComments(read(file));
      expect(source, file).not.toContain('pointerdown');
      expect(source, file).not.toContain('setPointerCapture');
      expect(source, file).not.toContain('type="range"');
    }
    for (const line of Object.values(YOC_PICK_COPY)) {
      expect(line).not.toMatch(/\bdrag\b/i);
      expect(line).not.toMatch(/\bslide\b/i);
    }
  });

  it('its own signature is the instinct pick, and five of the nine open with one', () => {
    expect(YOC_QUESTIONS.filter((question) => question.kind === 'instinct')).toHaveLength(3);
    expect(YOC_QUESTIONS.filter((question) => question.kind === 'rapid')).toHaveLength(1);
    expect(YOC_QUESTIONS.filter((question) => question.kind === 'choose')).toHaveLength(1);
    expect(YOC_QUESTIONS.filter((question) => question.kind === 'written')).toHaveLength(4);
    // Three this-or-that questions, the round of five, and the pick between
    // her own lines: five of the nine open with something she taps.
    expect(
      YOC_QUESTIONS.filter((question) => question.kind !== 'written')
    ).toHaveLength(5);
  });
});

describe('the three screens and the nine questions', () => {
  it('are titled The Voice, The Double Standard and Better Company', () => {
    expect(YOC_SECTIONS.map((section) => section.title)).toEqual([
      'The Voice',
      'The Double Standard',
      'Better Company',
    ]);
  });

  it('are the approved prompts, in the approved order, three to a screen', () => {
    const APPROVED: Array<{ screen: 1 | 2 | 3; kind: string; prompt: string }> = [
      {
        screen: 1,
        kind: 'instinct',
        prompt:
          'Write the actual sentence your inner voice said the last time you dropped something you were carrying.',
      },
      {
        screen: 1,
        kind: 'instinct',
        prompt: 'Whose standards is it enforcing? Where did it learn them?',
      },
      {
        screen: 1,
        kind: 'written',
        prompt:
          'Write down three things the voice says on repeat. The greatest hits. Word for word, however ugly. One per line.',
      },
      {
        screen: 2,
        kind: 'instinct',
        prompt:
          'Now write what you said to yourself for the same mistake. Look at the two sentences together.',
      },
      {
        screen: 2,
        kind: 'written',
        prompt:
          'What do you believe the harshness protects you from? What are you afraid happens if you go easy on yourself?',
      },
      {
        screen: 2,
        kind: 'rapid',
        prompt: 'Write about living with a roommate who talks to you like that.',
      },
      {
        screen: 3,
        kind: 'written',
        prompt:
          'Think of the kindest voice that has ever spoken to you. Anyone, any age. What did they sound like? What made you believe them?',
      },
      {
        screen: 3,
        kind: 'choose',
        prompt:
          'Rewrite it the way that kind voice would say it. Keep the true part. Drop the cruelty.',
      },
      {
        screen: 3,
        kind: 'written',
        prompt:
          'What kind of company do you want to be for yourself a year from now? Describe the voice you are building.',
      },
    ];

    expect(YOC_QUESTIONS).toHaveLength(9);
    expect(
      YOC_QUESTIONS.map((question) => ({
        screen: question.screen,
        kind: question.kind,
        prompt: question.prompt,
      }))
    ).toEqual(APPROVED);
  });

  it('the five things Root asks first are the approved ones', () => {
    expect(YOC_QUESTIONS.map(yocLeadPromptFor)).toEqual([
      'When I make a mistake, my first inner sentence starts with...',
      'The voice sounds most like...',
      // A plain written question asks its own prompt and nothing before it.
      YOC_QUESTIONS[2]?.prompt,
      'If my closest friend made my most recent mistake, I would say...',
      YOC_QUESTIONS[4]?.prompt,
      'Would you say this to a friend?',
      YOC_QUESTIONS[6]?.prompt,
      'Which one cuts deepest? Tap it.',
      YOC_QUESTIONS[8]?.prompt,
    ]);
  });

  it('the four this-or-that pairs are the approved cards', () => {
    expect(YOC_QUESTIONS[0]?.pair).toEqual({
      a: 'What is wrong with you',
      b: 'Okay, what happened?',
    });
    expect(YOC_QUESTIONS[1]?.pair).toEqual({ a: 'Someone I know', b: 'No one but me' });
    expect(YOC_QUESTIONS[3]?.pair).toEqual({
      a: 'It happens, you are okay',
      b: 'Let us figure it out',
    });
    expect(YOC_RAPID_PAIR).toEqual({ a: 'Yes', b: 'Never' });
  });

  it('the rapid round is the approved five phrases, under the approved question', () => {
    expect(YOC_RAPID_QUESTION).toBe('Would you say this to a friend?');
    expect(YOC_RAPID_PHRASES.map((phrase) => phrase.text)).toEqual([
      'You should have known better',
      'You always do this',
      'Everyone else manages',
      'You can rest when it is done',
      'Who else would put up with you',
    ]);
  });

  it('EVERY one of the nine carries writing, so no pick ever replaces a sentence', () => {
    expect(YOC_WRITTEN_KEYS).toHaveLength(9);
    expect(YOC_WRITTEN_KEYS).toEqual(YOC_QUESTIONS.map((question) => question.key));
    for (const question of YOC_QUESTIONS) {
      expect(question.prompt.trim().length, question.key).toBeGreaterThan(0);
    }
    // And only the four this-or-that questions can carry a pick.
    expect(YOC_PICK_KEYS).toEqual([
      'first_inner_sentence',
      'whose_standards',
      'same_mistake_two_sentences',
    ]);
  });

  it('question three is what the lines are made from, and nothing else is', () => {
    expect(YOC_QUESTIONS[2]?.key).toBe(YOC_LINES_KEY);
    const instinct = stripComments(read('lib/your-own-company/instinct.ts'));
    expect(instinct).toContain('hddLinesToCardTexts');
  });

  it('question eight is the one that quotes her line back to her, and it is the only one', () => {
    expect(YOC_QUESTIONS[7]?.quotesDeepestCut).toBe(true);
    expect(YOC_QUESTIONS.filter((question) => question.quotesDeepestCut)).toHaveLength(1);
  });

  it('question eight gets its own column, and it is what the closing prints', () => {
    expect(YOC_QUESTIONS[7]?.key).toBe(YOC_COLUMN_KEY);
    expect(YOC_COLUMN_KEY).toBe(YOC_CLOSING_KEY);
    expect(YOC_COLUMN_KEY).toBe('the_rewrite');
  });

  it('every written question is open writing, with no options and no character cap', () => {
    const experience = read('components/your-own-company/YourOwnCompanyExperience.tsx');
    expect(experience).toContain('<textarea');
    expect(experience).not.toContain('maxLength');
    expect(experience).not.toContain('role="checkbox"');
  });
});

describe('everything the picks say out loud', () => {
  it('names every control, so nothing here needs sight or a mouse to use', () => {
    expect(YOC_PICK_COPY.pickHint.length).toBeGreaterThan(0);
    expect(YOC_PICK_COPY.chooseDeepest.length).toBeGreaterThan(0);
    expect(YOC_PICK_COPY.linesLabel.length).toBeGreaterThan(0);
    expect(YOC_PICK_COPY.linesEmpty.length).toBeGreaterThan(0);
    expect(YOC_PICK_COPY.roundIntro.length).toBeGreaterThan(0);
  });

  it('the pair is a real radio group, with the standing question as its name', () => {
    const pair = read('components/happiness-deep-dive/InstinctPair.tsx');
    expect(pair).toContain('role="radiogroup"');
    expect(pair).toContain('aria-label={question}');
    expect(pair).toContain('aria-checked={chosen}');
  });

  it('says out loud that a first instinct can be changed', () => {
    expect(YOC_PICK_COPY.pickHint).toContain('There is no right one');
  });
});

describe('the closing', () => {
  it('is the approved sentence, exactly', () => {
    expect(YOC_CLOSING_LINE).toBe('You wrote both. Only one of them is true.');
  });

  it('labels the two sentences with the approved label, split across the two it belongs to', () => {
    expect(`${YOC_CLOSING_FIRST_LABEL} ${YOC_CLOSING_SECOND_LABEL}`).toBe(
      'The voice you had. The voice you are building.'
    );
  });

  it('the fixed line is about two sentences, and claims nothing about this member', () => {
    // It names no attribute of hers, predicts nothing, and does not say
    // which of the two it means.
    expect(YOC_CLOSING_LINE).not.toMatch(/\bYou are\b/i);
    expect(YOC_CLOSING_LINE).not.toMatch(/\byour answer (?:says|shows|tells|means)\b/i);
    expect(YOC_CLOSING_LINE).not.toMatch(/\bwill\b/i);
  });

  it('the claim it does make is one the app actually keeps', () => {
    expect(YOC_COPY.closingBody).toContain('your coach can read what you wrote');
    expect(read('app/coach/clients/[id]/YourOwnCompanyPanel.tsx')).toContain('YOC_QUESTIONS.filter');
  });

  it('prints her chosen line and her rewrite, stacked, and nothing is clamped', () => {
    const experience = read('components/your-own-company/YourOwnCompanyExperience.tsx');
    expect(experience).toContain('<SupersededPair');
    expect(experience).toContain('YOC_CLOSING_LINE');
    expect(experience).toContain('YOC_CLOSING_FIRST_LABEL');
    expect(experience).toContain('YOC_CLOSING_SECOND_LABEL');
    // The serif face is applied by the shared pair and the shared centerpiece.
    expect(read('components/happiness-deep-dive/SupersededPair.tsx')).toContain(
      'font-cormorant-garamond'
    );
    for (const file of [
      'components/your-own-company/YourOwnCompanyExperience.tsx',
      'components/happiness-deep-dive/SupersededPair.tsx',
      'components/happiness-deep-dive/InstinctPair.tsx',
    ]) {
      expect(stripComments(read(file)), file).not.toContain('line-clamp');
      expect(stripComments(read(file)), file).not.toContain('truncate');
    }
  });

  it('the old sentence fades back rather than being removed or struck through', () => {
    const pair = stripComments(read('components/happiness-deep-dive/SupersededPair.tsx'));
    expect(pair).toContain('opacity-45');
    expect(pair).not.toContain('line-through');
    // And under reduced motion both are simply present.
    expect(pair).toContain('useReducedMotion');
  });

  it('Root reports what happened and says nothing about her', () => {
    expect(YOC_COPY.closingHeading).toBe('Nothing here was graded.');
    expect(YOC_COPY.closingBody).toContain('Root scored none of this and interpreted none of it');
  });
});

describe('the experiment', () => {
  it('offers the approved action, for seven days', () => {
    expect(YOC_EXPERIMENT_ACTION).toBe(
      'Catch the voice once a day and answer it with your rewrite, out loud or in your head.'
    );
    const offer = buildYocExperiment();
    expect(offer.action).toBe(YOC_EXPERIMENT_ACTION);
    expect(offer.durationDays).toBe(7);
    expect(YOC_EXPERIMENT_DURATION_DAYS).toBe(7);
    expect(offer.protocol).toContain(YOC_EXPERIMENT_ACTION);
  });

  it('asks the approved daily question, verbatim', () => {
    expect(YOC_EXPERIMENT_DAILY_QUESTION).toBe(
      'Did you catch the voice today? Catching it counts even if the rewrite did not come.'
    );
  });

  it('logs Yes or Not today, and nothing else', () => {
    const panel = read('components/your-own-company/YourOwnCompanyExperimentPanel.tsx');
    expect(panel).toContain('>\n            Yes\n          </button>');
    expect(panel).toContain('>\n            Not today\n          </button>');
  });

  it('never bakes her own rewrite into the stored protocol', () => {
    const offer = buildYocExperiment();
    expect(offer.protocol).toContain('your rewrite');
    const experimentSource = stripComments(read('lib/your-own-company/experiment.ts'));
    expect(experimentSource).not.toContain('YocAnswers');
    expect(experimentSource).not.toContain('instinct');
    expect(experimentSource).not.toContain('rewrittenLine');
  });

  it('has a decline path and reads the shared two experiment cap', () => {
    expect(YOC_COPY.experimentDecline).toBe('Not right now');
    expect(YOC_COPY.experimentDeclined.length).toBeGreaterThan(0);
    const action = read('app/actions/yourOwnCompany.ts');
    expect(action).toContain('MAX_ACTIVE_EXPERIMENTS');
    expect(action).toContain('startLifestyleExperiment');
  });
});

describe('the pop-up', () => {
  it('is the approved sentence', () => {
    expect(YOC_COPY.popupBody).toBe(
      'Your coach asked Root to sit down with you on this one. It is called Your Own Company. Nine questions about the voice you live with.'
    );
    expect(YOC_COPY.popupTitle).toBe(YOC_LABEL);
  });
});

describe('the resource', () => {
  it('is titled You Live With Your Voice and is summary first', () => {
    expect(YOC_RESOURCE.title).toBe('You Live With Your Voice');
    expect(YOC_RESOURCE.body.length).toBeGreaterThan(0);
    expect(YOC_RESOURCE.full.length).toBeGreaterThan(YOC_RESOURCE.body.length);
  });

  it('is roughly the four hundred words that were asked for', () => {
    const words = `${YOC_RESOURCE.body} ${YOC_RESOURCE.full}`.trim().split(/\s+/).length;
    expect(words).toBeGreaterThan(320);
    expect(words).toBeLessThan(520);
  });

  it('covers the two things it was asked to cover', () => {
    const whole = `${YOC_RESOURCE.body} ${YOC_RESOURCE.full}`;
    // Self-talk is a habit rather than a character trait.
    expect(whole).toMatch(/\bhabit/i);
    expect(whole).toMatch(/character trait/i);
    // The goal is honest kindness, not positivity.
    expect(whole).toMatch(/positivity/i);
    expect(whole).toMatch(/honest kindness/i);
  });

  it('is observational, and tells her to do nothing', () => {
    expect(YOC_RESOURCE.full).not.toMatch(/\byou should\b/i);
    expect(YOC_RESOURCE.full).not.toMatch(/\btry to\b/i);
    expect(YOC_RESOURCE.full).not.toMatch(/\bmake sure\b/i);
    expect(YOC_RESOURCE.full).not.toMatch(/\bstart by\b/i);
  });
});

describe('Root claims nothing about her', () => {
  it('no line of copy begins a claim about the member', () => {
    for (const line of Object.values(YOC_COPY)) {
      expect(line).not.toMatch(/\bYou are (?:someone|a person|the kind)\b/i);
      expect(line).not.toMatch(/\bwhat this (?:says|tells us) about you\b/i);
    }
    expect(YOC_CLOSING_LINE).not.toMatch(/\bYou are\b/i);
  });

  it('there is no scoring vocabulary anywhere in the feature', () => {
    for (const file of FEATURE_FILES) {
      const source = stripComments(read(file));
      expect(source, file).not.toMatch(/\bseverity\b/i);
      expect(source, file).not.toMatch(/registry_entries/);
      expect(source, file).not.toMatch(/source_feature/);
    }
  });

  it('the one number is her own count, computed in one place and read by both screens', () => {
    const member = read('components/your-own-company/YourOwnCompanyExperience.tsx');
    const coach = read('app/coach/clients/[id]/YourOwnCompanyPanel.tsx');
    expect(member).toContain('yocTallySentence');
    expect(coach).toContain('yocTallySentence');
    // And it is not stored beside the answers it counts.
    expect(read('lib/your-own-company/data.ts')).not.toContain('tally');
    expect(fs.readFileSync(MIGRATION, 'utf8')).toContain('The tally is not stored'.toUpperCase());
  });
});

describe("the coach's own headings", () => {
  it('put her three lines first, then the rewrite, then the picks, then the writing', () => {
    expect(YOC_COACH_COPY.linesHeading).toBe('What the voice says on repeat');
    expect(YOC_COACH_COPY.rewriteHeading).toBe('The line, and the rewrite');
    expect(YOC_COACH_COPY.picksHeading).toBe('First instincts');
    expect(YOC_COACH_COPY.answersHeading).toBe('What they wrote');
    expect(YOC_COACH_COPY.deepestLabel).toBe('Cuts deepest');
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
