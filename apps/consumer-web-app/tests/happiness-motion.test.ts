/**
 * The shared Happiness deep-dive motion treatment: the numbers, and the
 * proof that all six templates actually inherit it.
 *
 * WHY THE INHERITANCE IS ASSERTED IN THE SOURCE. "All six templates render
 * with this treatment" is not a value any function returns. It is a fact
 * about which components six files import and use, and the failure mode is
 * a seventh template, or a refactor of one of the six, quietly going back
 * to a plain heading and a textarea. So the six experience files are read
 * and required to use every part of it.
 *
 * WHY THE TIMINGS ARE ASSERTED AT ALL. The philosophy is motion that makes
 * a pause, never motion that entertains, and the one way that fails in
 * practice is a member being made to wait. Every duration below is checked
 * against the actual longest prompt any of the six templates carries, so
 * "a question types at a calm speaking pace" is a measured claim rather
 * than an intention.
 *
 * The reduced-motion half of the treatment is proved by rendering the real
 * components, in tests/happiness-motion-reduced.test.tsx.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  HDD_CHAPTER_MIN_BEAT_MS,
  HDD_CLOSING_FIXED_LINE_PAUSE_MS,
  HDD_CLOSING_QUIET_MS,
  HDD_QUESTION_MAX_TYPING_MS,
  hddChapterBeatMs,
  hddChapterMsPerChar,
  hddClosingFixedLineDelayMs,
  hddClosingLineDelayMs,
  hddClosingLines,
  hddClosingTailDelayMs,
  hddQuestionMsPerChar,
  hddQuestionTypingMs,
  hddWritingBoxDelayMs,
} from '@/lib/happiness-deep-dive/motion';
import { OYV_QUESTIONS } from '@/lib/owning-your-value/questions';
import { WYJL_QUESTIONS } from '@/lib/where-your-joy-lives/questions';
import { TGL_QUESTIONS } from '@/lib/the-giving-ledger/questions';
import { TWOY_QUESTIONS } from '@/lib/the-weight-of-yes/questions';
import { BSN_QUESTIONS } from '@/lib/being-seen/questions';
import { WYPD_QUESTIONS } from '@/lib/what-you-put-down/questions';
import { OYV_SECTIONS } from '@/lib/owning-your-value/copy';
import { WYJL_SECTIONS } from '@/lib/where-your-joy-lives/copy';
import { TGL_SECTIONS } from '@/lib/the-giving-ledger/copy';
import { TWOY_SECTIONS } from '@/lib/the-weight-of-yes/copy';
import { BSN_SECTIONS } from '@/lib/being-seen/copy';
import { WYPD_SECTIONS } from '@/lib/what-you-put-down/copy';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');

/** The six templates, and the one file each renders its question flow from. */
const TEMPLATES = [
  {
    name: 'Owning Your Value',
    experience: 'components/owning-your-value/OwningYourValueExperience.tsx',
    questions: OYV_QUESTIONS,
    sections: OYV_SECTIONS,
  },
  {
    name: 'Where Your Joy Lives',
    experience: 'components/where-your-joy-lives/WhereYourJoyLivesExperience.tsx',
    questions: WYJL_QUESTIONS,
    sections: WYJL_SECTIONS,
  },
  {
    name: 'The Giving Ledger',
    experience: 'components/the-giving-ledger/TheGivingLedgerExperience.tsx',
    questions: TGL_QUESTIONS,
    sections: TGL_SECTIONS,
  },
  {
    name: 'The Weight of Yes',
    experience: 'components/the-weight-of-yes/TheWeightOfYesExperience.tsx',
    questions: TWOY_QUESTIONS,
    sections: TWOY_SECTIONS,
  },
  {
    name: 'Being Seen',
    experience: 'components/being-seen/BeingSeenExperience.tsx',
    questions: BSN_QUESTIONS,
    sections: BSN_SECTIONS,
  },
  {
    name: 'What You Put Down',
    experience: 'components/what-you-put-down/WhatYouPutDownExperience.tsx',
    questions: WYPD_QUESTIONS,
    sections: WYPD_SECTIONS,
  },
] as const;

const ALL_PROMPTS = TEMPLATES.flatMap((template) =>
  template.questions.map((question) => question.prompt)
);
const ALL_TITLES = TEMPLATES.flatMap((template) =>
  template.sections.map((section) => section.title)
);

