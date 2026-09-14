/**
 * Rooted Reset Fuel Pattern Assessment, Build 4 — the experiment half of
 * what the COACH reads.
 *
 * =====================================================================
 * ITS OWN MODULE, FOR THE REASON EVERY COACH MODULE HERE HAS ONE.
 * =====================================================================
 *
 * Her taker imports the submit action, so anything on that module's
 * import graph is on her screen's import graph. The coach vocabulary for
 * this instrument therefore lives apart from the member vocabulary, and
 * tests/fuel-pattern-member-payload.test.ts walks the real graph from
 * every member surface to prove none of them can reach this file.
 *
 * =====================================================================
 * READ ONLY, AND IT INTERPRETS NOTHING SHE WAS NOT ALREADY SHOWN.
 * =====================================================================
 *
 * Every check is printed in her own three answers. Every insight is the
 * approved line she read, computed by the SAME replay her screen used
 * (lib/fuel-pattern/experiment/insights.ts), so the coach and the member
 * cannot be looking at two different histories. There is no score here,
 * no adherence figure and no judgment about how many checks a week
 * "should" hold, because there is no target for one to be measured
 * against.
 *
 * NOTHING IN THIS FILE WRITES. It takes rows and returns a reading.
 */

import {
  FPA_CHECK_MEAL_TYPE_LABEL,
  FPA_CLARITY_LABEL,
  FPA_ENERGY_LABEL,
  FPA_EXPERIMENT_COMPLETION,
  FPA_HUNGER_LABEL,
  fpaExperimentCompletionCheckLine,
  fpaExperimentDayLine,
} from './copy';
import { fpaExperimentDayNumber, fpaExperimentStatus } from './days';
import { fpaInsightHistory, fpaStandingInsight, type FpaInsight } from './insights';
import type { FpaExperimentCheck, FpaExperimentStatus } from './types';
import type { FpaExperimentRow } from './data';
import { fpaMealById } from '../meals/library';
import { FUEL_PATTERN_LABEL } from '../copy';
import type { FpaMealType } from '../meals/types';

/** One check, in a coach's words. */
export type FpaCoachExperimentCheck = {
  id: string;
  /** The calendar day she logged it on, as she was living it. */
  loggedOn: string;
  energyLabel: string;
  hungerLabel: string;
  clarityLabel: string;
  /** The part of the day, when she named one. */
  mealTypeLabel: string | null;
  /** The library meal, when she tagged one. Its own id when a content edit removed it. */
  mealName: string | null;
};

/** One insight that stood, and how much of the week it had behind it. */
export type FpaCoachExperimentInsight = {
  id: string;
  header: string;
  body: string;
  /** How many checks had been logged when it took its place. */
  afterCheckCount: number;
};

export type FpaCoachExperimentRun = {
  id: string;
  /** The reading this run was testing, which a later retake does not rewrite. */
  patternLabel: string;
  startedOn: string;
  status: FpaExperimentStatus;
  /** "Day 3 of 7", for a run that is still going. Null otherwise. */
  dayLine: string | null;
  checkCount: number;
  checks: FpaCoachExperimentCheck[];
  /** Oldest first, so he can read how the week moved. */
  insightHistory: FpaCoachExperimentInsight[];
  /** The one standing at the end of the run, which is the last of the history. */
  standingInsight: FpaCoachExperimentInsight | null;
  /** What she read on her completion screen, assembled from the same rows. */
  completionSummary: string[] | null;
  /** True once she pressed DONE. */
  acknowledged: boolean;
  archivedAt: string | null;
  /** Why it was put away: she restarted, or a retake ended it. */
  archivedReason: string | null;
};

export type FpaCoachExperimentReading = {
  /** Her live run, when she has one. */
  current: FpaCoachExperimentRun | null;
  /** Every run she has put away, newest first. Nothing is ever deleted. */
  archived: FpaCoachExperimentRun[];
};

