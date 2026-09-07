/**
 * Where Your Joy Lives: the copy is the brief, word for word.
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
 * rule: the words "Doctor" and "Dr." appear nowhere in this feature.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  WYJL_QUESTIONS,
  WYJL_CLOSING_PAIR_KEYS,
  WYJL_OPENER_KEY,
  WYJL_TWENTY_MINUTE_KEY,
} from '@/lib/where-your-joy-lives/questions';
import {
  WYJL_AREA,
  WYJL_CLOSING_LINE,
  WYJL_COPY,
  WYJL_INTRO_BODY_LINES,
  WYJL_LABEL,
  WYJL_RESOURCE,
  WYJL_SECTIONS,
} from '@/lib/where-your-joy-lives/copy';
import {
  WYJL_EXPERIMENT_ACTION,
  WYJL_EXPERIMENT_DAILY_QUESTION,
  buildWyjlExperiment,
} from '@/lib/where-your-joy-lives/experiment';
import {
  WYJL_EXPERIMENT_DURATION_DAYS,
  WYJL_ROUTE,
} from '@/lib/where-your-joy-lives/constants';

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '../..');
const MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/00000000000212_where_your_joy_lives.sql'
);

/** Every file this feature owns, member facing or not. */
const FEATURE_FILES = [
  'lib/where-your-joy-lives/constants.ts',
  'lib/where-your-joy-lives/questions.ts',
  'lib/where-your-joy-lives/copy.ts',
  'lib/where-your-joy-lives/data.ts',
  'lib/where-your-joy-lives/access.ts',
  'lib/where-your-joy-lives/service.ts',
  'lib/where-your-joy-lives/view.ts',
  'lib/where-your-joy-lives/experiment.ts',
  'lib/where-your-joy-lives/dailyLogsData.ts',
  'app/where-your-joy-lives/page.tsx',
  'app/actions/whereYourJoyLives.ts',
  'components/where-your-joy-lives/WhereYourJoyLivesExperience.tsx',
  'components/where-your-joy-lives/WhereYourJoyLivesEntry.tsx',
  'components/where-your-joy-lives/WhereYourJoyLivesResource.tsx',
  'components/where-your-joy-lives/WhereYourJoyLivesExperimentPanel.tsx',
  'app/coach/clients/[id]/WhereYourJoyLivesPanel.tsx',
];

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/**
 * The code with its prose removed.
 *
 * Several assertions below are about what the CODE does, and this
 * feature's files explain those same rules in comments using the same
 * words. Matching a rule's own description and calling it a violation is
 * how a source-scanning test reports a defect that is not there.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the name', () => {
  it('is Where Your Joy Lives, under Happiness, on its own route', () => {
    expect(WYJL_LABEL).toBe('Where Your Joy Lives');
    expect(WYJL_AREA).toBe('Happiness');
    expect(WYJL_ROUTE).toBe('/where-your-joy-lives');
  });

  it('never says Doctor or Dr. anywhere in the feature, including the migration', () => {
    const sources = [...FEATURE_FILES.map(read), fs.readFileSync(MIGRATION, 'utf8')];
    for (const source of sources) {
      expect(source).not.toMatch(/\bDoctors?\b/i);
      expect(source).not.toMatch(/\bDr\./i);
    }
  });
});

describe('the intro', () => {
  it('is the approved headline and body, and the line split changes not one word', () => {
    expect(WYJL_COPY.introTitle).toBe('Where Your Joy Lives');
    expect(WYJL_INTRO_BODY_LINES.join(' ')).toBe(
      'No scores and no right answers here either. Root has nine questions about what actually fills you. Most people have not been asked these in years. Fifteen to twenty minutes, somewhere quiet.'
    );
  });

  it('uses the shared typewriter component rather than a second one', () => {
    const experience = read('components/where-your-joy-lives/WhereYourJoyLivesExperience.tsx');
    expect(experience).toContain("import { IntroReveal } from '@/components/IntroReveal'");
    expect(experience).toContain('<IntroReveal');
  });
});

describe('the three screens and the nine questions', () => {
  it('are titled Remembering, Noticing and Making Room', () => {
    expect(WYJL_SECTIONS.map((section) => section.title)).toEqual([
      'Remembering',
      'Noticing',
      'Making Room',
    ]);
  });

  it('are the approved prompts, in the approved order, three to a screen', () => {
    const APPROVED: Array<{ screen: 1 | 2 | 3; prompt: string }> = [
      {
        screen: 1,
        prompt:
          'Think of a moment in the last month when you felt genuinely light, even briefly. Not relaxed, not relieved. Light. Where were you and what was happening?',
      },
      {
        screen: 1,
        prompt:
          'Now go further back. What did you love doing before life got this full? Describe yourself doing it. What did that version of you feel like?',
      },
      {
        screen: 1,
        prompt:
          'When you laugh hardest, who are you usually with? What is it about being around them?',
      },
      {
        screen: 2,
        prompt:
          'At the end of a long day, what do you usually reach for to feel better? After you do it, do you feel filled up, or just less empty? Be honest.',
      },
      {
        screen: 2,
        prompt:
          'What is something that always sounds like too much effort beforehand, but you are always glad you did afterward?',
      },
      {
        screen: 2,
        prompt:
          'Where in your week does time move fastest? What are you doing when you look up and an hour has vanished?',
      },
      {
        screen: 3,
        prompt:
          'If you had two hours next week that belonged to nobody but you, no guilt attached, and you had to spend them on joy rather than rest or catching up, what would you do?',
      },
      {
        screen: 3,
        prompt: 'What is the smallest version of that? Something that fits in twenty minutes.',
      },
      {
        screen: 3,
        prompt:
          'What usually talks you out of it? Write down what that voice says, word for word.',
      },
    ];

    expect(WYJL_QUESTIONS).toHaveLength(9);
    expect(WYJL_QUESTIONS.map((question) => ({ screen: question.screen, prompt: question.prompt })))
      .toEqual(APPROVED);
  });

  it('question eight is the one whose answer gets its own column', () => {
    expect(WYJL_QUESTIONS[7]?.key).toBe(WYJL_TWENTY_MINUTE_KEY);
  });

  it('question seven is the one the coach card opens with', () => {
    expect(WYJL_QUESTIONS[6]?.key).toBe(WYJL_OPENER_KEY);
  });

  it('the closing pair is question four and question six, in that order', () => {
    expect([...WYJL_CLOSING_PAIR_KEYS]).toEqual([
      WYJL_QUESTIONS[3]?.key,
      WYJL_QUESTIONS[5]?.key,
    ]);
  });

  it('every one of them is open writing, with no options and no character cap', () => {
    // The type has no options field and no maxLength field at all, so the
    // only way a multiple choice could arrive here is a schema change. This
    // asserts on the rendered control instead, which is what she touches.
    const experience = read('components/where-your-joy-lives/WhereYourJoyLivesExperience.tsx');
    expect(experience).toContain('<textarea');
    expect(experience).not.toContain('maxLength');
    expect(experience).not.toContain('role="radio"');
    expect(experience).not.toContain('role="checkbox"');
  });
});

describe('the closing', () => {
  it('is the approved sentence, exactly, and it names neither answer', () => {
    expect(WYJL_CLOSING_LINE).toBe(
      'One of these empties slower. One of these fills. You wrote both.'
    );
    // It says one of them does each thing and never says which. Root does
    // not know, and a version that pointed at either answer would be the
    // interpretation this experience exists without.
    expect(WYJL_CLOSING_LINE).not.toMatch(/\bthe first\b|\bthe second\b|\bthe left\b|\bthe right\b/i);
  });

  it('places her two answers in the serif face, each labelled with its own question', () => {
    // THE MARKUP MOVED, THE RULE DID NOT. The closing centerpiece is now
    // components/happiness-deep-dive/ClosingCenterpiece.tsx, shared by all
    // five Happiness deep-dives, so the serif face and the two column
    // layout are asserted there. What this template still owns, and what is
    // still asserted here, is WHICH two answers go in it and what labels
    // them.
    const experience = read('components/where-your-joy-lives/WhereYourJoyLivesExperience.tsx');
    expect(experience).toContain('WYJL_CLOSING_PAIR_KEYS');
    expect(experience).toContain('WYJL_CLOSING_LINE');
    expect(experience).toContain('layout="pair"');
    // The label is the question itself, not a word Root invented for it.
    expect(experience).toContain("questionFor(key)?.prompt");

    const centerpiece = read('components/happiness-deep-dive/ClosingCenterpiece.tsx');
    expect(centerpiece).toContain('font-cormorant-garamond');
    // Stacked on a phone, two columns from the medium breakpoint up.
    expect(centerpiece).toContain('md:grid-cols-2');
    // Nothing clamps, truncates or scrolls her writing away. Asserted on
    // the code with the prose stripped out, because these files' own
    // comments describe the rule in the same words the classes would use.
    expect(stripComments(experience)).not.toContain('line-clamp');
    expect(stripComments(experience)).not.toContain('truncate');
    expect(stripComments(centerpiece)).not.toContain('line-clamp');
    expect(stripComments(centerpiece)).not.toContain('truncate');
  });

  it('Root reports what happened and says nothing about her', () => {
    expect(WYJL_COPY.closingHeading).toBe('Nothing here was scored.');
    expect(WYJL_COPY.closingBody).toContain('Not one word of this was interpreted');
    expect(WYJL_COPY.closingBody).toContain('your coach can read what you wrote');
  });
});

describe('the experiment', () => {
  it('offers the approved action, for seven days', () => {
    expect(WYJL_EXPERIMENT_ACTION).toBe(
      'Do your twenty-minute version once this week. Put it in your calendar like an appointment that cannot be moved.'
    );
    const offer = buildWyjlExperiment();
    expect(offer.action).toBe(WYJL_EXPERIMENT_ACTION);
    expect(offer.durationDays).toBe(7);
    expect(WYJL_EXPERIMENT_DURATION_DAYS).toBe(7);
    expect(offer.protocol).toContain(WYJL_EXPERIMENT_ACTION);
  });

  it('asks the approved daily question, verbatim', () => {
    expect(WYJL_EXPERIMENT_DAILY_QUESTION).toBe(
      'Did you protect your twenty minutes today, or did the voice from question nine win?'
    );
  });

  it('logs Yes or Not today, and nothing else', () => {
    const panel = read(
      'components/where-your-joy-lives/WhereYourJoyLivesExperimentPanel.tsx'
    );
    expect(panel).toContain('>\n            Yes\n          </button>');
    expect(panel).toContain('>\n            Not today\n          </button>');
  });

  it('never bakes her own answer into the stored protocol', () => {
    // The protocol is read on a dashboard card days later. A sentence with
    // her question eight answer inside it would go stale the moment that
    // answer stopped being true, and the coach reads this column too.
    const offer = buildWyjlExperiment();
    expect(offer.protocol).toContain('your twenty-minute version');
    // Stripped of prose, this module never reads an answer at all: it takes
    // no argument carrying one and never indexes into a sheet.
    const experimentSource = stripComments(read('lib/where-your-joy-lives/experiment.ts'));
    expect(experimentSource).not.toContain('answers');
    expect(experimentSource).not.toContain('WyjlAnswers');
  });

  it('has a decline path and reads the shared two experiment cap', () => {
    expect(WYJL_COPY.experimentDecline).toBe('Not right now');
    expect(WYJL_COPY.experimentDeclined.length).toBeGreaterThan(0);
    const action = read('app/actions/whereYourJoyLives.ts');
    expect(action).toContain('MAX_ACTIVE_EXPERIMENTS');
    expect(action).toContain('startLifestyleExperiment');
  });
});

describe('the pop-up', () => {
  it('is the approved sentence', () => {
    expect(WYJL_COPY.popupBody).toBe(
      'Your coach asked Root to sit down with you again. This one is called Where Your Joy Lives. Nine questions, no scores, worth your time.'
    );
    expect(WYJL_COPY.popupTitle).toBe(WYJL_LABEL);
  });
});

describe('the resource', () => {
  it('is titled Relief Is Not Joy and is summary first', () => {
    expect(WYJL_RESOURCE.title).toBe('Relief Is Not Joy');
    expect(WYJL_RESOURCE.body.length).toBeGreaterThan(0);
    expect(WYJL_RESOURCE.full.length).toBeGreaterThan(WYJL_RESOURCE.body.length);
  });

  it('is roughly the length that was asked for, not a paragraph and not an essay', () => {
    const words = `${WYJL_RESOURCE.body} ${WYJL_RESOURCE.full}`.trim().split(/\s+/).length;
    expect(words).toBeGreaterThan(320);
    expect(words).toBeLessThan(520);
  });

  it('is about telling relief from joy in the body, which is what it promised', () => {
    const whole = `${WYJL_RESOURCE.body} ${WYJL_RESOURCE.full}`;
    expect(whole).toMatch(/numb/i);
    expect(whole).toMatch(/relief/i);
  });

  it('tells her to do nothing, because the experiment beside it is the only ask', () => {
    // Observational, not prescriptive. These are the shapes a "here is what
    // you should do" paragraph takes, and none of them belongs in this
    // piece.
    expect(WYJL_RESOURCE.full).not.toMatch(/\byou should\b/i);
    expect(WYJL_RESOURCE.full).not.toMatch(/\btry to\b/i);
    expect(WYJL_RESOURCE.full).not.toMatch(/\bmake sure\b/i);
    expect(WYJL_RESOURCE.full).not.toMatch(/\bstart by\b/i);
  });
});

describe('Root claims nothing about her', () => {
  it('no line of copy begins a claim about the member', () => {
    for (const line of Object.values(WYJL_COPY)) {
      expect(line).not.toMatch(/\bYou are (?:someone|a person|the kind)\b/i);
      expect(line).not.toMatch(/\bwhat this (?:says|tells us) about you\b/i);
    }
    expect(WYJL_CLOSING_LINE).not.toMatch(/\bYou are\b/i);
  });

  it('there is no scoring vocabulary anywhere in the feature', () => {
    for (const file of FEATURE_FILES) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toMatch(/\bseverity\b/i);
      expect(source).not.toMatch(/registry_entries/);
      expect(source).not.toMatch(/source_feature/);
    }
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
