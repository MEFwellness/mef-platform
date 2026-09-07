/**
 * The Weight of Yes: the copy is the brief, word for word.
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
  TWOY_QUESTIONS,
  TWOY_CLOSING_KEY,
  TWOY_COLUMN_KEY,
  TWOY_FOLLOW_UP_KEY,
  TWOY_FOLLOW_UP_PREFIX,
  TWOY_FOLLOW_UP_SUFFIX,
  TWOY_OPENER_KEY,
  followUpPromptFor,
} from '@/lib/the-weight-of-yes/questions';
import {
  TWOY_AREA,
  TWOY_CLOSING_LABEL,
  TWOY_CLOSING_LINE,
  TWOY_COACH_COPY,
  TWOY_COPY,
  TWOY_INTRO_BODY_LINES,
  TWOY_LABEL,
  TWOY_RESOURCE,
  TWOY_SECTIONS,
} from '@/lib/the-weight-of-yes/copy';
import {
  TWOY_EXPERIMENT_ACTION,
  TWOY_EXPERIMENT_DAILY_QUESTION,
  buildTwoyExperiment,
} from '@/lib/the-weight-of-yes/experiment';
import { TWOY_EXPERIMENT_DURATION_DAYS, TWOY_ROUTE } from '@/lib/the-weight-of-yes/constants';

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '../..');
const MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/00000000000214_the_weight_of_yes.sql'
);

/** Every file this feature owns, member facing or not. */
const FEATURE_FILES = [
  'lib/the-weight-of-yes/constants.ts',
  'lib/the-weight-of-yes/questions.ts',
  'lib/the-weight-of-yes/copy.ts',
  'lib/the-weight-of-yes/data.ts',
  'lib/the-weight-of-yes/access.ts',
  'lib/the-weight-of-yes/service.ts',
  'lib/the-weight-of-yes/view.ts',
  'lib/the-weight-of-yes/followUp.ts',
  'lib/the-weight-of-yes/experiment.ts',
  'lib/the-weight-of-yes/dailyLogsData.ts',
  'app/the-weight-of-yes/page.tsx',
  'app/actions/theWeightOfYes.ts',
  'components/the-weight-of-yes/TheWeightOfYesExperience.tsx',
  'components/the-weight-of-yes/TheWeightOfYesEntry.tsx',
  'components/the-weight-of-yes/TheWeightOfYesResource.tsx',
  'components/the-weight-of-yes/TheWeightOfYesExperimentPanel.tsx',
  'app/coach/clients/[id]/TheWeightOfYesPanel.tsx',
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
  it('is The Weight of Yes, under Happiness, on its own route', () => {
    expect(TWOY_LABEL).toBe('The Weight of Yes');
    expect(TWOY_AREA).toBe('Happiness');
    expect(TWOY_ROUTE).toBe('/the-weight-of-yes');
  });

  it('never uses the medical title, in either form, anywhere in the feature or its migration', () => {
    const sources = [...FEATURE_FILES.map(read), fs.readFileSync(MIGRATION, 'utf8')];
    for (const source of sources) {
      expect(source).not.toMatch(/\bDoctors?\b/i);
      expect(source).not.toMatch(/\bDr\./i);
    }
  });
});

describe('the intro', () => {
  it('is the approved headline and body, and the line split changes not one word', () => {
    expect(TWOY_COPY.introTitle).toBe('The Weight of Yes');
    expect(TWOY_INTRO_BODY_LINES.join(' ')).toBe(
      'No scores, no right answers. Root has nine questions about the yeses you give away and what each one weighs. Fifteen to twenty minutes, somewhere quiet.'
    );
  });

  it('uses the shared typewriter component rather than a second one', () => {
    const experience = read('components/the-weight-of-yes/TheWeightOfYesExperience.tsx');
    expect(experience).toContain("import { IntroReveal } from '@/components/IntroReveal'");
    expect(experience).toContain('<IntroReveal');
  });
});

