/**
 * The Giving Ledger: the copy is the brief, word for word.
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
  TGL_QUESTIONS,
  TGL_CLOSING_KEY,
  TGL_OPENER_KEY,
  TGL_DEPOSIT_KEY,
} from '@/lib/the-giving-ledger/questions';
import {
  TGL_AREA,
  TGL_CLOSING_LABEL,
  TGL_CLOSING_LINE,
  TGL_COPY,
  TGL_INTRO_BODY_LINES,
  TGL_LABEL,
  TGL_RESOURCE,
  TGL_SECTIONS,
} from '@/lib/the-giving-ledger/copy';
import {
  TGL_EXPERIMENT_ACTION,
  TGL_EXPERIMENT_DAILY_QUESTION,
  buildTglExperiment,
} from '@/lib/the-giving-ledger/experiment';
import { TGL_EXPERIMENT_DURATION_DAYS, TGL_ROUTE } from '@/lib/the-giving-ledger/constants';

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '../..');
const MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/00000000000213_the_giving_ledger.sql'
);

/** Every file this feature owns, member facing or not. */
const FEATURE_FILES = [
  'lib/the-giving-ledger/constants.ts',
  'lib/the-giving-ledger/questions.ts',
  'lib/the-giving-ledger/copy.ts',
  'lib/the-giving-ledger/data.ts',
  'lib/the-giving-ledger/access.ts',
  'lib/the-giving-ledger/service.ts',
  'lib/the-giving-ledger/view.ts',
  'lib/the-giving-ledger/experiment.ts',
  'lib/the-giving-ledger/dailyLogsData.ts',
  'app/the-giving-ledger/page.tsx',
  'app/actions/theGivingLedger.ts',
  'components/the-giving-ledger/TheGivingLedgerExperience.tsx',
  'components/the-giving-ledger/TheGivingLedgerEntry.tsx',
  'components/the-giving-ledger/TheGivingLedgerResource.tsx',
  'components/the-giving-ledger/TheGivingLedgerExperimentPanel.tsx',
  'app/coach/clients/[id]/TheGivingLedgerPanel.tsx',
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
  it('is The Giving Ledger, under Happiness, on its own route', () => {
    expect(TGL_LABEL).toBe('The Giving Ledger');
    expect(TGL_AREA).toBe('Happiness');
    expect(TGL_ROUTE).toBe('/the-giving-ledger');
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
    expect(TGL_COPY.introTitle).toBe('The Giving Ledger');
    expect(TGL_INTRO_BODY_LINES.join(' ')).toBe(
      'No scores, no right answers. Root has nine questions about where your energy goes and what actually comes back. Nobody keeps this ledger until someone asks them to. Fifteen to twenty minutes, somewhere quiet.'
    );
  });

  it('uses the shared typewriter component rather than a second one', () => {
    const experience = read('components/the-giving-ledger/TheGivingLedgerExperience.tsx');
    expect(experience).toContain("import { IntroReveal } from '@/components/IntroReveal'");
    expect(experience).toContain('<IntroReveal');
  });
});

