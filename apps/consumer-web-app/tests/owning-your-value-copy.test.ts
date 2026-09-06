/**
 * Owning Your Value: the copy is the brief, word for word.
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
import { OYV_QUESTIONS, OYV_HELD_SENTENCE_KEY } from '@/lib/owning-your-value/questions';
import {
  OYV_AREA,
  OYV_COPY,
  OYV_INTRO_BODY_LINES,
  OYV_LABEL,
  OYV_RESOURCE,
  OYV_SECTIONS,
} from '@/lib/owning-your-value/copy';
import {
  OYV_EXPERIMENT_ACTION,
  OYV_EXPERIMENT_DAILY_QUESTION,
  buildOyvExperiment,
} from '@/lib/owning-your-value/experiment';
import { OYV_EXPERIMENT_DURATION_DAYS, OYV_ROUTE } from '@/lib/owning-your-value/constants';

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '../..');
const MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/00000000000211_owning_your_value.sql'
);

/** Every file this feature owns, member facing or not. */
const FEATURE_FILES = [
  'lib/owning-your-value/constants.ts',
  'lib/owning-your-value/questions.ts',
  'lib/owning-your-value/copy.ts',
  'lib/owning-your-value/data.ts',
  'lib/owning-your-value/access.ts',
  'lib/owning-your-value/service.ts',
  'lib/owning-your-value/view.ts',
  'lib/owning-your-value/experiment.ts',
  'lib/owning-your-value/dailyLogsData.ts',
  'app/owning-your-value/page.tsx',
  'app/actions/owningYourValue.ts',
  'components/owning-your-value/OwningYourValueExperience.tsx',
  'components/owning-your-value/OwningYourValueEntry.tsx',
  'components/owning-your-value/OwningYourValueResource.tsx',
  'components/owning-your-value/OwningYourValueExperimentPanel.tsx',
  'app/coach/clients/[id]/OwningYourValuePanel.tsx',
];

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

describe('the name', () => {
  it('is Owning Your Value, under Happiness, on its own route', () => {
    expect(OYV_LABEL).toBe('Owning Your Value');
    expect(OYV_AREA).toBe('Happiness');
    expect(OYV_ROUTE).toBe('/owning-your-value');
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
    expect(OYV_COPY.introTitle).toBe('Owning Your Value');
    expect(OYV_INTRO_BODY_LINES.join(' ')).toBe(
      'This one is not a quiz. There are no scores and no right answers. Root is going to ask you nine questions worth sitting with. Take your time. Fifteen to twenty minutes, somewhere quiet.'
    );
  });

  it('uses the shared typewriter component rather than a second one', () => {
    const experience = read('components/owning-your-value/OwningYourValueExperience.tsx');
    expect(experience).toContain("import { IntroReveal } from '@/components/IntroReveal'");
    expect(experience).toContain('<IntroReveal');
  });
});

describe('the three screens and the nine questions', () => {
  it('are titled The Doing, The Worth and The Claim', () => {
    expect(OYV_SECTIONS.map((section) => section.title)).toEqual([
      'The Doing',
      'The Worth',
      'The Claim',
    ]);
  });

  it('are the approved prompts, in the approved order, three to a screen', () => {
    const APPROVED: Array<{ screen: 1 | 2 | 3; prompt: string }> = [
      {
        screen: 1,
        prompt:
          'Walk through yesterday. Who did you do something for, and what was it? Include the small things you would normally never count.',
      },
      {
        screen: 1,
        prompt:
          'Which of those would go undone if you stopped? What do you imagine would actually happen?',
      },
      {
        screen: 1,
        prompt:
          'When did someone last do something for you without being asked? What was it, and what did receiving it feel like?',
      },
      {
        screen: 2,
        prompt:
          'Finish this sentence, and take your time: People value me because... Then read it back. Is anything on that list about who you are, not what you do?',
      },
      {
        screen: 2,
        prompt:
          'If someone who loves you described your value without naming a single thing you do for anyone, what would they say?',
      },
      {
        screen: 2,
        prompt:
          'When you do something purely for yourself, what shows up first: permission, guilt, or something else? Describe it.',
      },
      {
        screen: 3,
        prompt:
          'Where in your week do you feel strongest and most yourself? What are you doing in that moment?',
      },
      {
        screen: 3,
        prompt:
          'Name one thing you are carrying that is not actually yours to carry. What would it take to set it down?',
      },
      {
        screen: 3,
        prompt:
          'Write one sentence you would like to believe about yourself. Root will hold onto it.',
      },
    ];

    expect(OYV_QUESTIONS).toHaveLength(9);
    expect(OYV_QUESTIONS.map((question) => ({ screen: question.screen, prompt: question.prompt })))
      .toEqual(APPROVED);
  });

  it('question nine is the one whose answer is held', () => {
    expect(OYV_QUESTIONS[8]?.key).toBe(OYV_HELD_SENTENCE_KEY);
  });

  it('every one of them is open writing, with no options and no character cap', () => {
    // The type has no options field and no maxLength field at all, so the
    // only way a multiple choice could arrive here is a schema change. This
    // asserts on the rendered control instead, which is what she touches.
    const experience = read('components/owning-your-value/OwningYourValueExperience.tsx');
    expect(experience).toContain('<textarea');
    expect(experience).not.toContain('maxLength');
    expect(experience).not.toContain("role=\"radio\"");
    expect(experience).not.toContain("role=\"checkbox\"");
  });
});

