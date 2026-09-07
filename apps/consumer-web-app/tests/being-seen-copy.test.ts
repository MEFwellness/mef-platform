/**
 * Being Seen: the copy is the brief, word for word.
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
  BSN_QUESTIONS,
  BSN_CLOSING_KEY,
  BSN_COLUMN_KEY,
  BSN_OPENER_KEY,
} from '@/lib/being-seen/questions';
import {
  BSN_AREA,
  BSN_CLOSING_LABEL,
  BSN_CLOSING_LINE,
  BSN_COACH_COPY,
  BSN_COPY,
  BSN_HOLD_LABEL,
  BSN_INTRO_BODY_LINES,
  BSN_LABEL,
  BSN_RESOURCE,
  BSN_SECTIONS,
} from '@/lib/being-seen/copy';
import {
  BSN_EXPERIMENT_ACTION,
  BSN_EXPERIMENT_DAILY_QUESTION,
  buildBsnExperiment,
} from '@/lib/being-seen/experiment';
import { BSN_EXPERIMENT_DURATION_DAYS, BSN_ROUTE } from '@/lib/being-seen/constants';

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '../..');
const MIGRATION = path.join(REPO_ROOT, 'supabase/migrations/00000000000215_being_seen.sql');

/** Every file this feature owns, member facing or not. */
const FEATURE_FILES = [
  'lib/being-seen/constants.ts',
  'lib/being-seen/questions.ts',
  'lib/being-seen/copy.ts',
  'lib/being-seen/data.ts',
  'lib/being-seen/access.ts',
  'lib/being-seen/service.ts',
  'lib/being-seen/view.ts',
  'lib/being-seen/experiment.ts',
  'lib/being-seen/dailyLogsData.ts',
  'app/being-seen/page.tsx',
  'app/actions/beingSeen.ts',
  'components/being-seen/BeingSeenExperience.tsx',
  'components/being-seen/BeingSeenEntry.tsx',
  'components/being-seen/BeingSeenResource.tsx',
  'components/being-seen/BeingSeenExperimentPanel.tsx',
  'app/coach/clients/[id]/BeingSeenPanel.tsx',
];

/** The shared motion treatment, which this build also owns. */
const MOTION_FILES = [
  'lib/happiness-deep-dive/motion.ts',
  'components/happiness-deep-dive/AmbientDrift.tsx',
  'components/happiness-deep-dive/ChapterCard.tsx',
  'components/happiness-deep-dive/HoldRing.tsx',
  'components/happiness-deep-dive/QuestionStage.tsx',
  'components/happiness-deep-dive/ClosingCenterpiece.tsx',
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
  it('is Being Seen, under Happiness, on its own route', () => {
    expect(BSN_LABEL).toBe('Being Seen');
    expect(BSN_AREA).toBe('Happiness');
    expect(BSN_ROUTE).toBe('/being-seen');
  });

  it('never uses the medical title, in either form, anywhere in the feature or its migration', () => {
    const sources = [
      ...FEATURE_FILES.map(read),
      ...MOTION_FILES.map(read),
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
    expect(BSN_COPY.introTitle).toBe('Being Seen');
    expect(BSN_INTRO_BODY_LINES.join(' ')).toBe(
      'No scores, no right answers. Root has nine questions about the difference between being useful and being known. Fifteen to twenty minutes, somewhere quiet.'
    );
  });

  it('uses the shared typewriter component rather than a second one', () => {
    const experience = read('components/being-seen/BeingSeenExperience.tsx');
    expect(experience).toContain("import { IntroReveal } from '@/components/IntroReveal'");
    expect(experience).toContain('<IntroReveal');
  });
});

