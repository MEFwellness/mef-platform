/**
 * Questions Worth Exploring: eight co-occurrence prompts, and nothing
 * cleverer than that.
 *
 * WHAT THIS IS. A small, fixed set of deterministic rules over answers the
 * member actually gave. Each one fires only when BOTH of the things it
 * names genuinely exist in her stored answers, so a prompt can never say
 * "X and Y were both reported" about something she did not report.
 *
 * WHAT THIS IS NOT. There is no model, no generation and no inference
 * here. Nothing below says one thing caused another, makes one thing
 * evidence for another, or names a condition. Every prompt has the same
 * two part shape, and the shape is the safety rail:
 *
 *   what she reported, listed as facts, in her own answers' words;
 *   one question a coach may want to ask, phrased as an invitation to
 *     explore rather than as a conclusion to confirm.
 *
 * The coach's card draws those two parts under two different headings, so
 * a coach reading quickly cannot mistake the second for the first.
 *
 * THE WORDS "CAUSE", "BECAUSE", "LEADS TO", "DUE TO" AND "EXPLAINS" DO NOT
 * APPEAR, and tests/health-intake-exploring.test.ts fails if they ever do.
 */

import { readEntries, readItemMap, readScale, readSelections, readText } from './branching';
import { optionLabel } from './questions';
import { HIGH_STRESS_THRESHOLD } from './safety';
import type { IntakeAnswers } from './types';

export type ExploringPrompt = {
  key: string;
  /** The facts, each one a thing she reported. Printed under "What she reported". */
  reported: string[];
  /** The one question. Printed under "A question worth exploring". */
  question: string;
};

/** The fixed opening every prompt uses, so the shape is impossible to drift from. */
function bothReported(first: string, second: string): string {
  return `${first} and ${second} were both reported.`;
}

function selections(answers: IntakeAnswers, fieldId: string): string[] {
  return readSelections(answers[fieldId]);
}

function labelsFor(answers: IntakeAnswers, fieldId: string, values: string[]): string[] {
  const chosen = selections(answers, fieldId);
  return values
    .filter((value) => chosen.includes(value))
    .map((value) => optionLabel(fieldId, value) ?? value);
}

const DIGESTIVE_SYMPTOMS = ['constipation', 'diarrhea', 'nausea', 'vomiting'];

export function buildExploringPrompts(answers: IntakeAnswers): ExploringPrompt[] {
  const prompts: ExploringPrompt[] = [];
  const stress = readScale(answers['stress_level']);
  const highStress = stress >= HIGH_STRESS_THRESHOLD;
  const symptoms = selections(answers, 'symptoms');
  const concerns = selections(answers, 'primary_concerns');

  // 1. A heavy load and a night that keeps breaking.
  if (highStress && readText(answers['night_waking']) === 'yes') {
    const time = readText(answers['night_waking_time']);
    prompts.push({
      key: 'stress_and_night_waking',
      reported: [
        `Stress load ${stress} out of 10`,
        time ? `Wakes at roughly the same time at night (${time})` : 'Wakes at roughly the same time at night',
      ],
      question: `${bothReported('High stress', 'repeated nighttime waking')} Consider exploring evening routine, total sleep opportunity, and current life load.`,
    });
  }

  // 2. Tired, and worst in the afternoon.
  if (symptoms.includes('fatigue') && readText(answers['worst_period']) === 'afternoon') {
    prompts.push({
      key: 'fatigue_and_afternoon_low',
      reported: ['Fatigue', 'Feels at their worst in the afternoon'],
      question: `${bothReported('Fatigue', 'an afternoon low point')} Consider exploring meal timing, hydration, and what the middle of the day actually looks like.`,
    });
  }

  // 3. Digestion, alongside a heavy load.
  const digestive = labelsFor(answers, 'symptoms', DIGESTIVE_SYMPTOMS);
  const digestionConcern = concerns.includes('digestion');
  if (highStress && (digestive.length > 0 || digestionConcern)) {
    prompts.push({
      key: 'digestion_and_stress',
      reported: [
        ...(digestionConcern ? ['Digestion named as something to work on'] : []),
        ...digestive,
        `Stress load ${stress} out of 10`,
      ],
      question: `${bothReported('Digestive symptoms', 'a high stress load')} Consider exploring the mealtime environment, pace of eating, and what the day looks like around meals.`,
    });
  }

  // 4. A history event, and something that is still hard to do.
  const events = readEntries(answers['history_events']);
  const impact = readItemMap(answers['movement_impact']);
  const heavilyAffected = Object.entries(impact)
    .filter(([, value]) => value === 'moderately' || value === 'a_lot')
    .map(([area]) => optionLabel('movement_areas', area) ?? area);
  if (events.length > 0 && heavilyAffected.length > 0) {
    const first = events[0]!;
    const what = [first['event_year'], first['event_what']].filter(Boolean).join(', ');
    prompts.push({
      key: 'history_and_movement',
      reported: [
        what.length > 0 ? `Previous event: ${what}` : `${events.length} previous events reported`,
        `Harder now: ${heavilyAffected.join(', ')}`,
      ],
      question: `${bothReported('A previous surgery, injury or hospital stay', 'current difficulty moving')} Consider exploring what has and has not come back since, and what has been avoided since.`,
    });
  }

  // 5. Already changed sleep, and sleep is still difficult.
  if (selections(answers, 'tried').includes('sleep_changes') && symptoms.includes('sleep_difficulty')) {
    prompts.push({
      key: 'sleep_changes_already_tried',
      reported: ['Sleep changes already tried', 'Sleep difficulty'],
      question: `${bothReported('Sleep changes already tried', 'sleep difficulty still present')} Consider exploring exactly what was changed, for how long, and what happened.`,
    });
  }

  // 6. Prescription medications, alongside ongoing fatigue.
  const medications = readEntries(answers['medications']);
  if (medications.length > 0 && symptoms.includes('fatigue')) {
    prompts.push({
      key: 'medications_and_fatigue',
      reported: [
        `${medications.length} prescription ${medications.length === 1 ? 'medication' : 'medications'} reported`,
        'Fatigue',
      ],
      question: `${bothReported('Prescription medications', 'ongoing fatigue')} Consider exploring when in the day the fatigue is worst, and whether a prescriber has reviewed anything recently.`,
    });
  }

  // 7. Caregiving, alongside a heavy load.
  if (highStress && selections(answers, 'stress_sources').includes('caregiving')) {
    prompts.push({
      key: 'caregiving_and_stress',
      reported: ['Caregiving named as a stressor', `Stress load ${stress} out of 10`],
      question: `${bothReported('Caregiving', 'a high stress load')} Consider exploring what support already exists, and what in the week is genuinely fixed.`,
    });
  }

  // 8. A change in weight, alongside a heavy load.
  const weightChange = readText(answers['weight_change']);
  if (highStress && ['gained', 'fluctuating'].includes(weightChange)) {
    const label = optionLabel('weight_change', weightChange) ?? weightChange;
    prompts.push({
      key: 'weight_and_stress',
      reported: [label, `Stress load ${stress} out of 10`],
      question: `${bothReported('A change in weight', 'a high stress load')} Consider exploring meal rhythm, sleep, and what the week actually allows.`,
    });
  }

  return prompts;
}

/** For the guard test: the words a prompt may never contain. */
export const FORBIDDEN_CAUSATION_WORDS: readonly string[] = [
  'cause',
  'caused',
  'causing',
  'because',
  'leads to',
  'due to',
  'explains',
  'diagnos',
];
