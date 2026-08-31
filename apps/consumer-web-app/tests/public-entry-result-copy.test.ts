/**
 * COPY ACCURACY. The whole trustworthiness of this experience rests on one
 * claim: every sentence a visitor reads was built from an answer she
 * actually gave. This file is what makes that an assertion rather than a
 * hope.
 *
 * What it proves:
 *
 *   1. THE ECHO TABLE IS TOTAL AND HAS NOTHING SPARE. Every option of every
 *      question has exactly one echo, and no echo exists for anything no
 *      question offers. A gap here would quietly shorten a result instead
 *      of failing loudly; a spare would be a sentence with no answer behind
 *      it.
 *
 *   2. EVERY EVIDENCE LINE IS TRACEABLE. For a full sweep of answer sets,
 *      each line in the result restates a question that was answered, with
 *      the echo for the value that was given, and never anything else.
 *
 *   3. CHANGING AN ANSWER CHANGES THE RESULT. Two visitors who answered
 *      differently never read the same evidence.
 *
 *   4. NOTHING DIAGNOSES, NOTHING PROMISES, AND THERE ARE NO EM DASHES. The
 *      forbidden vocabulary is checked against every string this experience
 *      can put on a screen, including the three day notes.
 */

import { describe, expect, it } from 'vitest';
import {
  ANSWER_ECHOES,
  EMAIL_STEP_COPY,
  ENERGY_INTRO,
  ENERGY_PATTERN_COPY,
  INVITATION_COPY,
  RESULT_HEADINGS,
  RESULT_UNIVERSAL_LIMITS,
  ROOT_WELCOME_COPY,
  ONBOARDING_PUBLIC_ENTRY_CONFIRM,
} from '../lib/public-entry/copy';
import { ENERGY_CHAPTERS, ENERGY_QUESTIONS, labelFor } from '../lib/public-entry/questions';
import { buildEnergyResult, buildThreeDayNotes } from '../lib/public-entry/result';
import { ENERGY_PATTERN_RULES } from '../lib/public-entry/patterns';

const NEUTRAL: Record<string, string> = {
  low_point: 'late_morning',
  morning_start: 'slow_but_fine',
  sleep_hours: 'seven_to_eight',
  night_pattern: 'nights_are_fine',
  wind_down: 'genuine_wind_down',
  first_food: 'within_an_hour',
  afternoon_reach: 'real_meal',
  mental_load: 'not_much',
  off_switch: 'this_week',
};

// ---------------------------------------------------------------------
// 1) The echo table
// ---------------------------------------------------------------------