describe('the three screens and the nine questions', () => {
  it('are titled The Automatic Yes, The Cost and The No', () => {
    expect(TWOY_SECTIONS.map((section) => section.title)).toEqual([
      'The Automatic Yes',
      'The Cost',
      'The No',
    ]);
  });

  it('are the approved prompts, in the approved order, three to a screen', () => {
    const APPROVED: Array<{ screen: 1 | 2 | 3; prompt: string }> = [
      {
        screen: 1,
        prompt:
          'Think of the last time you said yes when everything in you wanted to say no. What was the request, and what did the yes cost you?',
      },
      {
        screen: 1,
        prompt:
          'What do you imagine happens if you say no? Play the movie forward. How much of that movie has ever actually happened?',
      },
      {
        screen: 1,
        prompt:
          'Who in your life is easiest to say no to, and who is hardest? What is the difference between them?',
      },
      {
        screen: 2,
        prompt:
          'When you say yes to something you do not want, where does it show up in your body afterward? Describe the feeling and where it sits.',
      },
      {
        screen: 2,
        prompt:
          'What did your yes cost someone else recently? Think of a time your overcommitment meant less of you for something or someone that mattered more.',
      },
      {
        screen: 2,
        prompt: 'What were you taught, growing up, about what happens to people who say no?',
      },
      {
        screen: 3,
        prompt:
          'Write the no you have been needing to say. The actual words, to the actual person. Nobody sees this but you and your coach.',
      },
      {
        screen: 3,
        prompt:
          'What is the kindest true version of that no? Rewrite it the way you could actually say it out loud.',
      },
      {
        screen: 3,
        prompt: 'What would become possible in your life if that no was said and survived?',
      },
    ];

    expect(TWOY_QUESTIONS).toHaveLength(9);
    expect(
      TWOY_QUESTIONS.map((question) => ({ screen: question.screen, prompt: question.prompt }))
    ).toEqual(APPROVED);
  });

  it('question one is the one that adapts, and its follow-up wording is the approved sentence', () => {
    expect(TWOY_QUESTIONS[0]?.key).toBe(TWOY_FOLLOW_UP_KEY);
    expect(followUpPromptFor('an hour on Sunday morning to myself')).toBe(
      'Last time, you told Root you could ask someone for this: an hour on Sunday morning to myself. Did you ask? What happened, or what stopped you?'
    );
    expect(TWOY_FOLLOW_UP_PREFIX).toBe('Last time, you told Root you could ask someone for this: ');
    expect(TWOY_FOLLOW_UP_SUFFIX).toBe('Did you ask? What happened, or what stopped you?');
  });

  it('question eight is the one whose answer gets its own column, and the one the closing prints', () => {
    expect(TWOY_QUESTIONS[7]?.key).toBe(TWOY_COLUMN_KEY);
    expect(TWOY_QUESTIONS[7]?.key).toBe(TWOY_CLOSING_KEY);
  });

  it('question seven is the one the coach card opens with', () => {
    expect(TWOY_QUESTIONS[6]?.key).toBe(TWOY_OPENER_KEY);
    expect(TWOY_OPENER_KEY).not.toBe(TWOY_CLOSING_KEY);
  });

  it('every one of them is open writing, with no options and no character cap', () => {
    const experience = read('components/the-weight-of-yes/TheWeightOfYesExperience.tsx');
    expect(experience).toContain('<textarea');
    expect(experience).not.toContain('maxLength');
    expect(experience).not.toContain('role="radio"');
    expect(experience).not.toContain('role="checkbox"');
  });
});

describe('the closing', () => {
  it('is the approved sentence, exactly', () => {
    expect(TWOY_CLOSING_LINE).toBe('A no to them is a yes to you. You already wrote it.');
    expect(TWOY_CLOSING_LABEL).toBe('Your no, in your own words');
  });

  it('the fixed line claims nothing specific about this member', () => {
    // It says what a no is for, and that she has already written one. Both
    // are true of anybody who reached this screen. Root does not tell her
    // what her no means, because the line directly above it is her own no
    // saying exactly that.
    expect(TWOY_CLOSING_LINE).not.toMatch(/\bYou are\b/i);
    expect(TWOY_CLOSING_LINE).not.toMatch(/\byour no (?:says|shows|tells|means)\b/i);
    expect(TWOY_CLOSING_LINE).not.toMatch(/\bpeople ?-?pleas/i);
  });

  it('prints her own question eight rewrite in the serif face under that label', () => {
    const experience = read('components/the-weight-of-yes/TheWeightOfYesExperience.tsx');
    expect(experience).toContain('TWOY_CLOSING_KEY');
    expect(experience).toContain('TWOY_CLOSING_LINE');
    expect(experience).toContain('TWOY_CLOSING_LABEL');
    expect(experience).toContain('font-cormorant-garamond');
    // Nothing clamps, truncates or scrolls her writing away.
    expect(stripComments(experience)).not.toContain('line-clamp');
    expect(stripComments(experience)).not.toContain('truncate');
  });

  it('Root reports what happened and says nothing about her', () => {
    expect(TWOY_COPY.closingHeading).toBe('Nothing here was graded.');
    expect(TWOY_COPY.closingBody).toContain('Root scored none of this and interpreted none of it');
    expect(TWOY_COPY.closingBody).toContain('your coach can read what you wrote');
  });
});