describe('the three screens and the nine questions', () => {
  it('are titled What Goes Out, What Comes Back and The Balance', () => {
    expect(TGL_SECTIONS.map((section) => section.title)).toEqual([
      'What Goes Out',
      'What Comes Back',
      'The Balance',
    ]);
  });

  it('are the approved prompts, in the approved order, three to a screen', () => {
    const APPROVED: Array<{ screen: 1 | 2 | 3; prompt: string }> = [
      {
        screen: 1,
        prompt:
          'List the people and things that get your energy in a typical week. Next to each one, write roughly how much of you it gets.',
      },
      {
        screen: 1,
        prompt:
          'Look at your list. Which of these did you choose, and which did you inherit or drift into without ever deciding?',
      },
      {
        screen: 1,
        prompt:
          'Which one takes more than it used to? When did that change, and did anyone ever ask you if it could?',
      },
      {
        screen: 2,
        prompt:
          'Who or what reliably gives you energy back? What does that return actually feel like in your body?',
      },
      {
        screen: 2,
        prompt:
          'Think of one relationship where giving feels light. What makes it different from the ones that drain you?',
      },
      {
        screen: 2,
        prompt:
          'Where do you keep giving even though nothing has come back for a long time? What keeps you giving there?',
      },
      {
        screen: 3,
        prompt:
          'If your energy were money, where are you overpaying? What would a fair price look like?',
      },
      {
        screen: 3,
        prompt:
          'Name one deposit you could ask for this week: something specific a person in your life could do that would put energy back into you.',
      },
      {
        screen: 3,
        prompt:
          'Read back over what you wrote tonight. Write one sentence about what your ledger is telling you.',
      },
    ];

    expect(TGL_QUESTIONS).toHaveLength(9);
    expect(
      TGL_QUESTIONS.map((question) => ({ screen: question.screen, prompt: question.prompt }))
    ).toEqual(APPROVED);
  });

  it('question eight is the one whose answer gets its own column', () => {
    expect(TGL_QUESTIONS[7]?.key).toBe(TGL_DEPOSIT_KEY);
  });

  it('question six is the one the coach card opens with', () => {
    expect(TGL_QUESTIONS[5]?.key).toBe(TGL_OPENER_KEY);
  });

  it('question nine is the sentence the closing screen prints', () => {
    expect(TGL_QUESTIONS[8]?.key).toBe(TGL_CLOSING_KEY);
  });

  it('the opener, the column and the closing sentence are three different questions', () => {
    expect(new Set([TGL_OPENER_KEY, TGL_DEPOSIT_KEY, TGL_CLOSING_KEY]).size).toBe(3);
  });

  it('every one of them is open writing, with no options and no character cap', () => {
    // The type has no options field and no maxLength field at all, so the
    // only way a multiple choice could arrive here is a schema change. This
    // asserts on the rendered control instead, which is what she touches.
    const experience = read('components/the-giving-ledger/TheGivingLedgerExperience.tsx');
    expect(experience).toContain('<textarea');
    expect(experience).not.toContain('maxLength');
    expect(experience).not.toContain('role="radio"');
    expect(experience).not.toContain('role="checkbox"');
  });
});

describe('the closing', () => {
  it('is the approved sentence, exactly', () => {
    expect(TGL_CLOSING_LINE).toBe('You keep the ledger. You get to change it.');
    expect(TGL_CLOSING_LABEL).toBe('What your ledger says');
  });

  it('the fixed line claims nothing specific about this member', () => {
    // It says who the ledger belongs to and that it can be changed, which
    // is true of anybody who answered these nine questions. Root does not
    // tell her what her ledger says, because the line directly above it is
    // her own sentence saying exactly that.
    expect(TGL_CLOSING_LINE).not.toMatch(/\bYou are\b/i);
    expect(TGL_CLOSING_LINE).not.toMatch(/\byour ledger (?:says|shows|tells)\b/i);
    expect(TGL_CLOSING_LINE).not.toMatch(/\bgive too much\b|\bover-?giv/i);
  });

  it('prints her own question nine sentence in the serif face under that label', () => {
    const experience = read('components/the-giving-ledger/TheGivingLedgerExperience.tsx');
    expect(experience).toContain('TGL_CLOSING_KEY');
    expect(experience).toContain('TGL_CLOSING_LINE');
    expect(experience).toContain('TGL_CLOSING_LABEL');
    expect(experience).toContain('font-cormorant-garamond');
    // Nothing clamps, truncates or scrolls her writing away. Asserted on
    // the code with the prose stripped out, because this file's own
    // comments describe the rule in the same words the classes would use.
    expect(stripComments(experience)).not.toContain('line-clamp');
    expect(stripComments(experience)).not.toContain('truncate');
  });

  it('Root reports what happened and says nothing about her', () => {
    expect(TGL_COPY.closingHeading).toBe('Nothing here was added up.');
    expect(TGL_COPY.closingBody).toContain('Root scored none of this and interpreted none of it');
    expect(TGL_COPY.closingBody).toContain('your coach can read what you wrote');
  });
});