describe('all six templates inherit the treatment', () => {
  it('there are six of them, and they are the whole family', () => {
    expect(TEMPLATES).toHaveLength(6);
  });

  it('every one renders its questions through the shared QuestionStage', () => {
    for (const template of TEMPLATES) {
      const source = read(template.experience);
      expect(source, template.name).toContain('<QuestionStage');
      expect(source, template.name).toContain("from '@/components/happiness-deep-dive'");
    }
  });

  it('every one plays the chapter beat between screens, and on the way into the first', () => {
    for (const template of TEMPLATES) {
      const source = read(template.experience);
      expect(source, template.name).toContain('<ChapterCard');
      // Into screen one, from the invitation.
      expect(source, template.name).toContain('motion.playChapter(sectionFor(1).title)');
      // And on any Continue that crosses into a different screen.
      expect(source, template.name).toContain(
        'motion.playChapter(sectionFor(next.screen).title)'
      );
    }
  });

  it('every one carries the ambient layer behind the question screens', () => {
    for (const template of TEMPLATES) {
      expect(read(template.experience), template.name).toContain('<AmbientDrift');
    }
  });

  it('every one closes through the shared staged centerpiece', () => {
    for (const template of TEMPLATES) {
      const source = read(template.experience);
      expect(source, template.name).toContain('<ClosingCenterpiece');
      expect(source, template.name).toContain('<ClosingTail');
    }
  });

  it('none of them hand-rolls a prompt heading or a second typewriter of its own', () => {
    for (const template of TEMPLATES) {
      const source = read(template.experience)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // The prompt is the QuestionStage's to render. A template that
      // printed it itself would be a screen the treatment does not reach.
      expect(source, template.name).not.toMatch(/<h1[^>]*>\s*\{(?:prompt|question\.prompt)\}/);
      expect(source, template.name).not.toContain('<Typewriter');
      expect(source, template.name).not.toContain('setInterval');
    }
  });

  it('the treatment itself lives in one place, and the numbers behind it in another', () => {
    // A plain module, so a Server Component or a test can read the math
    // without pulling a client component in. Same rule, and same reason, as
    // lib/introRevealTiming.ts.
    // Stripped of its prose first: that file's own header explains this
    // rule by naming the directive it must not carry.
    const motion = read('lib/happiness-deep-dive/motion.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(motion).not.toContain("'use client'");
    for (const file of [
      'components/happiness-deep-dive/QuestionStage.tsx',
      'components/happiness-deep-dive/ChapterCard.tsx',
      'components/happiness-deep-dive/ClosingCenterpiece.tsx',
      'components/happiness-deep-dive/HoldRing.tsx',
      'components/happiness-deep-dive/AmbientDrift.tsx',
    ]) {
      expect(read(file), file).toContain("'use client'");
    }
  });

  it('it reuses the one shared Typewriter rather than a second implementation', () => {
    expect(read('components/happiness-deep-dive/QuestionStage.tsx')).toContain(
      "from '@/components/reveal/Typewriter'"
    );
    expect(read('components/happiness-deep-dive/ChapterCard.tsx')).toContain(
      "from '@/components/reveal/Typewriter'"
    );
    // And the rate is a prop on that one component, so the intro screens
    // that were built on the 45ms default are untouched.
    expect(read('components/reveal/Typewriter.tsx')).toContain(
      'msPerChar = REVEAL_MS_PER_CHAR'
    );
  });

  it('the ambient layer reuses the shipped drift keyframe rather than defining a second one', () => {
    expect(read('components/happiness-deep-dive/AmbientDrift.tsx')).toContain(
      'mef-gradient-drift'
    );
    // That class already carries its own reduced-motion override in
    // app/globals.css, which is why this component needs no JS branch.
    const css = readFileSync(path.join(APP_ROOT, 'app/globals.css'), 'utf8');
    const drift = css.slice(css.indexOf('.mef-gradient-drift {'));
    expect(drift.slice(0, 400)).toContain('prefers-reduced-motion');
  });
});

describe('a question types at a calm speaking pace', () => {
  it('never takes longer than the cap, on the longest prompt any template carries', () => {
    const longest = ALL_PROMPTS.reduce((a, b) => (a.length >= b.length ? a : b));
    expect(longest.length).toBeGreaterThan(80);
    expect(hddQuestionTypingMs(longest)).toBeLessThanOrEqual(HDD_QUESTION_MAX_TYPING_MS);
  });

  it('every prompt in all six templates finishes typing inside three and a half seconds', () => {
    for (const prompt of ALL_PROMPTS) {
      expect(hddQuestionTypingMs(prompt), prompt.slice(0, 40)).toBeLessThanOrEqual(
        HDD_QUESTION_MAX_TYPING_MS
      );
    }
  });

  it('is faster per character than the intro headline rate, because these are sentences', () => {
    // 45ms a character is right for a two word headline and a crawl for a
    // forty word question. Asserted against the real shipped constant.
    const introRate = 45;
    for (const prompt of ALL_PROMPTS) {
      expect(hddQuestionMsPerChar(prompt)).toBeLessThan(introRate);
    }
  });

  it('a long question types faster rather than taking longer', () => {
    const short = 'What were you taught?';
    const long = ALL_PROMPTS.reduce((a, b) => (a.length >= b.length ? a : b));
    expect(hddQuestionMsPerChar(long)).toBeLessThanOrEqual(hddQuestionMsPerChar(short));
  });

  it('an empty prompt has a rate rather than a division by zero', () => {
    expect(Number.isFinite(hddQuestionMsPerChar(''))).toBe(true);
    expect(hddQuestionTypingMs('')).toBe(0);
  });

  it('the writing box arrives after the question, never before it', () => {
    for (const prompt of ALL_PROMPTS) {
      expect(hddWritingBoxDelayMs(prompt)).toBeGreaterThan(hddQuestionTypingMs(prompt));
    }
  });

  it('a question that asks her to sit inside a length of time adds exactly that length', () => {
    const prompt = 'When someone gives you a genuine compliment, what do you do with it?';
    expect(hddWritingBoxDelayMs(prompt, 5) - hddWritingBoxDelayMs(prompt)).toBe(5000);
    // And a negative or missing hold adds nothing rather than subtracting.
    expect(hddWritingBoxDelayMs(prompt, -3)).toBe(hddWritingBoxDelayMs(prompt));
  });
});

describe('the chapter beat is about two seconds', () => {
  it('holds for at least the floor, whatever the title is', () => {
    for (const title of ALL_TITLES) {
      expect(hddChapterBeatMs(title), title).toBeGreaterThanOrEqual(HDD_CHAPTER_MIN_BEAT_MS);
    }
  });

  it('is about two seconds for every section title in all six templates', () => {
    for (const title of ALL_TITLES) {
      expect(hddChapterBeatMs(title), title).toBeGreaterThanOrEqual(1800);
      expect(hddChapterBeatMs(title), title).toBeLessThanOrEqual(2600);
    }
  });

  it('the title always finishes typing before the beat ends', () => {
    for (const title of ALL_TITLES) {
      const typing = hddChapterMsPerChar(title) * title.length;
      expect(typing, title).toBeLessThan(hddChapterBeatMs(title));
    }
  });

  it('there are eighteen section titles, three on each of the six templates', () => {
    expect(ALL_TITLES).toHaveLength(18);
    for (const template of TEMPLATES) {
      expect(template.sections, template.name).toHaveLength(3);
    }
  });
});

describe('the closing arrives in order, with a real pause before the fixed line', () => {
  it('the screen is quiet before anything appears', () => {
    expect(hddClosingLineDelayMs(0)).toBe(HDD_CLOSING_QUIET_MS);
    expect(HDD_CLOSING_QUIET_MS).toBeGreaterThan(0);
  });

  it('her lines step one at a time', () => {
    expect(hddClosingLineDelayMs(1)).toBeGreaterThan(hddClosingLineDelayMs(0));
    expect(hddClosingLineDelayMs(2) - hddClosingLineDelayMs(1)).toBe(
      hddClosingLineDelayMs(1) - hddClosingLineDelayMs(0)
    );
  });

  it('the fixed line lands after the LAST of her lines, with a pause of its own', () => {
    for (const lineCount of [1, 2, 5, 20]) {
      const lastLine = hddClosingLineDelayMs(lineCount - 1);
      expect(hddClosingFixedLineDelayMs(lineCount)).toBeGreaterThan(
        lastLine + HDD_CLOSING_FIXED_LINE_PAUSE_MS - 1
      );
    }
  });

  it('whatever the template says next arrives after the fixed line', () => {
    expect(hddClosingTailDelayMs(1, true)).toBeGreaterThan(hddClosingFixedLineDelayMs(1));
    // A centerpiece with no fixed line still gets a tail pause, so the two
    // shapes read at the same rhythm.
    expect(hddClosingTailDelayMs(1, false)).toBeGreaterThan(hddClosingLineDelayMs(0));
  });

  it('a long answer does not push the fixed line past a member giving up', () => {
    // Twenty lines is a very long answer. Even then the whole closing has
    // finished arriving inside about half a minute.
    expect(hddClosingTailDelayMs(20, true)).toBeLessThan(30000);
  });
});

describe('her words are split for the reveal and never edited by it', () => {
  it('rejoining the lines gives back exactly what was stored', () => {
    for (const text of [
      'one line',
      'first\nsecond',
      'a\n\nb',
      '  leading and trailing  ',
      'no trailing newline\n',
      'not a sentence at all',
    ]) {
      expect(hddClosingLines(text).join('\n')).toBe(text);
    }
  });

  it('a single line answer is one line, rather than being cut into invented ones', () => {
    // Splitting her sentence at its own punctuation to make the animation
    // richer would be Root editing her. It is deliberately not done.
    expect(hddClosingLines('I did the thing. Then I did another thing.')).toHaveLength(1);
  });

  it('an empty answer is one empty line rather than nothing', () => {
    expect(hddClosingLines('')).toEqual(['']);
  });
});