describe('the experiment', () => {
  it('offers the approved action, for seven days', () => {
    expect(TWOY_EXPERIMENT_ACTION).toBe('Say one small no this week. Any size counts.');
    const offer = buildTwoyExperiment();
    expect(offer.action).toBe(TWOY_EXPERIMENT_ACTION);
    expect(offer.durationDays).toBe(7);
    expect(TWOY_EXPERIMENT_DURATION_DAYS).toBe(7);
    expect(offer.protocol).toContain(TWOY_EXPERIMENT_ACTION);
  });

  it('asks the approved daily question, verbatim', () => {
    expect(TWOY_EXPERIMENT_DAILY_QUESTION).toBe(
      'Did you say a no today, or swallow one? Either answer counts as noticing.'
    );
  });

  it('logs Yes or Not today, and nothing else', () => {
    const panel = read('components/the-weight-of-yes/TheWeightOfYesExperimentPanel.tsx');
    expect(panel).toContain('>\n            Yes\n          </button>');
    expect(panel).toContain('>\n            Not today\n          </button>');
  });

  it('never bakes her own answer into the stored protocol', () => {
    const offer = buildTwoyExperiment();
    expect(offer.protocol).toContain('one small no');
    const experimentSource = stripComments(read('lib/the-weight-of-yes/experiment.ts'));
    expect(experimentSource).not.toContain('answers');
    expect(experimentSource).not.toContain('TwoyAnswers');
  });

  it('has a decline path and reads the shared two experiment cap', () => {
    expect(TWOY_COPY.experimentDecline).toBe('Not right now');
    expect(TWOY_COPY.experimentDeclined.length).toBeGreaterThan(0);
    const action = read('app/actions/theWeightOfYes.ts');
    expect(action).toContain('MAX_ACTIVE_EXPERIMENTS');
    expect(action).toContain('startLifestyleExperiment');
  });
});

describe('the pop-up', () => {
  it('is the approved sentence', () => {
    expect(TWOY_COPY.popupBody).toBe(
      'Your coach asked Root to sit down with you on this one. It is called The Weight of Yes. Nine questions about the yeses you give away.'
    );
    expect(TWOY_COPY.popupTitle).toBe(TWOY_LABEL);
  });
});

describe('the resource', () => {
  it('is titled No Is a Complete Sentence and is summary first', () => {
    expect(TWOY_RESOURCE.title).toBe('No Is a Complete Sentence');
    expect(TWOY_RESOURCE.body.length).toBeGreaterThan(0);
    expect(TWOY_RESOURCE.full.length).toBeGreaterThan(TWOY_RESOURCE.body.length);
  });

  it('is roughly the length that was asked for, not a paragraph and not an essay', () => {
    const words = `${TWOY_RESOURCE.body} ${TWOY_RESOURCE.full}`.trim().split(/\s+/).length;
    expect(words).toBeGreaterThan(320);
    expect(words).toBeLessThan(560);
  });

  it('is about every yes being a no to something else, and about kind beating soft', () => {
    const whole = `${TWOY_RESOURCE.body} ${TWOY_RESOURCE.full}`;
    expect(whole).toMatch(/\byes\b/i);
    expect(whole).toMatch(/\bresentment\b|\bresentful\b/i);
    expect(whole).toMatch(/\bkind\b/i);
    expect(whole).toMatch(/\bclear\b/i);
    expect(whole).toMatch(/\bsoft(?:ness)?\b/i);
  });

  it('tells her to do nothing, because the experiment beside it is the only ask', () => {
    expect(TWOY_RESOURCE.full).not.toMatch(/\byou should\b/i);
    expect(TWOY_RESOURCE.full).not.toMatch(/\btry to\b/i);
    expect(TWOY_RESOURCE.full).not.toMatch(/\bmake sure\b/i);
    expect(TWOY_RESOURCE.full).not.toMatch(/\bstart by\b/i);
  });
});

describe('Root claims nothing about her', () => {
  it('no line of copy begins a claim about the member', () => {
    for (const line of Object.values(TWOY_COPY)) {
      expect(line).not.toMatch(/\bYou are (?:someone|a person|the kind)\b/i);
      expect(line).not.toMatch(/\bwhat this (?:says|tells us) about you\b/i);
    }
    expect(TWOY_CLOSING_LINE).not.toMatch(/\bYou are\b/i);
  });

  it('there is no scoring vocabulary anywhere in the feature', () => {
    for (const file of FEATURE_FILES) {
      const source = stripComments(read(file));
      expect(source).not.toMatch(/\bseverity\b/i);
      expect(source).not.toMatch(/registry_entries/);
      expect(source).not.toMatch(/source_feature/);
    }
  });
});

describe("the coach's own strings are kept apart", () => {
  it('name the earlier experience only where a coach reads them', () => {
    expect(TWOY_COACH_COPY.followUpHeading).toBe('Follow-up from The Giving Ledger');
    expect(TWOY_COACH_COPY.openerHeading).toBe('Open the session with this');
    expect(TWOY_COACH_COPY.answersHeading).toBe('What they wrote');
  });
});

describe('no em dash', () => {
  it('appears nowhere in this feature, including inside the migration', () => {
    for (const file of FEATURE_FILES) {
      expect(read(file), `${file} contains an em dash`).not.toContain('—');
    }
    expect(fs.readFileSync(MIGRATION, 'utf8')).not.toContain('—');
  });
});
