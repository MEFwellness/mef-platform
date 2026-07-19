/**
 * Proves the Four Doctors Assessment is fully isolated from every other
 * questionnaire on the Wellness Assessment Engine: removing
 * `lib/assessments/four-doctors/`, its registry entry, or its components
 * must not break, alter, or require a change to any other questionnaire.
 *
 * Two independent proofs:
 *
 * 1. Static source scan — every shared engine file, every other
 *    questionnaire's own config, and every generic assessment component
 *    is scanned for the literal strings a Four Doctors dependency would
 *    have to use ("four-doctors", "four_doctors", "FOUR_DOCTORS",
 *    "dr_quiet_gender"). Only `lib/assessments/registry.ts` — the single
 *    legitimate wiring point documented in its own header comment — is
 *    allowed to reference it. This is stronger than a behavioral test: it
 *    catches accidental coupling even before it would show up in output.
 *
 * 2. Registry-minus-Four-Doctors lifecycle — the real registry, with the
 *    'four-doctors' entry filtered out (simulating its removal), still
 *    resolves and fully exercises the CHEK HLC1 questionnaire through the
 *    shared engine (scoring, completion, navigation).
 *
 * Also includes a "regression" describe block below proving the
 * conditional-question mechanism didn't change CHEK HLC1's actual scoring
 * behavior (not just its isolation) — see tests/assessments-engine.test.ts
 * for the Four Doctors side of the engine's own conditional-question tests.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CHEK_HLC1_QUESTIONNAIRE } from '../lib/assessments/chek-hlc1';
import { CHEK_HLC1_COPY } from '../lib/assessments/chek-hlc1/copy';
import { listAssessmentDefinitions } from '../lib/assessments/registry';
import {
  classifyPriority,
  isQuestionnaireComplete,
  scoreCategory,
  scoreQuestionnaire,
  totalQuestionCount,
} from '../lib/assessments/engine/scoring';
import { findFirstUnanswered, flattenQuestions } from '../lib/assessments/engine/navigation';
import { deriveQuestionnaireStatus } from '../lib/assessments/presentation';
import { buildWellnessInsight } from '../lib/assessments/insights';
import type { CategoryAnswers, QuestionnaireAnswers } from '../lib/assessments/engine/types';

const FOUR_DOCTORS_MARKERS = /four[-_]doctors|FOUR_DOCTORS|dr_quiet_gender/i;

/** Files allowed to reference Four Doctors — the one legitimate wiring point, plus test files that intentionally exercise it. */
const ALLOWED_TO_REFERENCE_FOUR_DOCTORS = new Set([
  'lib/assessments/registry.ts',
  'tests/assessments-engine.test.ts',
  'tests/assessments-insights.test.ts',
  'tests/assessments-lifecycle-integration.test.ts',
  'tests/assessments-isolation.test.ts',
]);

/**
 * The three directories that make up the Four Doctors module itself
 * (config, the isolated results route, and its dedicated components) —
 * these obviously reference "four-doctors," that's not coupling, it's
 * the module naming itself. Everything else in the scanned surface
 * should have zero references.
 */
const FOUR_DOCTORS_MODULE_PATHS = [
  'lib/assessments/four-doctors',
  'app/assessments/four-doctors',
  'components/assessments/four-doctors-results',
];

/** Walks a directory, returning every file (relative to `root`) whose extension is .ts/.tsx/.json, excluding the Four Doctors module's own directories. */
function collectFiles(root: string, dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(root, full);
    if (FOUR_DOCTORS_MODULE_PATHS.some((p) => rel.startsWith(p))) continue;
    if (rel.includes('node_modules')) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(root, full, out);
    } else if (/\.(ts|tsx|json)$/.test(entry)) {
      out.push(rel);
    }
  }
  return out;
}