export const FPA_COACH_EXPERIMENT_EMPTY: FpaCoachExperimentReading = {
  current: null,
  archived: [],
};

/** Why a run was put away, in a coach's words. */
const ARCHIVE_REASON_LABEL: Record<string, string> = {
  restarted: 'She restarted the experiment',
  retake: 'Ended by a retake of the assessment',
};

function toInsight(insight: FpaInsight, afterCheckCount: number): FpaCoachExperimentInsight {
  return {
    id: insight.id,
    header: insight.header,
    body: insight.body,
    afterCheckCount,
  };
}

function toCheck(check: FpaExperimentCheck): FpaCoachExperimentCheck {
  const meal = check.mealId ? fpaMealById(check.mealId) : null;
  return {
    id: check.id,
    loggedOn: check.loggedOn,
    energyLabel: FPA_ENERGY_LABEL[check.energy],
    hungerLabel: FPA_HUNGER_LABEL[check.hunger],
    clarityLabel: FPA_CLARITY_LABEL[check.clarity],
    mealTypeLabel: check.mealType
      ? FPA_CHECK_MEAL_TYPE_LABEL[check.mealType as FpaMealType] ?? check.mealType
      : null,
    // An id whose meal a content edit has removed prints its own id rather
    // than disappearing, so a gap is visible instead of silent.
    mealName: check.mealId ? meal?.name ?? check.mealId : null,
  };
}

function buildRun(
  row: FpaExperimentRow,
  checks: readonly FpaExperimentCheck[],
  todayLocalDate: string
): FpaCoachExperimentRun {
  const status = fpaExperimentStatus(row.startedOn, todayLocalDate, row.archivedAt);
  const history = fpaInsightHistory(checks);
  const standing = fpaStandingInsight(checks);

  /*
    THE COMPLETION SUMMARY IS ASSEMBLED THE WAY HER OWN SCREEN ASSEMBLES
    IT, from the same rows and the same approved lines, so what he reads
    is what she read rather than a second description of it. It is built
    only for a run that has actually reached the end of its week; a run
    still going has no summary yet, and inventing one would be telling
    him about a week that has not happened.
  */
  const completionSummary =
    status === 'active'
      ? null
      : [
          fpaExperimentCompletionCheckLine(checks.length),
          standing ? standing.body : FPA_EXPERIMENT_COMPLETION.noInsightLine,
          FPA_EXPERIMENT_COMPLETION.closingLine,
        ];

  return {
    id: row.id,
    patternLabel: FUEL_PATTERN_LABEL[row.pattern] ?? row.pattern,
    startedOn: row.startedOn,
    status,
    dayLine:
      status === 'active'
        ? fpaExperimentDayLine(fpaExperimentDayNumber(row.startedOn, todayLocalDate))
        : null,
    checkCount: checks.length,
    checks: checks.map(toCheck),
    insightHistory: history.map((entry) => toInsight(entry.insight, entry.afterCheckCount)),
    standingInsight: standing
      ? toInsight(standing, history[history.length - 1]?.afterCheckCount ?? checks.length)
      : null,
    completionSummary,
    acknowledged: row.acknowledgedAt !== null,
    archivedAt: row.archivedAt,
    archivedReason: row.archivedReason ? ARCHIVE_REASON_LABEL[row.archivedReason] ?? null : null,
  };
}

export function buildFpaCoachExperimentReading(input: {
  runs: readonly FpaExperimentRow[];
  checksByRun: ReadonlyMap<string, FpaExperimentCheck[]>;
  /** Her calendar day, resolved from HER timezone rather than his. */
  todayLocalDate: string;
}): FpaCoachExperimentReading {
  const built = input.runs.map((row) =>
    buildRun(row, input.checksByRun.get(row.id) ?? [], input.todayLocalDate)
  );

  return {
    current: built.find((run) => run.status !== 'archived' && run.archivedAt === null) ?? null,
    archived: built.filter((run) => run.archivedAt !== null),
  };
}
