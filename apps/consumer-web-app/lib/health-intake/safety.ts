/**
 * When an answer on the Health & Lifestyle Intake is better discussed with
 * a clinician than coached around.
 *
 * SIX RULES, EACH ONE DETERMINISTIC AND EACH ONE NAMED. Nothing here is a
 * model, a score or a threshold somebody tuned. A rule reads stored answer
 * values and returns either a signal or nothing, so the same answers
 * always produce the same signals and a coach can be told exactly why one
 * fired.
 *
 * IT NEVER DIAGNOSES, ON EITHER SIDE. The member reads one calm sentence
 * about talking to a healthcare professional (HLI_COPY.safetyBody), and it
 * appears once, on the completion screen, never attached to the answer
 * that triggered it: a line under one answer would tell her which of her
 * answers alarmed the app, which is the closest thing to a diagnosis a
 * wellness product can do by accident. The coach reads what she reported
 * and that follow-up may be appropriate. Neither side is told what it
 * means, what caused it or what is likely.
 *
 * SAFETY OUTRANKS WELLNESS INTERPRETATION. A fired rule is recorded on the
 * sitting and routed through the app's existing safety pipeline
 * (lib/safety/service.ts::evaluateConcern), the same pipeline the check-in,
 * the body assessment and the WBSA red flags already use. There is no
 * second escalation system here.
 *
 * WHY THE RULES ARE PURE AND THE ESCALATION IS NOT HERE. These functions
 * take answers and return signals, so a test can walk every branch of every
 * rule without a database. The write lives in app/actions/healthIntake.ts,
 * beside the submit it belongs to.
 */

import { readItemMap, readSelections, readText } from './branching';
import { optionLabel } from './questions';
import type { IntakeAnswers } from './types';

export type IntakeSafetyRuleKey =
  | 'reported_bleeding'
  | 'breathing_difficulty'
  | 'unintentional_weight_loss'
  | 'persistent_fever'
  | 'new_sensory_change'
  | 'neurological_change';

export type IntakeSafetySignal = {
  ruleKey: IntakeSafetyRuleKey;
  /**
   * What the coach's card prints. It names only what she reported, in her
   * own answer's words, and says nothing about what it means.
   */
  coachLine: string;
  /**
   * The honest sentence handed to the shared classifier. It restates the
   * reported fact and nothing else, in the plain language a member might
   * have typed, which is what lets the existing keyword categories route
   * the genuinely urgent ones without any keyword being stuffed in that
   * the answers do not support. Same discipline as lib/wbsa/safety.ts.
   */
  classifierText: string;
};

/** Frequencies that mean "this is happening a lot", named once. */
const FREQUENT = 'most_days';
/** Durations that mean "this has not gone away", named once. */
const PERSISTENT_DURATIONS = ['several_weeks', 'several_months', 'longer'];
/** The senses whose change a coach would want looked at when it is new. */
const MAJOR_SENSES = ['vision', 'hearing', 'smell', 'taste'];
/** At or above this, the ten point stress mark counts as high. Used by ./exploring.ts too. */
export const HIGH_STRESS_THRESHOLD = 7;

function symptomFrequency(answers: IntakeAnswers, symptom: string): string {
  return readItemMap(answers['symptom_frequency'])[symptom] ?? '';
}
function symptomDuration(answers: IntakeAnswers, symptom: string): string {
  return readItemMap(answers['symptom_duration'])[symptom] ?? '';
}
function symptomWorsening(answers: IntakeAnswers, symptom: string): string {
  return readItemMap(answers['symptom_worsening'])[symptom] ?? '';
}
function reportedSymptom(answers: IntakeAnswers, symptom: string): boolean {
  return readSelections(answers['symptoms']).includes(symptom);
}