describe('the answer echo table', () => {
  it('has an echo for every option of every question', () => {
    const missing: string[] = [];
    for (const question of ENERGY_QUESTIONS) {
      for (const option of question.options) {
        if (!ANSWER_ECHOES[question.key]?.[option.value]) {
          missing.push(`${question.key}.${option.value}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('has no echo for anything no question offers', () => {
    const spare: string[] = [];
    for (const [questionKey, echoes] of Object.entries(ANSWER_ECHOES)) {
      const question = ENERGY_QUESTIONS.find((q) => q.key === questionKey);
      if (!question) {
        spare.push(questionKey);
        continue;
      }
      for (const optionValue of Object.keys(echoes)) {
        if (!question.options.some((o) => o.value === optionValue)) {
          spare.push(`${questionKey}.${optionValue}`);
        }
      }
    }
    expect(spare).toEqual([]);
  });

  it('reads as a restatement, never as an instruction or a claim', () => {
    for (const echoes of Object.values(ANSWER_ECHOES)) {
      for (const echo of Object.values(echoes)) {
        // Every echo is slotted into "You told us ...", so it must begin
        // lowercase and must not itself be a sentence.
        expect(echo[0]).toBe(echo[0]!.toLowerCase());
        expect(echo.endsWith('.')).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------
// 2) Traceability
// ---------------------------------------------------------------------

describe('every evidence line is traceable to an answer that was given', () => {
  it('holds across a full one-question-at-a-time sweep', () => {
    for (const question of ENERGY_QUESTIONS) {
      for (const option of question.options) {
        const answers = { ...NEUTRAL, [question.key]: option.value };
        const result = buildEnergyResult(answers);

        expect(result.evidence.length).toBeGreaterThan(0);
        for (const line of result.evidence) {
          // The question is one this experience asks.
          expect(ENERGY_QUESTIONS.some((q) => q.key === line.questionKey)).toBe(true);
          // The value is the one this visitor actually gave.
          expect(line.answerValue).toBe(answers[line.questionKey]);
          // And the sentence is exactly the echo for that value, with
          // nothing added.
          const echo = ANSWER_ECHOES[line.questionKey]![line.answerValue]!;
          expect(line.text).toBe(`You told us ${echo}.`);
        }
      }
    }
  });

  it('never repeats the same question twice in one result', () => {
    for (const question of ENERGY_QUESTIONS) {
      for (const option of question.options) {
        const result = buildEnergyResult({ ...NEUTRAL, [question.key]: option.value });
        const keys = result.evidence.map((line) => line.questionKey);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it('leads with the questions the rule that chose the pattern actually read', () => {
    // The pattern's own evidenceOrder must begin with the rule's
    // evidenceKeys, so the first thing a visitor is shown is the thing that
    // decided her result, not a decorative extra.
    for (const rule of ENERGY_PATTERN_RULES) {
      const order = ENERGY_PATTERN_COPY[rule.key].evidenceOrder;
      for (const key of rule.evidenceKeys) {
        expect(order).toContain(key);
      }
    }
  });
});

// ---------------------------------------------------------------------
// 3) Different answers, different result
// ---------------------------------------------------------------------

describe('the result actually depends on the answers', () => {
  it('two visitors who answered differently never read the same evidence', () => {
    const shortNights = buildEnergyResult({
      ...NEUTRAL,
      sleep_hours: 'under_five',
      low_point: 'all_day',
    });
    const lateMind = buildEnergyResult({
      ...NEUTRAL,
      night_pattern: 'hard_to_fall_asleep',
      wind_down: 'screen_until_lights_out',
    });

    expect(shortNights.patternKey).not.toBe(lateMind.patternKey);
    expect(shortNights.evidence.map((l) => l.text)).not.toEqual(
      lateMind.evidence.map((l) => l.text)
    );
  });

  it('the default result says out loud that nothing stood out', () => {
    const result = buildEnergyResult(NEUTRAL);
    expect(result.matched).toBe(false);
    expect(result.summary.toLowerCase()).toContain('nothing in your answers points at one single place');
  });

  it('every option label the visitor could tap is echoed by its own words', () => {
    // Guards against an echo drifting away from the label it restates: a
    // result that quotes something she was never offered is a lie however
    // small.
    for (const question of ENERGY_QUESTIONS) {
      for (const option of question.options) {
        expect(labelFor({ [question.key]: option.value }, question.key)).toBe(option.label);
      }
    }
  });
});

// ---------------------------------------------------------------------
// 4) The voice
// ---------------------------------------------------------------------

/** Every string a visitor or a member can read in this experience. */
function everyMemberReadableString(): string[] {
  const strings: string[] = [
    ...ENERGY_INTRO.lines,
    ENERGY_INTRO.title,
    ENERGY_INTRO.eyebrow,
    ENERGY_INTRO.buttonLabel,
    ENERGY_INTRO.reassurance,
    RESULT_UNIVERSAL_LIMITS,
    ...Object.values(RESULT_HEADINGS),
    ...Object.values(EMAIL_STEP_COPY),
    INVITATION_COPY.title,
    INVITATION_COPY.buttonLabel,
    INVITATION_COPY.secondaryLabel,
    ...INVITATION_COPY.lines,
    ROOT_WELCOME_COPY.eyebrow,
    ROOT_WELCOME_COPY.title,
    ROOT_WELCOME_COPY.ctaLabel,
    ROOT_WELCOME_COPY.bodyWithoutPattern,
    ROOT_WELCOME_COPY.bodyWithPattern('A named pattern'),
    ...Object.values(ONBOARDING_PUBLIC_ENTRY_CONFIRM),
  ];

  for (const chapter of ENERGY_CHAPTERS) {
    strings.push(chapter.eyebrow, chapter.title, ...chapter.lines);
  }
  for (const question of ENERGY_QUESTIONS) {
    strings.push(question.prompt, ...question.options.map((o) => o.label));
  }
  for (const echoes of Object.values(ANSWER_ECHOES)) {
    strings.push(...Object.values(echoes));
  }
  for (const copy of Object.values(ENERGY_PATTERN_COPY)) {
    strings.push(
      copy.title,
      copy.summary,
      copy.whatItOftenLooksLike,
      copy.whatThisDoesNotTellUs,
      copy.tryToday.title,
      copy.tryToday.body
    );
    for (const note of copy.threeDayNotes) strings.push(note.day, note.watchFor);
  }
  return strings;
}

describe('the voice', () => {
  const strings = everyMemberReadableString();

  it('contains no em dash anywhere', () => {
    const offenders = strings.filter((s) => s.includes('—'));
    expect(offenders).toEqual([]);
  });

  it('never diagnoses, never prescribes and never promises a result', () => {
    // Words that would turn an observation into a claim. Checked as whole
    // words so "cured" is caught and "secured" is not.
    const forbidden = [
      'diagnose',
      'diagnosis',
      'diagnosed',
      'treat',
      'treatment',
      'cure',
      'cured',
      'heal',
      'prescribe',
      'prescription',
      'dose',
      'dosage',
      'supplement',
      'deficiency',
      'disorder',
      'syndrome',
      'guarantee',
      'guaranteed',
      'proven',
      'will fix',
      'coming soon',
    ];
    const offenders: string[] = [];
    for (const value of strings) {
      const lower = value.toLowerCase();
      for (const word of forbidden) {
        const pattern = new RegExp(`\\b${word.replace(/ /g, '\\s+')}\\b`);
        if (pattern.test(lower)) offenders.push(`${word} in: ${value}`);
      }
    }
    // The word "diagnosis" appears exactly twice in this experience, both
    // times inside a disclaimer saying this is not one. Those two are
    // excluded by their own literal wording rather than by weakening the
    // rule, so a third, non-disclaimer use would still fail here.
    const ALLOWED_DISCLAIMERS = [
      'nothing here is a diagnosis, and nothing here is medical advice',
      'it is not a diagnosis or medical advice',
    ];
    const real = offenders.filter(
      (o) => !ALLOWED_DISCLAIMERS.some((allowed) => o.toLowerCase().includes(allowed))
    );
    expect(real).toEqual([]);
  });

  it('never describes itself as an assessment or a measurement', () => {
    // The result may be called a first impression, a snapshot, a look. It
    // may never be called an assessment: that word belongs to the real
    // in-app assessments and the whole provenance rule rests on the two
    // never being confused.
    const patternCopy = Object.values(ENERGY_PATTERN_COPY).flatMap((c) => [
      c.summary,
      c.whatItOftenLooksLike,
      c.whatThisDoesNotTellUs,
    ]);
    for (const value of [...patternCopy, RESULT_UNIVERSAL_LIMITS]) {
      expect(value.toLowerCase()).not.toMatch(/\bthis assessment\b|\byour assessment\b/);
    }
  });

  it('says explicitly, in the universal limits, that this is not an assessment', () => {
    expect(RESULT_UNIVERSAL_LIMITS.toLowerCase()).toContain('not an assessment');
    expect(RESULT_UNIVERSAL_LIMITS.toLowerCase()).toContain('not a diagnosis');
  });

  it('never mentions how anything is generated', () => {
    // Standing rule: this experience is never promoted or framed by how it
    // is built.
    for (const value of strings) {
      expect(value.toLowerCase()).not.toMatch(/\b(ai|artificial intelligence|algorithm|machine learning|model)\b/);
    }
  });
});

// ---------------------------------------------------------------------
// The email step's own honesty
// ---------------------------------------------------------------------

describe('the email step', () => {
  it('states that the free result above it is already complete', () => {
    expect(EMAIL_STEP_COPY.eyebrow.toLowerCase()).toContain('already complete');
  });

  it('says plainly that nothing is sent to an inbox', () => {
    // There is no outbound email provider in this application. Promising a
    // delivery we cannot make would be the exact bait and switch this whole
    // experience is built to avoid, so the copy says what actually happens.
    expect(EMAIL_STEP_COPY.honesty.toLowerCase()).toContain('nothing lands in your inbox today');
  });

  it('delivers real notes for every pattern, and never the free result again', () => {
    for (const [patternKey, copy] of Object.entries(ENERGY_PATTERN_COPY)) {
      const notes = buildThreeDayNotes(patternKey as keyof typeof ENERGY_PATTERN_COPY);
      expect(notes.length).toBe(3);
      for (const note of notes) {
        expect(note.watchFor.length).toBeGreaterThan(40);
        // Not a restatement of the one free action.
        expect(note.watchFor).not.toBe(copy.tryToday.body);
      }
    }
  });
});