describe('Four Doctors isolation — static source scan', () => {
  const root = process.cwd();
  const scanDirs = [
    join(root, 'lib', 'assessments'),
    join(root, 'components', 'assessments'),
    join(root, 'components', 'questionnaires'),
    join(root, 'app', 'assessments'),
    join(root, 'app', 'questionnaires'),
    join(root, 'app', 'actions'),
  ];

  const files = scanDirs.flatMap((dir) => collectFiles(root, dir));

  it('found a non-trivial number of files to scan (the scan itself is not silently vacuous)', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it('no file outside the registry wiring point and Four-Doctors-aware tests references Four Doctors', () => {
    const offenders: { file: string; match: string }[] = [];
    for (const file of files) {
      if (ALLOWED_TO_REFERENCE_FOUR_DOCTORS.has(file)) continue;
      const content = readFileSync(join(root, file), 'utf8');
      const match = content.match(FOUR_DOCTORS_MARKERS);
      if (match) offenders.push({ file, match: match[0] });
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });

  it('registry.ts is the only production file wired to Four Doctors, and only via its documented registry entry', () => {
    const registrySource = readFileSync(join(root, 'lib/assessments/registry.ts'), 'utf8');
    expect(registrySource).toMatch(/four-doctors/);
    // Everything else in the production file set (excluding tests) has zero references.
    const productionOffenders = files.filter(
      (f) => f !== 'lib/assessments/registry.ts' && !f.startsWith('tests/')
    );
    for (const file of productionOffenders) {
      const content = readFileSync(join(root, file), 'utf8');
      expect(content, file).not.toMatch(FOUR_DOCTORS_MARKERS);
    }
  });
});

describe('Four Doctors isolation — registry-minus-Four-Doctors lifecycle', () => {
  // Simulates removing the Four Doctors registry entry: filter it out of
  // the real, live registry rather than hand-building a fake one, so this
  // exercises the actual production `listAssessmentDefinitions()` output.
  const definitionsWithoutFourDoctors = listAssessmentDefinitions().filter(
    (d) => d.questionnaire.id !== 'four-doctors'
  );

  it('CHEK HLC1 is still present once Four Doctors is filtered out of the registry', () => {
    const hlc1 = definitionsWithoutFourDoctors.find(
      (d) => d.questionnaire.id === 'chek-hlc1-nutrition-lifestyle'
    );
    expect(hlc1).toBeDefined();
    expect(hlc1!.questionnaire).toBe(CHEK_HLC1_QUESTIONNAIRE);
    expect(hlc1!.copy).toBe(CHEK_HLC1_COPY);
  });

  it('the full CHEK HLC1 engine lifecycle (navigate, complete-check, score, status, insight) works unchanged with Four Doctors excluded from the active definition set', () => {
    const definition = definitionsWithoutFourDoctors.find(
      (d) => d.questionnaire.id === 'chek-hlc1-nutrition-lifestyle'
    )!;
    const questionnaire = definition.questionnaire;

    // Navigation.
    const flat = flattenQuestions(questionnaire);
    expect(flat).toHaveLength(91);
    const first = findFirstUnanswered(flat, {});
    expect(first?.category.id).toBe('you_are_what_you_eat');
    expect(first?.question.number).toBe(1);

    // Full-answer lifecycle.
    const answers: QuestionnaireAnswers = {};
    for (const category of questionnaire.categories) {
      answers[category.id] = {};
      for (const question of category.questions) {
        answers[category.id]![question.number] = question.options.findIndex((o) => o.points === 0);
      }
    }
    expect(isQuestionnaireComplete(questionnaire, answers)).toBe(true);
    expect(totalQuestionCount(questionnaire)).toBe(91);

    const result = scoreQuestionnaire(questionnaire, answers);
    expect(result.totalScore).toBe(0);
    expect(result.totalMaxScore).toBe(635);
    expect(result.totalPriority).toBe('low');
    expect(classifyPriority(0, questionnaire.scoring.totalPriorityBands)).toBe('low');

    // Status derivation and insight generation.
    expect(deriveQuestionnaireStatus(false, true)).toBe('completed');
    const insight = buildWellnessInsight(result, questionnaire, definition.copy);
    expect(insight.headline).toBe('A strong overall pattern');
  });
});

/**
 * Proves the conditional-question mechanism didn't just happen to produce
 * the same numbers for CHEK HLC1 today — it never touches the dynamic
 * (active-questions-derived) code path at all for a category/questionnaire
 * that declares no conditional questions, so it trusts the config's own
 * static `maxScore` / `totalMaxScore` exactly as the engine did before
 * this mechanism existed. A category/questionnaire that opts in (declares
 * at least one conditional question) is the only case that gets the
 * dynamic path — proven by scoring a Four-Doctors-shaped fixture isn't
 * needed here (see tests/assessments-engine.test.ts's Four Doctors suite);
 * this file only needs to prove the *other* questionnaires are unaffected.
 */
describe('regression — CHEK HLC1 scoring behavior is unchanged by the conditional-question mechanism', () => {
  it('CHEK HLC1 never opts into contextQuestions', () => {
    expect(CHEK_HLC1_QUESTIONNAIRE.contextQuestions).toBeUndefined();
  });

  it('no CHEK HLC1 question declares a condition', () => {
    for (const category of CHEK_HLC1_QUESTIONNAIRE.categories) {
      for (const question of category.questions) {
        expect(question.condition, `${category.id} q${question.number}`).toBeUndefined();
      }
    }
  });

  it('scoreCategory trusts the config maxScore directly for a category with no conditional questions, rather than recomputing it — proven by corrupting the config value and observing it pass through unchanged', () => {
    const realCategory = CHEK_HLC1_QUESTIONNAIRE.categories.find((c) => c.id === 'stress')!;
    // A deliberately wrong maxScore that could never arise from summing
    // this category's own question maxPoints (real max is 81).
    const corrupted = { ...realCategory, maxScore: 999999 };
    const answers: CategoryAnswers = {};
    for (const question of corrupted.questions) {
      answers[question.number] = question.options.findIndex((o) => o.points === 0);
    }
    const result = scoreCategory(corrupted, answers);
    expect(result.maxScore).toBe(999999); // trusted from config, not recomputed to 81
  });

  it('scoreQuestionnaire trusts questionnaire.scoring.totalMaxScore directly when no category has conditional questions, rather than recomputing it', () => {
    const corrupted = {
      ...CHEK_HLC1_QUESTIONNAIRE,
      scoring: { ...CHEK_HLC1_QUESTIONNAIRE.scoring, totalMaxScore: 123456 },
    };
    const answers: QuestionnaireAnswers = {};
    for (const category of corrupted.categories) {
      answers[category.id] = {};
      for (const question of category.questions) {
        answers[category.id]![question.number] = question.options.findIndex((o) => o.points === 0);
      }
    }
    const result = scoreQuestionnaire(corrupted, answers);
    expect(result.totalMaxScore).toBe(123456); // trusted from config, not recomputed to 635
  });
});