/**
 * THE SIX RULES, WRITTEN OUT.
 *
 * 1. reported_bleeding. She selected Bleeding, at any frequency and any
 *    duration. This is the one rule with no second condition, deliberately:
 *    bleeding is the answer on this list where "occasionally" is still
 *    worth a conversation, and the cost of firing when it did not need to
 *    is one calm sentence and one coach line, while the cost of staying
 *    quiet is the thing this whole module exists to prevent.
 *
 * 2. breathing_difficulty. She selected Shortness of breath AND said it
 *    happens most days, or that it is getting worse. The intake captures
 *    no severity scale for a symptom, so "most days" is what stands in for
 *    severe and "getting worse" is her own word for worsening.
 *
 * 3. unintentional_weight_loss. She said she has lost weight AND answered
 *    No or Not sure to whether it was intentional. The word "significant"
 *    comes from the question she was asked, which says "a meaningful
 *    change in your weight", so a Lost answer already means meaningful to
 *    her. The app never decides that for her from a number, because it
 *    holds no number.
 *
 * 4. persistent_fever. She selected Fever AND said it happens most days,
 *    or that it has been going on for several weeks or longer.
 *
 * 5. new_sensory_change. She reported a change in vision, hearing, smell
 *    or taste AND said that change started recently. Hot and cold
 *    sensitivity is deliberately not in this rule: it is a real thing to
 *    coach around and not a neurological warning sign, and it still
 *    reaches the coach on her Health Context card.
 *
 * 6. neurological_change. She selected Dizziness AND said it happens most
 *    days or is getting worse, or she selected Headaches AND said they are
 *    getting worse.
 */
export function evaluateIntakeSafety(answers: IntakeAnswers): IntakeSafetySignal[] {
  const signals: IntakeSafetySignal[] = [];

  if (reportedSymptom(answers, 'bleeding')) {
    const frequency = optionLabel('symptom_frequency', symptomFrequency(answers, 'bleeding'));
    signals.push({
      ruleKey: 'reported_bleeding',
      coachLine: frequency
        ? `Bleeding reported, ${frequency.toLowerCase()}.`
        : 'Bleeding reported.',
      classifierText: 'Unexplained bleeding, reported on a health and lifestyle intake.',
    });
  }

  if (
    reportedSymptom(answers, 'shortness_of_breath') &&
    (symptomFrequency(answers, 'shortness_of_breath') === FREQUENT ||
      symptomWorsening(answers, 'shortness_of_breath') === 'yes')
  ) {
    const worsening = symptomWorsening(answers, 'shortness_of_breath') === 'yes';
    signals.push({
      ruleKey: 'breathing_difficulty',
      coachLine: worsening
        ? 'Shortness of breath reported, and reported as getting worse.'
        : 'Shortness of breath reported, most days.',
      classifierText:
        'Shortness of breath, happening most days or getting worse, reported on a health and lifestyle intake.',
    });
  }

  if (
    readText(answers['weight_change']) === 'lost' &&
    ['no', 'not_sure'].includes(readText(answers['weight_intentional']))
  ) {
    const intentional = readText(answers['weight_intentional']);
    signals.push({
      ruleKey: 'unintentional_weight_loss',
      coachLine:
        intentional === 'no'
          ? 'Weight loss reported, and reported as not intentional.'
          : 'Weight loss reported, and she is not sure whether it was intentional.',
      classifierText:
        'Weight loss that was not intended, reported on a health and lifestyle intake.',
    });
  }

  if (
    reportedSymptom(answers, 'fever') &&
    (symptomFrequency(answers, 'fever') === FREQUENT ||
      PERSISTENT_DURATIONS.includes(symptomDuration(answers, 'fever')))
  ) {
    signals.push({
      ruleKey: 'persistent_fever',
      coachLine: 'Fever reported, and reported as ongoing.',
      classifierText:
        'A high fever that has not gone away, reported on a health and lifestyle intake.',
    });
  }

  const senses = readSelections(answers['senses_areas']);
  const senseDurations = readItemMap(answers['senses_duration']);
  const newSenses = MAJOR_SENSES.filter(
    (sense) => senses.includes(sense) && senseDurations[sense] === 'recently'
  );
  if (newSenses.length > 0) {
    const names = newSenses
      .map((sense) => optionLabel('senses_areas', sense) ?? sense)
      .join(', ')
      .toLowerCase();
    signals.push({
      ruleKey: 'new_sensory_change',
      coachLine: `A recent change in ${names} reported.`,
      classifierText:
        'A sudden change in vision, hearing, smell or taste that started recently, reported on a health and lifestyle intake.',
    });
  }

  const dizzy =
    reportedSymptom(answers, 'dizziness') &&
    (symptomFrequency(answers, 'dizziness') === FREQUENT ||
      symptomWorsening(answers, 'dizziness') === 'yes');
  const headaches =
    reportedSymptom(answers, 'headaches') && symptomWorsening(answers, 'headaches') === 'yes';
  if (dizzy || headaches) {
    const parts: string[] = [];
    if (dizzy) parts.push('dizziness');
    if (headaches) parts.push('headaches that are getting worse');
    signals.push({
      ruleKey: 'neurological_change',
      coachLine: `Ongoing ${parts.join(' and ')} reported.`,
      classifierText:
        'Ongoing dizziness or headaches that are getting worse, reported on a health and lifestyle intake.',
    });
  }

  return signals;
}