describe('the experiment', () => {
  it('offers the approved action, for seven days', () => {
    expect(TGL_EXPERIMENT_ACTION).toBe(
      'Once this week, actually ask for the deposit you named. Say the words out loud to that person.'
    );
    const offer = buildTglExperiment();
    expect(offer.action).toBe(TGL_EXPERIMENT_ACTION);
    expect(offer.durationDays).toBe(7);
    expect(TGL_EXPERIMENT_DURATION_DAYS).toBe(7);
    expect(offer.protocol).toContain(TGL_EXPERIMENT_ACTION);
  });

  it('asks the approved daily question, verbatim', () => {
    expect(TGL_EXPERIMENT_DAILY_QUESTION).toBe(
      'Did anything come back to you today? Name it, however small.'
    );
  });

  it('logs Yes or Not today, and nothing else', () => {
    const panel = read('components/the-giving-ledger/TheGivingLedgerExperimentPanel.tsx');
    expect(panel).toContain('>\n            Yes\n          </button>');
    expect(panel).toContain('>\n            Not today\n          </button>');
  });

  it('never bakes her own answer into the stored protocol', () => {
    // The protocol is read on a dashboard card days later. A sentence with
    // her question eight answer inside it would go stale the moment that
    // answer stopped being true, and the coach reads this column too.
    const offer = buildTglExperiment();
    expect(offer.protocol).toContain('the deposit you named');
    // Stripped of prose, this module never reads an answer at all: it takes
    // no argument carrying one and never indexes into a sheet.
    const experimentSource = stripComments(read('lib/the-giving-ledger/experiment.ts'));
    expect(experimentSource).not.toContain('answers');
    expect(experimentSource).not.toContain('TglAnswers');
  });

  it('has a decline path and reads the shared two experiment cap', () => {
    expect(TGL_COPY.experimentDecline).toBe('Not right now');
    expect(TGL_COPY.experimentDeclined.length).toBeGreaterThan(0);
    const action = read('app/actions/theGivingLedger.ts');
    expect(action).toContain('MAX_ACTIVE_EXPERIMENTS');
    expect(action).toContain('startLifestyleExperiment');
  });
});

describe('the pop-up', () => {
  it('is the approved sentence', () => {
    expect(TGL_COPY.popupBody).toBe(
      'Your coach asked Root to sit down with you on this one. It is called The Giving Ledger. Nine questions about where your energy goes and what comes back.'
    );
    expect(TGL_COPY.popupTitle).toBe(TGL_LABEL);
  });
});

describe('the resource', () => {
  it('is titled Giving Is Not a Debt and is summary first', () => {
    expect(TGL_RESOURCE.title).toBe('Giving Is Not a Debt');
    expect(TGL_RESOURCE.body.length).toBeGreaterThan(0);
    expect(TGL_RESOURCE.full.length).toBeGreaterThan(TGL_RESOURCE.body.length);
  });

  it('is roughly the length that was asked for, not a paragraph and not an essay', () => {
    const words = `${TGL_RESOURCE.body} ${TGL_RESOURCE.full}`.trim().split(/\s+/).length;
    expect(words).toBeGreaterThan(320);
    expect(words).toBeLessThan(520);
  });

  it('is about hearing other needs as a debt, and about balanced exchange', () => {
    const whole = `${TGL_RESOURCE.body} ${TGL_RESOURCE.full}`;
    expect(whole).toMatch(/\bdebt\b|\bowed?\b|\bledger\b|\bbalance\b/i);
    expect(whole).toMatch(/\bexchange\b/i);
    expect(whole).toMatch(/\basking\b|\brequest\b/i);
  });

  it('tells her to do nothing, because the experiment beside it is the only ask', () => {
    // Observational, not prescriptive. These are the shapes a "here is what
    // you should do" paragraph takes, and none of them belongs in this
    // piece.
    expect(TGL_RESOURCE.full).not.toMatch(/\byou should\b/i);
    expect(TGL_RESOURCE.full).not.toMatch(/\btry to\b/i);
    expect(TGL_RESOURCE.full).not.toMatch(/\bmake sure\b/i);
    expect(TGL_RESOURCE.full).not.toMatch(/\bstart by\b/i);
  });
});

describe('Root claims nothing about her', () => {
  it('no line of copy begins a claim about the member', () => {
    for (const line of Object.values(TGL_COPY)) {
      expect(line).not.toMatch(/\bYou are (?:someone|a person|the kind)\b/i);
      expect(line).not.toMatch(/\bwhat this (?:says|tells us) about you\b/i);
    }
    expect(TGL_CLOSING_LINE).not.toMatch(/\bYou are\b/i);
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

describe('no em dash', () => {
  it('appears nowhere in this feature, including inside the migration', () => {
    for (const file of FEATURE_FILES) {
      expect(read(file), `${file} contains an em dash`).not.toContain('—');
    }
    expect(fs.readFileSync(MIGRATION, 'utf8')).not.toContain('—');
  });
});
