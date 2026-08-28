/**
 * The C batch of docs/BUG_SWEEP_2026-08-27.md, each finding held shut by
 * the thing that would let it back.
 *
 * C1 is here as a recorded decision rather than a fix: see its describe
 * block. C2, C3 and C8 shipped in earlier builds and have their own tests.
 * C7 is a measurement, not a rule, and is reported in BUILD_STATUS.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { categorizeForCatalog } from '@/lib/assessment-registry/catalog';
import { findAssessmentRegistryEntry } from '@/lib/assessment-registry/registry';
import { AssignedProgramsCard } from '@/components/AssignedProgramsCard';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}
const APP_FILES = ['app', 'components'].flatMap((root) => walk(root));

// ---------------------------------------------------------------------------
// C1 — a decision, written down
// ---------------------------------------------------------------------------

describe('C1 — what is left in Available with a padlock, and why it stays', () => {
  it('a card her plan does not include is never in Available', () => {
    // Build 2 made membership.minLevel decide the section. This is the half
    // of C1 that was a bug, and it is closed at the source: a premium key
    // cannot land in `available` whatever its lock says.
    const premiumKeys = [
      'short-haq',
      'primal-pattern-diet-type',
      'chek-hlc1-nutrition-lifestyle',
      'four-doctors',
      'wbsa',
      'body-assessment',
    ];
    for (const key of premiumKeys) {
      const definition = findAssessmentRegistryEntry(key);
      expect(definition, key).toBeTruthy();
      expect(definition!.membership.minLevel, key).not.toBe('free_trial');
    }
  });

  it('the free arc IS free, so its own sequence lock stays in Available on purpose', () => {
    // What remains behind a padlock in Available is one free experience
    // waiting on the free experience before it. That is a step she can
    // clear today and the card says so, so it is not the "you are outside
    // this plan" case C1 was written about. Recorded as a decision: if this
    // ever changes, it should change deliberately, not by drift.
    for (const key of ['core-values-snapshot', 'life-signal-check', 'readiness-pulse']) {
      const definition = findAssessmentRegistryEntry(key);
      expect(definition, key).toBeTruthy();
      expect(definition!.membership.minLevel, key).toBe('free_trial');
    }
    const lifeSignal = findAssessmentRegistryEntry('life-signal-check')!;
    expect(lifeSignal.prerequisites.prerequisiteKeys.length).toBeGreaterThan(0);
  });

  it('and that prerequisite card really does sit in Available, not Premium', () => {
    const definition = findAssessmentRegistryEntry('life-signal-check')!;
    const result = categorizeForCatalog(
      definition,
      {
        membershipKey: 'free_trial',
        enrollment: null,
        completionStatus: 'not_started',
        latestCompletedAt: null,
        latestCompletedAttemptId: null,
        pendingAssignment: null,
        pendingReassessmentSchedule: null,
      } as never,
      new Date('2026-08-28T12:00:00.000Z'),
      // Nothing completed, so the prerequisite ahead of it is not cleared.
      new Set() as never
    );
    expect(result.section).toBe('available');
    expect(result.flags.lockReasonKind).toBe('prerequisite');
  });
});

// ---------------------------------------------------------------------------
// C4 — no undated promise
// ---------------------------------------------------------------------------

/** Comments are not copy: a header explaining a removed sentence must not read as the sentence. */
function codeOnly(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
}

describe('C4 — the Primal Pattern screen promises nothing', () => {
  it('the sentence that promised a questionnaire is gone', () => {
    const rendered = codeOnly('components/food-lens/PrimalPatternForm.tsx');
    expect(rendered).not.toContain('questionnaire is on the way');
    expect(rendered).not.toContain('Set it manually for now');
    // And the screen still says what the control is.
    expect(rendered).toContain('what Food Lens compares your meals against');
  });

  it('and no member-facing file makes an undated promise like it', () => {
    const offenders = APP_FILES.filter((file) => /is on the way\./.test(codeOnly(file)));
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C5 — one assessment, one name
// ---------------------------------------------------------------------------

describe('C5 — the baseline questionnaire has one name a member can read', () => {
  it('the registry says Baseline Assessment', () => {
    expect(findAssessmentRegistryEntry('onboarding-health-history')!.displayName).toBe(
      'Baseline Assessment'
    );
  });

  it('no screen still calls it a Comprehensive Health Assessment', () => {
    const offenders = APP_FILES.filter((file) =>
      /Comprehensive (Health )?Assessment/.test(codeOnly(file))
    );
    expect(offenders).toEqual([]);
  });

  it('nor an Onboarding Assessment', () => {
    const offenders = [...APP_FILES, ...walk('lib')].filter((file) =>
      /['"`]Onboarding Assessment['"`]/.test(codeOnly(file))
    );
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C6 — the brand's own palette on Today
// ---------------------------------------------------------------------------

describe('C6 — Today has no Tailwind default status colors', () => {
  const TODAY_FILES = APP_FILES.filter((file) => file.startsWith(join('app', 'today')));

  it('finds the Today screen', () => {
    expect(TODAY_FILES.length).toBeGreaterThan(2);
  });

  it('no chip or badge is drawn from the default palette', () => {
    // Reds are left alone deliberately: an error message is an error
    // message, and the app says so in red everywhere.
    const DEFAULT_PALETTE = /(bg|text)-(blue|amber|green|purple|indigo|sky|teal)-\d{2,3}/;
    const offenders = TODAY_FILES.filter((file) => DEFAULT_PALETTE.test(codeOnly(file)));
    expect([...new Set(offenders)]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C10 — the hero is a way in, not a wall of text
// ---------------------------------------------------------------------------

const LONG_BLURB =
  'This program was built for you after your movement assessment. ' +
  'Week one settles your breathing and your hip position. '.repeat(6);

const PROGRAM = {
  groupKey: 'g1',
  name: 'Hip and Core Foundation',
  blurb: LONG_BLURB,
  hasExplanation: true,
  status: 'active' as const,
  startDate: '2026-08-24',
  endDate: '2026-09-20',
  currentWeek: 2,
  durationWeeks: 4,
  assignmentIds: ['a1'],
  workouts: [],
  totalWorkouts: 8,
  completedWorkouts: 3,
  completionPercent: 38,
  headline: 'Week 2 of 4',
  detail: 'August 24 to September 20',
};

describe('C10 — the Home program hero clamps a coach explanation', () => {
  const html = renderToStaticMarkup(
    <AssignedProgramsCard program={PROGRAM} nextWorkout={null} />
  );

  it('shows the explanation, clamped, rather than the whole essay', () => {
    expect(html).toContain('line-clamp-3');
    expect(html).toContain('This program was built for you');
  });

  it('and the way in is still on the card', () => {
    expect(html).toContain('Open your program');
    expect(html).toContain('Week 2 of 4');
  });

  it('nothing is truncated in the data, only in the drawing', () => {
    // The full text is still in the DOM. /programs shows it unclamped.
    expect(html).toContain('Week one settles your breathing');
    expect(html.match(/Week one settles your breathing/g)!.length).toBe(6);
  });
});