describe('the three screens and the nine questions', () => {
  it('are titled Invisible, Seen and Showing Yourself', () => {
    expect(BSN_SECTIONS.map((section) => section.title)).toEqual([
      'Invisible',
      'Seen',
      'Showing Yourself',
    ]);
  });

  it('are the approved prompts, in the approved order, three to a screen', () => {
    const APPROVED: Array<{ screen: 1 | 2 | 3; prompt: string }> = [
      {
        screen: 1,
        prompt:
          'What is something you do regularly that nobody notices unless it stops? How long has it been invisible?',
      },
      {
        screen: 1,
        prompt:
          'When you are in a room with the people closest to you, what part of you is present but never gets asked about?',
      },
      {
        screen: 1,
        prompt:
          'Think of a time recently you were praised. Was it for what you did, or for who you are? How could you tell the difference?',
      },
      {
        screen: 2,
        prompt:
          'Who in your life could describe you accurately? Not your roles, not your responsibilities, you. What would they say?',
      },
      {
        screen: 2,
        prompt:
          'Describe a moment, from any point in your life, when you felt completely seen. Who was it, and what did they do that made it different?',
      },
      {
        screen: 2,
        prompt:
          'When someone gives you a genuine compliment, what do you do with it? Trace what happens in the first five seconds.',
      },
      {
        screen: 3,
        prompt:
          'What is something true about you that the people around you do not know? Not because it is a secret, but because you have never offered it.',
      },
      {
        screen: 3,
        prompt:
          'What do you think would happen if you let yourself be more visible? Opinions, needs, all of it. What is the risk you are avoiding?',
      },
      {
        screen: 3,
        prompt:
          'Write down one thing you wish someone would notice about you without being told. Root will keep it between you and your coach.',
      },
    ];

    expect(BSN_QUESTIONS).toHaveLength(9);
    expect(
      BSN_QUESTIONS.map((question) => ({ screen: question.screen, prompt: question.prompt }))
    ).toEqual(APPROVED);
  });

  it('question six, and only question six, holds for exactly five seconds', () => {
    expect(BSN_QUESTIONS[5]?.holdSeconds).toBe(5);
    expect(BSN_QUESTIONS.filter((question) => question.holdSeconds !== undefined)).toHaveLength(1);
  });

  it('the ring says one thing that is true whether it fills or stands still', () => {
    expect(BSN_HOLD_LABEL).toBe(
      'Five seconds, the length of the moment you are about to describe.'
    );
    // It asks for nothing, so it still reads correctly under reduced
    // motion, where the writing box is already open beside it.
    expect(BSN_HOLD_LABEL).not.toMatch(/\bwait\b/i);
    expect(BSN_HOLD_LABEL).not.toMatch(/\bloading\b/i);
  });

  it('question nine is the one whose answer gets its own column, the one the closing prints, and the coach opener', () => {
    expect(BSN_QUESTIONS[8]?.key).toBe(BSN_COLUMN_KEY);
    expect(BSN_QUESTIONS[8]?.key).toBe(BSN_CLOSING_KEY);
    expect(BSN_QUESTIONS[8]?.key).toBe(BSN_OPENER_KEY);
  });

  it('every one of them is open writing, with no options and no character cap', () => {
    const experience = read('components/being-seen/BeingSeenExperience.tsx');
    expect(experience).toContain('<textarea');
    expect(experience).not.toContain('maxLength');
    expect(experience).not.toContain('role="radio"');
    expect(experience).not.toContain('role="checkbox"');
  });
});

describe('the closing', () => {
  it('is the approved sentence, exactly', () => {
    expect(BSN_CLOSING_LINE).toBe('Now two people know. That is how being seen starts.');
    expect(BSN_CLOSING_LABEL).toBe('What you wish someone would see');
  });

  it('the fixed line claims nothing specific about this member', () => {
    // "Two people know" is true by construction: she wrote it and her coach
    // reads it. It is not a claim about what she wrote or about who she is.
    expect(BSN_CLOSING_LINE).not.toMatch(/\bYou are\b/i);
    expect(BSN_CLOSING_LINE).not.toMatch(/\byour answer (?:says|shows|tells|means)\b/i);
    expect(BSN_CLOSING_LINE).not.toMatch(/\binvisible\b/i);
  });

  it('the claim it does make is one the app actually keeps', () => {
    // Two people: her, and the coach whose own client screen this lands on
    // the moment she finishes. Both halves are real code, not a promise.
    expect(BSN_COPY.closingBody).toContain('your coach can read what you wrote');
    expect(read('app/coach/clients/[id]/BeingSeenPanel.tsx')).toContain('BSN_QUESTIONS.filter');
  });

  it('prints her own question nine answer in the serif face under that label', () => {
    const experience = read('components/being-seen/BeingSeenExperience.tsx');
    expect(experience).toContain('BSN_CLOSING_KEY');
    expect(experience).toContain('BSN_CLOSING_LINE');
    expect(experience).toContain('BSN_CLOSING_LABEL');
    // The serif face is applied by the shared centerpiece rather than here.
    expect(read('components/happiness-deep-dive/ClosingCenterpiece.tsx')).toContain(
      'font-cormorant-garamond'
    );
    // Nothing clamps, truncates or scrolls her writing away.
    expect(stripComments(experience)).not.toContain('line-clamp');
    expect(stripComments(experience)).not.toContain('truncate');
    expect(stripComments(read('components/happiness-deep-dive/ClosingCenterpiece.tsx'))).not.toContain(
      'line-clamp'
    );
  });

  it('Root reports what happened and says nothing about her', () => {
    expect(BSN_COPY.closingHeading).toBe('Nothing here was graded.');
    expect(BSN_COPY.closingBody).toContain('Root scored none of this and interpreted none of it');
  });
});