describe('the experiment', () => {
  it('offers the approved action, for seven days', () => {
    expect(OYV_EXPERIMENT_ACTION).toBe(
      'Each evening, name one thing you did today that had value even though nobody saw it.'
    );
    const offer = buildOyvExperiment();
    expect(offer.action).toBe(OYV_EXPERIMENT_ACTION);
    expect(offer.durationDays).toBe(7);
    expect(OYV_EXPERIMENT_DURATION_DAYS).toBe(7);
    expect(offer.protocol).toContain(OYV_EXPERIMENT_ACTION);
  });

  it('the daily question names the action rather than paraphrasing it', () => {
    expect(OYV_EXPERIMENT_DAILY_QUESTION).toContain(
      'name one thing you did today that had value even though nobody saw it'
    );
  });

  it('has a decline path and reads the shared two experiment cap', () => {
    expect(OYV_COPY.experimentDecline).toBe('Not right now');
    expect(OYV_COPY.experimentDeclined.length).toBeGreaterThan(0);
    const action = read('app/actions/owningYourValue.ts');
    expect(action).toContain('MAX_ACTIVE_EXPERIMENTS');
    expect(action).toContain('startLifestyleExperiment');
  });
});

describe('the pop-up', () => {
  it('is the approved sentence', () => {
    expect(OYV_COPY.popupBody).toBe(
      'Your coach asked Root to sit down with you on this one. It is called Owning Your Value. No scores, just nine questions worth your time.'
    );
    expect(OYV_COPY.popupTitle).toBe(OYV_LABEL);
  });
});

describe('the resource', () => {
  it('is titled Your Worth Is Not a To-Do List and is summary first', () => {
    expect(OYV_RESOURCE.title).toBe('Your Worth Is Not a To-Do List');
    expect(OYV_RESOURCE.body.length).toBeGreaterThan(0);
    expect(OYV_RESOURCE.full.length).toBeGreaterThan(OYV_RESOURCE.body.length);
  });

  it('is roughly the length that was asked for, not a paragraph and not an essay', () => {
    const words = `${OYV_RESOURCE.body} ${OYV_RESOURCE.full}`.trim().split(/\s+/).length;
    expect(words).toBeGreaterThan(320);
    expect(words).toBeLessThan(520);
  });

  it('tells her to do nothing, because the experiment beside it is the only ask', () => {
    // Observational, not prescriptive. These are the shapes a "here is what
    // you should do" paragraph takes, and none of them belongs in this
    // piece.
    expect(OYV_RESOURCE.full).not.toMatch(/\byou should\b/i);
    expect(OYV_RESOURCE.full).not.toMatch(/\btry to\b/i);
    expect(OYV_RESOURCE.full).not.toMatch(/\bmake sure\b/i);
    expect(OYV_RESOURCE.full).not.toMatch(/\bstart by\b/i);
  });
});

describe('Root claims nothing about her', () => {
  it('the closing says what happened and nothing about who she is', () => {
    expect(OYV_COPY.closingBody).toContain('your own words');
    expect(OYV_COPY.closingBody).toContain('Nothing here was scored');
    // No sentence in this experience begins a claim about the member.
    for (const line of Object.values(OYV_COPY)) {
      expect(line).not.toMatch(/\bYou are (?:someone|a person|the kind)\b/i);
      expect(line).not.toMatch(/\bwhat this (?:says|tells us) about you\b/i);
    }
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
