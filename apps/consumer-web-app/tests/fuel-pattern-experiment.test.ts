/**
 * THE 7 DAY FUEL EXPERIMENT: the day math, the migration, the guards and
 * the coach's reading.
 *
 * The insight engine has its own file
 * (tests/fuel-pattern-experiment-insights.test.ts). This one covers the
 * four things around it that can break silently:
 *
 *   1. THE DAY MATH. Which day she is on, and when the week is over.
 *      A timezone bug here is invisible until a member in Los Angeles
 *      reads "Day 2 of 7" at five in the afternoon on day 1.
 *   2. THE MIGRATION AGREES WITH THE CODE. Every closed list in
 *      lib/fuel-pattern/experiment/types.ts is a check constraint in
 *      migration 238, and a value added to one and not the other is a
 *      write that fails for one member and nobody else.
 *   3. THE STANDING RULES. No render writes, no date decided while
 *      rendering, no em dash, and the one live run per member rule is a
 *      real index rather than a read before a write.
 *   4. THE COACH'S READING, built from rows.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  fpaDaysBetween,
  fpaExperimentDayNumber,
  fpaExperimentLastDay,
  fpaExperimentStatus,
} from '../lib/fuel-pattern/experiment/days';
import {
  FPA_CLARITY_ANSWERS,
  FPA_ENERGY_ANSWERS,
  FPA_EXPERIMENT_DAYS,
  FPA_HUNGER_ANSWERS,
  type FpaExperimentCheck,
} from '../lib/fuel-pattern/experiment/types';
import {
  FPA_EXPERIMENT_COMPLETION,
  FPA_EXPERIMENT_HEADER,
  FPA_EXPERIMENT_INVITATION,
  FPA_MY_EXPERIMENT,
  FPA_QUICK_CHECK,
  fpaExperimentCheckLine,
  fpaExperimentCompletionCheckLine,
  fpaExperimentDayLine,
} from '../lib/fuel-pattern/experiment/copy';
import { buildFpaCoachExperimentReading } from '../lib/fuel-pattern/experiment/coachView';
import type { FpaExperimentRow } from '../lib/fuel-pattern/experiment/data';
import { fpaWatchForCopy } from '../lib/fuel-pattern/copy';
import { FPA_MEALS } from '../lib/fuel-pattern/meals/library';

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.resolve(ROOT, '../../supabase/migrations/00000000000238_fuel_pattern_experiment.sql'),
  'utf8'
);

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

describe('1. the day math', () => {
  it('counts the start day as day 1', () => {
    expect(fpaExperimentDayNumber('2026-09-14', '2026-09-14')).toBe(1);
    expect(fpaExperimentDayNumber('2026-09-14', '2026-09-16')).toBe(3);
    expect(fpaExperimentDayNumber('2026-09-14', '2026-09-20')).toBe(7);
  });

  it('is active through day 7 and complete the moment day 8 arrives', () => {
    expect(fpaExperimentStatus('2026-09-14', '2026-09-20', null)).toBe('active');
    expect(fpaExperimentStatus('2026-09-14', '2026-09-21', null)).toBe('complete');
  });

  it('calls an archived run archived whatever day it is', () => {
    expect(fpaExperimentStatus('2026-09-14', '2026-09-14', '2026-09-14T10:00:00Z')).toBe(
      'archived'
    );
    expect(fpaExperimentStatus('2026-09-01', '2026-09-30', '2026-09-14T10:00:00Z')).toBe(
      'archived'
    );
  });

  it('crosses a month, a year and a daylight saving boundary without drifting', () => {
    expect(fpaDaysBetween('2026-10-28', '2026-11-04')).toBe(7);
    expect(fpaDaysBetween('2026-12-28', '2027-01-03')).toBe(6);
    // The US moves its clocks on 2026-11-01. Both operands are bare
    // calendar days, so there is no hour for an offset to move.
    expect(fpaExperimentDayNumber('2026-10-30', '2026-11-02')).toBe(4);
  });

  it('never counts below day 1, whatever a clock says', () => {
    expect(fpaExperimentDayNumber('2026-09-14', '2026-09-13')).toBe(1);
  });

  it('ends a run on the seventh day inclusive', () => {
    expect(fpaExperimentLastDay('2026-09-14')).toBe('2026-09-20');
    expect(FPA_EXPERIMENT_DAYS).toBe(7);
  });

  it('says "Day 3 of 7" and never runs past the seventh', () => {
    expect(fpaExperimentDayLine(3)).toBe('Day 3 of 7');
    expect(fpaExperimentDayLine(1)).toBe('Day 1 of 7');
    expect(fpaExperimentDayLine(9)).toBe('Day 7 of 7');
  });
});

describe('2. the migration agrees with the code', () => {
  it('names exactly the three answer sets the types name', () => {
    expect(MIGRATION).toContain(
      `energy text not null check (energy in ('${FPA_ENERGY_ANSWERS.join("', '")}'))`
    );
    expect(MIGRATION).toContain(
      `hunger text not null check (hunger in ('${FPA_HUNGER_ANSWERS.join("', '")}'))`
    );
    expect(MIGRATION).toContain(
      `clarity text not null check (clarity in ('${FPA_CLARITY_ANSWERS.join("', '")}'))`
    );
  });

  it('holds one live run per member with a real index, not a read before a write', () => {
    expect(MIGRATION).toContain('create unique index fuel_experiments_one_live_per_member');
    expect(MIGRATION).toContain('on fuel_experiments (member_id) where archived_at is null');
  });

  it('stores both calendar days as dates rather than instants', () => {
    expect(MIGRATION).toContain('started_on date not null');
    expect(MIGRATION).toContain('logged_on date not null');
  });

  it('lets a coach read both tables and lets nobody else', () => {
    for (const table of ['fuel_experiments', 'fuel_experiment_checks']) {
      expect(MIGRATION, table).toContain(`alter table ${table} enable row level security`);
      expect(MIGRATION, table).toContain(`coach_read_assigned_${table}`);
      expect(MIGRATION, table).toContain(`member_read_own_${table}`);
    }
  });

  it('keeps every archived run and every check inside it', () => {
    expect(MIGRATION).not.toMatch(/delete\s+from/i);
    expect(MIGRATION).not.toMatch(/drop\s+table/i);
  });

  it('has no em dash anywhere in it', () => {
    expect(MIGRATION).not.toContain('—');
  });
});

describe('3. the standing rules', () => {
  const MEMBER_SURFACES = [
    'app/food-lens/my-experiment/page.tsx',
    'app/food-lens/page.tsx',
    'app/assessments/fuel-pattern/results/[sessionId]/page.tsx',
    'app/assessments/fuel-pattern/take/page.tsx',
  ];

  it('writes nothing from any page that renders the experiment', () => {
    for (const surface of MEMBER_SURFACES) {
      const source = read(surface);
      for (const write of [
        'startFpaExperiment',
        'recordFpaExperimentCheck',
        'acknowledgeFpaExperiment',
        'archiveFpaExperiment',
        'revalidatePath',
      ]) {
        expect(source, `${surface} calls ${write}`).not.toContain(write);
      }
    }
  });

  it('keeps every write behind the route handler, and the one retake archive behind the completion', () => {
    const route = read('app/api/fuel-pattern/experiment/route.ts');
    for (const write of [
      'startFpaExperiment',
      'recordFpaExperimentCheck',
      'acknowledgeFpaExperiment',
      'archiveFpaExperiment',
    ]) {
      expect(route, write).toContain(write);
    }
    const completion = read('app/actions/fuelPattern.ts');
    expect(completion).toContain('archiveFpaExperimentsFromOtherSittings');
    // And the completion is the ONLY Server Action that touches a run.
    expect(completion).not.toContain('startFpaExperiment');
    expect(completion).not.toContain('recordFpaExperimentCheck');
  });

  it('never re-renders the route a member is standing on', () => {
    for (const file of [
      'components/fuel-pattern/experiment/useFuelExperiment.ts',
      'components/fuel-pattern/experiment/FuelExperimentSection.tsx',
      'components/fuel-pattern/experiment/QuickCheckSheet.tsx',
      'components/fuel-pattern/experiment/MyExperimentView.tsx',
    ]) {
      const source = read(file);
      expect(source, `${file} calls a router`).not.toContain('useRouter');
      expect(source, `${file} revalidates`).not.toContain('revalidate');
      expect(source, `${file} imports a Server Action`).not.toContain('app/actions/');
    }
  });

  it('decides no calendar day in a browser', () => {
    for (const file of [
      'lib/fuel-pattern/experiment/days.ts',
      'lib/fuel-pattern/experiment/payload.ts',
      'lib/fuel-pattern/experiment/insights.ts',
      'components/fuel-pattern/experiment/useFuelExperiment.ts',
      'components/fuel-pattern/experiment/FuelExperimentSection.tsx',
      'components/fuel-pattern/experiment/MyExperimentView.tsx',
    ]) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => (line.trim().startsWith('*') ? '' : line.replace(/\/\/.*$/, '')))
        .join('\n');
      expect(source, `${file} reads the clock`).not.toMatch(/new Date\(\s*\)/);
      expect(source, `${file} formats a date without a zone`).not.toContain('toLocaleDateString');
    }
  });

  it('puts no em dash in anything a member reads', () => {
    const memberFacing = [
      FPA_EXPERIMENT_HEADER,
      FPA_EXPERIMENT_INVITATION,
      ...Object.values(FPA_EXPERIMENT_COMPLETION),
      ...Object.values(FPA_QUICK_CHECK),
      ...Object.values(FPA_MY_EXPERIMENT),
      fpaExperimentCheckLine(0),
      fpaExperimentCheckLine(1),
      fpaExperimentCheckLine(4),
      fpaExperimentCompletionCheckLine(0),
      fpaExperimentCompletionCheckLine(1),
      fpaExperimentCompletionCheckLine(9),
      fpaExperimentDayLine(3),
      fpaWatchForCopy('protein_supportive'),
    ];
    for (const text of memberFacing) expect(text, text).not.toContain('—');
  });

  it('says the invitation and the completion lines exactly as they were approved', () => {
    expect(FPA_EXPERIMENT_HEADER).toBe('YOUR 7-DAY FUEL EXPERIMENT');
    expect(FPA_EXPERIMENT_INVITATION).toBe(
      'Try your starting pattern for the next 7 days and notice how your body responds. After meals, you can log a quick check that takes about ten seconds. Rooted Reset will look for patterns in what you notice.'
    );
    expect(FPA_EXPERIMENT_COMPLETION.header).toBe('YOUR FIRST WEEK, NOTICED.');
    expect(FPA_EXPERIMENT_COMPLETION.noInsightLine).toBe(
      'Nothing pulled strongly in one direction this week, which usually means your starting pattern is a reasonable home.'
    );
    expect(FPA_EXPERIMENT_COMPLETION.closingLine).toBe(
      'This is exactly how a starting pattern becomes yours: not by rules, but by noticing. Your coach can see what you noticed, and your pattern can keep refining from here.'
    );
    expect(FPA_QUICK_CHECK.confirmation).toBe('Noted. That helps.');
  });

  it('names the experiment in the forward look, for every reading', () => {
    for (const pattern of [
      'protein_supportive',
      'balanced_fuel',
      'carb_supportive',
      'flexible_fuel',
    ] as const) {
      expect(fpaWatchForCopy(pattern)).toContain(
        'Your 7-Day Fuel Experiment is how it gets tested.'
      );
      expect(fpaWatchForCopy(pattern)).toContain(
        'What you notice after real meals is exactly the kind of information that refines a starting pattern into one that truly fits you.'
      );
    }
  });

  it('counts a week as a fact and never as a shortfall', () => {
    for (const line of [
      fpaExperimentCheckLine(0),
      fpaExperimentCompletionCheckLine(0),
      fpaExperimentCompletionCheckLine(2),
    ]) {
      const lower = line.toLowerCase();
      for (const word of ['only', 'missed', 'should', 'streak', 'failed', 'behind']) {
        expect(lower, `"${line}" contains "${word}"`).not.toContain(word);
      }
    }
    expect(fpaExperimentCheckLine(1)).toBe('1 check logged so far.');
    expect(fpaExperimentCompletionCheckLine(4)).toBe('You logged 4 checks this week.');
  });
});

describe("4. the coach's reading", () => {
  const TODAY = '2026-09-14';

  function row(overrides: Partial<FpaExperimentRow> = {}): FpaExperimentRow {
    return {
      id: 'run-1',
      memberId: 'member-1',
      sessionId: 'session-1',
      pattern: 'protein_supportive',
      startedOn: TODAY,
      acknowledgedAt: null,
      archivedAt: null,
      archivedReason: null,
      createdAt: `${TODAY}T09:00:00.000Z`,
      ...overrides,
    };
  }

  function check(partial: Partial<FpaExperimentCheck> & { id: string }): FpaExperimentCheck {
    return {
      loggedOn: TODAY,
      energy: 'steady',
      hunger: 'comfortable',
      clarity: 'normal',
      mealType: null,
      mealId: null,
      createdAt: `${TODAY}T12:00:00.000Z`,
      ...partial,
    };
  }

  it('is empty when she has never started one', () => {
    const reading = buildFpaCoachExperimentReading({
      runs: [],
      checksByRun: new Map(),
      todayLocalDate: TODAY,
    });
    expect(reading.current).toBeNull();
    expect(reading.archived).toHaveLength(0);
  });

  it('prints the day she is on, in HER calendar, and every check in her own answers', () => {
    const checks = [
      check({ id: 'c1', energy: 'low', hunger: 'hungry', clarity: 'foggy' }),
      check({ id: 'c2', mealType: 'lunch' }),
    ];
    const reading = buildFpaCoachExperimentReading({
      runs: [row({ startedOn: '2026-09-12' })],
      checksByRun: new Map([['run-1', checks]]),
      todayLocalDate: TODAY,
    });
    expect(reading.current!.dayLine).toBe('Day 3 of 7');
    expect(reading.current!.status).toBe('active');
    expect(reading.current!.checkCount).toBe(2);
    expect(reading.current!.checks[0]).toMatchObject({
      energyLabel: 'Low',
      hungerLabel: 'Hungry',
      clarityLabel: 'Foggy',
      mealTypeLabel: null,
      mealName: null,
    });
    expect(reading.current!.checks[1]!.mealTypeLabel).toBe('Lunch');
    // A run still going has no summary, because the week has not happened.
    expect(reading.current!.completionSummary).toBeNull();
  });

  it('names a tagged meal by its own name', () => {
    const meal = FPA_MEALS[0]!;
    const reading = buildFpaCoachExperimentReading({
      runs: [row()],
      checksByRun: new Map([
        ['run-1', [check({ id: 'c1', mealId: meal.id, mealType: meal.type })]],
      ]),
      todayLocalDate: TODAY,
    });
    expect(reading.current!.checks[0]!.mealName).toBe(meal.name);
  });

  it('prints an id whose meal a content edit removed, rather than a blank', () => {
    const reading = buildFpaCoachExperimentReading({
      runs: [row()],
      checksByRun: new Map([['run-1', [check({ id: 'c1', mealId: 'a-meal-that-is-gone' })]]]),
      todayLocalDate: TODAY,
    });
    expect(reading.current!.checks[0]!.mealName).toBe('a-meal-that-is-gone');
  });

  it('shows the standing insight, the ones before it, and the summary she read', () => {
    const checks = [
      ...Array.from({ length: 3 }, (_, i) => check({ id: `f${i}`, clarity: 'foggy' })),
      ...Array.from({ length: 3 }, (_, i) => check({ id: `h${i}`, hunger: 'hungry' })),
    ];
    const reading = buildFpaCoachExperimentReading({
      runs: [row({ startedOn: '2026-09-01', acknowledgedAt: `${TODAY}T10:00:00.000Z` })],
      checksByRun: new Map([['run-1', checks]]),
      todayLocalDate: TODAY,
    });
    const run = reading.current!;
    expect(run.status).toBe('complete');
    expect(run.acknowledged).toBe(true);
    expect(run.insightHistory.map((entry) => entry.id)).toEqual([
      'foggy_pattern',
      'hungry_soon',
    ]);
    expect(run.standingInsight!.id).toBe('hungry_soon');
    expect(run.completionSummary).toEqual([
      'You logged 6 checks this week.',
      run.standingInsight!.body,
      FPA_EXPERIMENT_COMPLETION.closingLine,
    ]);
  });

  it('reads the approved no-insight line into a quiet week', () => {
    const reading = buildFpaCoachExperimentReading({
      runs: [row({ startedOn: '2026-09-01' })],
      checksByRun: new Map([['run-1', [check({ id: 'c1' })]]]),
      todayLocalDate: TODAY,
    });
    expect(reading.current!.completionSummary![1]).toBe(
      FPA_EXPERIMENT_COMPLETION.noInsightLine
    );
  });

  it('lists an archived run apart from the live one, with the reason it ended', () => {
    const reading = buildFpaCoachExperimentReading({
      runs: [
        row({ id: 'run-2', startedOn: '2026-09-13' }),
        row({
          id: 'run-1',
          startedOn: '2026-09-01',
          archivedAt: '2026-09-13T09:00:00.000Z',
          archivedReason: 'retake',
        }),
      ],
      checksByRun: new Map([['run-1', [check({ id: 'c1' })]]]),
      todayLocalDate: TODAY,
    });
    expect(reading.current!.id).toBe('run-2');
    expect(reading.archived.map((run) => run.id)).toEqual(['run-1']);
    expect(reading.archived[0]!.archivedReason).toBe('Ended by a retake of the assessment');
    // Its checks are still there. Nothing is ever deleted.
    expect(reading.archived[0]!.checkCount).toBe(1);
  });

  it('grades nothing and names no adherence figure', () => {
    const reading = buildFpaCoachExperimentReading({
      runs: [row({ startedOn: '2026-09-01' })],
      checksByRun: new Map([['run-1', []]]),
      todayLocalDate: TODAY,
    });
    const serialized = JSON.stringify(reading).toLowerCase();
    for (const word of ['adherence', 'compliance', 'streak', 'score', 'missed']) {
      expect(serialized, word).not.toContain(word);
    }
  });
});