/** Whether anything fired, which is what decides the member's one calm sentence. */
export function hasSafetySignal(answers: IntakeAnswers): boolean {
  return evaluateIntakeSafety(answers).length > 0;
}

/**
 * Her own free text, gathered for the shared keyword classifier.
 *
 * THE RULES ABOVE READ STRUCTURED ANSWERS. This reads what she typed, and
 * it is the same thing every other free text surface in this app does with
 * a member's own words: the deterministic classifier in
 * lib/safety/classifier.ts already recognises self harm language, chest
 * pain, fainting and the rest, and a box on this intake is no different
 * from a box on a check-in.
 */
/**
 * THE FREE TEXT FIELDS THIS INTAKE HAS, with the question each one asked.
 *
 * ONE LIST, TWO READERS. The safety classifier wants them joined into one
 * passage, because one concern is one concern and it reads a passage.
 * Automatic complaint understanding wants them SEPARATE, because a
 * complaint report records the exact prompt a member was answering and
 * "In your own words" and "What was looked at, if you remember?" are not
 * the same question. Both read this, so neither can quietly grow a field
 * the other does not know about.
 *
 * The prompts are the labels from lib/health-intake/questions.ts, copied
 * here rather than imported, for the reason every stored prompt in this
 * codebase is copied: what a coach is shown has to be what the member was
 * actually asked on the day, and a reworded question next year must not
 * rewrite last year's record.
 */
export const INTAKE_FREE_TEXT_FIELDS: ReadonlyArray<{ id: string; prompt: string }> = [
  { id: 'concern_context', prompt: 'In your own words' },
  { id: 'recent_illness', prompt: 'What happened? In your own words' },
  { id: 'tried_helped', prompt: 'What has helped?' },
  { id: 'tried_not_helped', prompt: 'What has not helped?' },
  { id: 'labs_what', prompt: 'What was looked at, if you remember?' },
  { id: 'primary_concerns_other', prompt: 'What would you call it?' },
  { id: 'stress_sources_other', prompt: 'What else is weighing on you?' },
  { id: 'tried_other_text', prompt: 'What else have you tried?' },
];

/** Each field she actually wrote in, with the question it asked. */
export function intakeFreeTextEntries(
  answers: IntakeAnswers
): Array<{ id: string; prompt: string; text: string }> {
  return INTAKE_FREE_TEXT_FIELDS.map((field) => ({
    ...field,
    text: readText(answers[field.id]).trim(),
  })).filter((entry) => entry.text.length > 0);
}

export function freeTextForClassifier(answers: IntakeAnswers): string {
  return intakeFreeTextEntries(answers)
    .map((entry) => entry.text)
    .join(' ');
}
