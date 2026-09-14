/**
 * Primal Pattern Diet Type is retired, and the Rooted Reset Fuel Pattern
 * Assessment took its slot.
 *
 * TWO HALVES, AND BOTH MATTER. Retirement has to remove every way IN, and
 * it has to leave every row of her history exactly where it is. A test
 * that only proved the first half would pass just as happily if the
 * retirement had deleted her data.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  findAssessmentRegistryEntry,
  listAssessmentRegistryEntries,
  listAssignableAssessments,
  listMemberFacingAssessments,
} from '../lib/assessment-registry/registry';
import { VISIBILITY_CATALOG } from '../lib/visibility/catalog';
import { lockNoteMessage } from '../lib/locked-content/copy';
import { describeLockReason } from '../lib/assessment-registry/status';
import { NEXT_STEP_CARDS } from '../lib/assessments/four-doctors/premium/nextSteps';
import { FPA_DEFINITION_ID, FPA_KEY, FPA_LABEL, FPA_ROUTE } from '../lib/fuel-pattern/constants';

const APP = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(APP, p), 'utf8');

describe('Primal Pattern is retired', () => {
  const primal = findAssessmentRegistryEntry('primal-pattern-diet-type')!;

  it('carries the flag', () => {
    expect(primal.retired).toBe(true);
  });

  it('is the only retired entry, and every other one says so explicitly', () => {
    const retired = listAssessmentRegistryEntries().filter((e) => e.retired);
    expect(retired.map((e) => e.key)).toEqual(['primal-pattern-diet-type']);
    for (const entry of listAssessmentRegistryEntries()) {
      expect(typeof entry.retired, entry.key).toBe('boolean');
    }
  });

  it('is absent from the member library', () => {
    expect(listMemberFacingAssessments().map((e) => e.key)).not.toContain('primal-pattern-diet-type');
  });

  it('is absent from what a coach can assign', () => {
    expect(listAssignableAssessments().map((e) => e.key)).not.toContain('primal-pattern-diet-type');
  });

  /*
    NOT "COMING SOON". Turning `isActive` off or the implementation status
    down would have been the quick way to hide it, and both of those mean
    Coming Soon to categorizeForCatalog, which draws a card advertising
    the very thing being removed.
  */
  it('is not disguised as a Coming Soon card', () => {
    expect(primal.isComingSoon).toBe(false);
    expect(primal.isActive).toBe(true);
    expect(primal.implementationStatus).toBe('live');
  });

  it('can never be revealed by the visibility layer again', () => {
    const feature = VISIBILITY_CATALOG.find((f) => f.key === 'assessment.primal-pattern-diet-type')!;
    expect(feature.revealWhen).toEqual([]);
    // Grandfathering is removed with the rule, deliberately: a member who
    // took it is the one member a touch probe would put the card back for.
    expect(feature.touchedBy).toEqual({ kind: 'none' });
  });

  it('still has a registry entry, an id and a route, because a coach reads her history', () => {
    expect(primal.databaseId).toBe('524ed776-dad6-4584-8e0d-075a3ab76727');
    expect(primal.resultAccess.coachCanView).toBe(true);
    expect(primal.resultRoute).toBe('/assessments/primal-pattern-diet-type/results/[assessmentId]');
  });

  it('keeps her own stored result readable at its own address', () => {
    const results = read('app/assessments/primal-pattern-diet-type/results/[assessmentId]/page.tsx');
    expect(results).not.toContain("redirect('/questionnaires')");
  });

  it('sends the overview and the take route back to the library rather than 404ing a bookmark', () => {
    for (const file of [
      'app/assessments/primal-pattern-diet-type/page.tsx',
      'app/assessments/primal-pattern-diet-type/take/page.tsx',
    ]) {
      const source = read(file);
      expect(source, file).toContain("redirect('/questionnaires')");
      // And neither of them can write anything on the way.
      expect(source, file).not.toContain('beginPrimalPatternAction');
      expect(source, file).not.toContain('startOrResume');
    }
  });

  it('no longer appears as a next step on the Four Doctors results page', () => {
    expect(NEXT_STEP_CARDS.map((c) => c.id)).not.toContain('primal-pattern');
    expect(NEXT_STEP_CARDS.some((c) => c.href?.includes('primal-pattern'))).toBe(false);
  });

  it('has a plain sentence for the one place a direct URL could still ask for one', () => {
    expect(lockNoteMessage({ kind: 'retired' })).toContain('replaced');
    expect(describeLockReason({ kind: 'retired' })).toContain('replaced');
  });
});

describe('the Fuel Pattern Assessment inherits the slot', () => {
  const fuel = findAssessmentRegistryEntry(FPA_KEY)!;
  const primal = findAssessmentRegistryEntry('primal-pattern-diet-type')!;

  it('sits at the same plan minimum, with the same allowed plans', () => {
    expect(fuel.membership.minLevel).toBe(primal.membership.minLevel);
    expect(fuel.membership.minLevel).toBe('membership');
    expect(fuel.membership.allowedLevels).toEqual(primal.membership.allowedLevels);
  });

  it('sits in the same place on the shelf, under the same category', () => {
    expect(fuel.displayOrder).toBe(primal.displayOrder);
    expect(fuel.category).toBe(primal.category);
  });

  it('inherits the visibility rule Primal Pattern used to carry, unchanged', () => {
    const feature = VISIBILITY_CATALOG.find((f) => f.key === `assessment.${FPA_KEY}`)!;
    expect(feature.revealWhen.map((r) => r.kind)).toEqual([
      'coach_assigned',
      'intake_answer',
      'finding_tier',
    ]);
    expect(feature.touchedBy).toEqual({ kind: 'assessment', keys: [FPA_KEY] });
  });

  it('has its own clean internal id and reuses none of Primal Pattern\'s plumbing', () => {
    expect(fuel.key).toBe('fuel-pattern');
    expect(fuel.databaseId).toBe(FPA_DEFINITION_ID);
    expect(fuel.databaseId).not.toBe(primal.databaseId);
    expect(fuel.storageAdapter).toBe('unified-assessment-runtime-tables');
    expect(fuel.scoringAdapter).not.toBe('primal-pattern-engine');
    expect(fuel.resultAdapter).not.toBe('primal-pattern-results');
    expect(fuel.route).toBe(FPA_ROUTE);
    expect(fuel.route).not.toContain('primal');
  });

  it('is named one way, everywhere', () => {
    expect(fuel.displayName).toBe(FPA_LABEL);
    expect(FPA_LABEL).toBe('Rooted Reset Fuel Pattern Assessment');
  });

  it('stands where Primal Pattern stood on the Four Doctors results page', () => {
    const card = NEXT_STEP_CARDS.find((c) => c.id === 'fuel-pattern')!;
    expect(card.href).toBe(FPA_ROUTE);
    expect(card.title).toBe(FPA_LABEL);
    expect(card.status).toBe('available');
  });

  it('is in the member library and assignable by a coach', () => {
    expect(listMemberFacingAssessments().map((e) => e.key)).toContain(FPA_KEY);
    expect(listAssignableAssessments().map((e) => e.key)).toContain(FPA_KEY);
  });
});

describe('the take route still only ever reads', () => {
  it('creates no session while rendering', () => {
    const source = read('app/assessments/fuel-pattern/take/page.tsx');
    expect(source).toContain('loadFpaTakeSessionAction');
    expect(source).not.toContain('beginRuntimeAssessment');
    expect(source).not.toContain('startOrResumeSession');
  });
});