describe('the experiment', () => {
  it('offers the approved action, for seven days', () => {
    expect(BSN_EXPERIMENT_ACTION).toBe(
      'Offer one uninvited piece of yourself this week: an opinion, a preference, a story, without being asked first.'
    );
    const offer = buildBsnExperiment();
    expect(offer.action).toBe(BSN_EXPERIMENT_ACTION);
    expect(offer.durationDays).toBe(7);
    expect(BSN_EXPERIMENT_DURATION_DAYS).toBe(7);
    expect(offer.protocol).toContain(BSN_EXPERIMENT_ACTION);
  });

  it('asks the approved daily question, verbatim', () => {
    expect(BSN_EXPERIMENT_DAILY_QUESTION).toBe(
      'Did you show something today you would usually keep in? Noticing counts either way.'
    );
  });

  it('logs Yes or Not today, and nothing else', () => {
    const panel = read('components/being-seen/BeingSeenExperimentPanel.tsx');
    expect(panel).toContain('>\n            Yes\n          </button>');
    expect(panel).toContain('>\n            Not today\n          </button>');
  });

  it('never bakes her own answer into the stored protocol', () => {
    const offer = buildBsnExperiment();
    expect(offer.protocol).toContain('uninvited piece of yourself');
    const experimentSource = stripComments(read('lib/being-seen/experiment.ts'));
    expect(experimentSource).not.toContain('answers');
    expect(experimentSource).not.toContain('BsnAnswers');
  });

  it('has a decline path and reads the shared two experiment cap', () => {
    expect(BSN_COPY.experimentDecline).toBe('Not right now');
    expect(BSN_COPY.experimentDeclined.length).toBeGreaterThan(0);
    const action = read('app/actions/beingSeen.ts');
    expect(action).toContain('MAX_ACTIVE_EXPERIMENTS');
    expect(action).toContain('startLifestyleExperiment');
  });
});

describe('the pop-up', () => {
  it('is the approved sentence', () => {
    expect(BSN_COPY.popupBody).toBe(
      'Your coach asked Root to sit down with you on this one. It is called Being Seen. Nine questions about the difference between being useful and being known.'
    );
    expect(BSN_COPY.popupTitle).toBe(BSN_LABEL);
  });
});

describe('the resource', () => {
  it('is titled Useful Is Not the Same as Known and is summary first', () => {
    expect(BSN_RESOURCE.title).toBe('Useful Is Not the Same as Known');
    expect(BSN_RESOURCE.body.length).toBeGreaterThan(0);
    expect(BSN_RESOURCE.full.length).toBeGreaterThan(BSN_RESOURCE.body.length);
  });

  it('is roughly the length that was asked for, not a paragraph and not an essay', () => {
    const words = `${BSN_RESOURCE.body} ${BSN_RESOURCE.full}`.trim().split(/\s+/).length;
    expect(words).toBeGreaterThan(320);
    expect(words).toBeLessThan(560);
  });

  it('is about competence buying appreciation rather than intimacy, and about visibility as a skill', () => {
    const whole = `${BSN_RESOURCE.body} ${BSN_RESOURCE.full}`;
    expect(whole).toMatch(/\bcompeten|\breliab/i);
    expect(whole).toMatch(/\bappreciat/i);
    expect(whole).toMatch(/\bintimacy\b/i);
    expect(whole).toMatch(/\bskill\b/i);
    expect(whole).toMatch(/\bvisibilit/i);
  });

  it('tells her to do nothing, because the experiment beside it is the only ask', () => {
    expect(BSN_RESOURCE.full).not.toMatch(/\byou should\b/i);
    expect(BSN_RESOURCE.full).not.toMatch(/\btry to\b/i);
    expect(BSN_RESOURCE.full).not.toMatch(/\bmake sure\b/i);
    expect(BSN_RESOURCE.full).not.toMatch(/\bstart by\b/i);
  });
});

describe('Root claims nothing about her', () => {
  it('no line of copy begins a claim about the member', () => {
    for (const line of Object.values(BSN_COPY)) {
      expect(line).not.toMatch(/\bYou are (?:someone|a person|the kind)\b/i);
      expect(line).not.toMatch(/\bwhat this (?:says|tells us) about you\b/i);
    }
    expect(BSN_CLOSING_LINE).not.toMatch(/\bYou are\b/i);
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

describe("the coach's own headings", () => {
  it('open the session with question nine and then print all nine', () => {
    expect(BSN_COACH_COPY.openerHeading).toBe('Open the session with this');
    expect(BSN_COACH_COPY.answersHeading).toBe('What they wrote');
  });
});

describe('no em dash', () => {
  it('appears nowhere in this feature, the shared motion treatment, or the migration', () => {
    for (const file of [...FEATURE_FILES, ...MOTION_FILES]) {
      expect(read(file), `${file} contains an em dash`).not.toContain('—');
    }
    expect(fs.readFileSync(MIGRATION, 'utf8')).not.toContain('—');
  });
});
