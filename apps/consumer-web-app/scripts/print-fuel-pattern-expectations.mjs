/**
 * The three live verification runs, with what each one SHOULD produce,
 * printed as JSON from the real engines.
 *
 * WHY THIS EXISTS. A live rig that carries its own hand-typed copy of the
 * expected pattern, the expected observation lines and the expected plate
 * is a rig that can only prove the app agrees with a second copy. Worse,
 * it silently stops proving anything the day the copy drifts. So the
 * answers are built here by the same rule the rig uses to pick them, run
 * through the real scoring engine, the real observation engine and the
 * real copy, and the rig asserts the live screen against that.
 *
 * Run with:
 *   npx tsx apps/consumer-web-app/scripts/print-fuel-pattern-expectations.mjs
 */
import { FPA_QUESTIONS } from '../lib/fuel-pattern/questionContent.ts';
import { computeFpaScoring } from '../lib/fuel-pattern/scoring.ts';
import { selectFpaObservations, describeFpaSupport } from '../lib/fuel-pattern/observations.ts';
import {
  FPA_RANGE_FOOTNOTE,
  FPA_SECTION_HEADERS,
  FPA_STARTING_RANGE,
  FUEL_PATTERN_INTERPRETATION,
  FUEL_PATTERN_LABEL,
  fpaWatchForCopy,
} from '../lib/fuel-pattern/copy.ts';
import { FPA_PLATE_GUIDE } from '../lib/fuel-pattern/plate.ts';
import { buildFpaCoachReading } from '../lib/fuel-pattern/coachView.ts';

/**
 * The three sittings. `weight` is answered on every question, `overrides`
 * name a weight class or an exact option value for one question.
 *
 *   A  protein leaning, with two tendencies, one "it varies", the
 *      digestive discomfort answer and a real vitality answer.
 *   B  "it varies" on everything.
 *   C  balanced leaning, but genuinely mixed: stress and higher-fat meals
 *      both answered the carb way, and vitality declined.
 */
export const FPA_RUNS = [
  {
    label: 'runA',
    weight: 'protein',
    overrides: {
      fpa_q7: 'tendency',
      fpa_q11: 'neutral',
      fpa_q15: 'tendency',
      fpa_q21: 'discomfort_regardless',
      fpa_q23: 'comes_and_goes',
    },
  },
  { label: 'runB', weight: 'neutral', overrides: {} },
  {
    label: 'runC',
    weight: 'balanced',
    overrides: { fpa_q13: 'carb', fpa_q20: 'carb', fpa_q23: 'prefer_not_to_answer' },
  },
];

/** Exactly the rule the live rig uses to choose a row on the screen. */
function pick(question, wanted) {
  return (
    question.options.find((o) => o.weight === wanted) ??
    question.options.find((o) => o.value === wanted) ??
    question.options[0]
  );
}

const expectations = FPA_RUNS.map((run) => {
  const answers = {};
  const chosen = [];
  for (const question of FPA_QUESTIONS) {
    const option = pick(question, run.overrides[question.key] ?? run.weight);
    answers[question.key] = option.value;
    chosen.push({ key: question.key, prompt: question.prompt, label: option.label, weight: option.weight });
  }

  const scoring = computeFpaScoring(answers);
  const pattern = scoring.pattern;
  const observations = selectFpaObservations(answers, pattern);
  const coach = buildFpaCoachReading({
    pattern,
    confidence: scoring.confidence,
    scores: scoring.scores,
    scoredQuestionCount: scoring.scoredQuestionCount,
    zeroWeightCount: scoring.zeroWeightCount,
    responses: scoring.responses,
    tendencies: scoring.tendencies,
    digestiveDiscomfort: scoring.digestiveDiscomfort,
    vitalityResponse: scoring.vitalityResponse,
  });

  return {
    label: run.label,
    weight: run.weight,
    overrides: run.overrides,
    chosen,
    pattern,
    patternLabel: FUEL_PATTERN_LABEL[pattern],
    interpretation: FUEL_PATTERN_INTERPRETATION[pattern],
    watchFor: fpaWatchForCopy(pattern),
    range: FPA_STARTING_RANGE[pattern],
    plate: FPA_PLATE_GUIDE[pattern],
    observations: observations.map((o) => ({
      id: o.id,
      text: o.text,
      supporting: o.supporting.map((key) => describeFpaSupport(answers, key)),
    })),
    coach: {
      confidenceLabel: coach.confidenceLabel,
      scores: coach.scores,
      scoredQuestionCount: coach.scoredQuestionCount,
      zeroWeightCount: coach.zeroWeightCount,
      tendencyLines: coach.tendencyLines,
      ambiguous: coach.ambiguous,
      digestiveDiscomfort: coach.digestiveDiscomfort,
      digestiveDiscomfortNote: coach.digestiveDiscomfortNote,
      vitalityLine: coach.vitalityLine,
    },
  };
});

console.log(
  JSON.stringify(
    {
      questions: FPA_QUESTIONS,
      headers: FPA_SECTION_HEADERS,
      rangeFootnote: FPA_RANGE_FOOTNOTE,
      runs: expectations,
    },
    null,
    0
  )
);
