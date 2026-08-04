/**
 * Coach-Assign-Only Gating task (2026-08-04) — source-scan guard proving
 * every UI entry point this task touched actually wires in the real
 * server-side gate and the locked-visible treatment, not just that the
 * underlying registry/catalog logic is correct in isolation (covered by
 * tests/coach-assign-only-gating.test.ts and
 * tests/assessment-registry-catalog.test.ts). SSR component tests don't
 * render in this repo (see prior sessions' notes throughout
 * docs/BUILD_STATUS.md), so this follows the same established convention
 * as tests/no-native-select-onboarding-checkin-guard.test.ts and
 * tests/onboarding-already-complete-layout.test.ts: read the real source
 * text and assert the expected wiring is present.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

describe('locked-card UI actually wires in LockedCardButton + CoachLockBadge', () => {
  const FILES_WITH_LOCKED_CARD_TREATMENT = [
    'components/questionnaires/CatalogQuestionnaireCard.tsx',
    'components/MovementAssessmentCard.tsx',
    'app/progress/page.tsx',
    'app/profile/page.tsx',
  ];

  it.each(FILES_WITH_LOCKED_CARD_TREATMENT)('%s imports and uses both shared locked-state primitives', (relPath) => {
    const source = read(relPath);
    expect(source).toContain("from '@/components/locked/LockedCardButton'");
    expect(source).toContain("from '@/components/locked/CoachLockBadge'");
    expect(source).toContain('LockedCardButton');
    expect(source).toContain('CoachLockBadge');
  });

  it('CatalogQuestionnaireCard never shows a primary action / take link for a coach-locked card', () => {
    const source = read('components/questionnaires/CatalogQuestionnaireCard.tsx');
    expect(source).toContain('isCoachLocked');
    // The action buttons block is gated behind `!isCoachLocked`.
    expect(source).toMatch(/!isCoachLocked\s*&&\s*\(/);
  });
});

describe('server-side gating: real access checks are wired into every Body Assessment entry point', () => {
  const FILES_WITH_ACCESS_CHECK = [
    'app/assessment/page.tsx',
    'app/assessment/new/page.tsx',
    'app/actions/body-assessment.ts',
    'app/dashboard/page.tsx',
    'app/progress/page.tsx',
    'app/profile/page.tsx',
  ];

  it.each(FILES_WITH_ACCESS_CHECK)(
    "%s imports checkAssessmentAccess AND actually calls it against 'body-assessment' (not just imports it)",
    (relPath) => {
      const source = read(relPath);
      expect(source).toContain("from '@/lib/assessment-registry/access'");
      // checkAssessmentAccess appears at least twice: once in the import
      // statement, once as a real call site — an import with no call site
      // would only ever match once.
      const callCount = source.split('checkAssessmentAccess').length - 1;
      expect(callCount).toBeGreaterThanOrEqual(2);
      expect(source).toContain("'body-assessment'");
    }
  );

  it("startAssessmentAction (the real write path) checks access before ever inserting a body_assessments row", () => {
    const source = read('app/actions/body-assessment.ts');
    const fnStart = source.indexOf('export async function startAssessmentAction');
    const fnBody = source.slice(fnStart, source.indexOf('\n}', fnStart));
    const accessCheckIndex = fnBody.indexOf('checkAssessmentAccess');
    const insertIndex = fnBody.indexOf('insertAssessment(');
    expect(accessCheckIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(-1);
    expect(accessCheckIndex).toBeLessThan(insertIndex);
  });
});

describe('coach platform: Body Assessment is assignable, not excluded', () => {
  it('listAssignableAssessments no longer special-cases body-assessment out', () => {
    const source = read('lib/assessment-registry/registry.ts');
    expect(source).not.toContain("e.key !== 'body-assessment'");
  });
});

describe('Root pop-up chain: Body Assessment assignment reuses questionnaire_assigned, not a new kind', () => {
  it('rootPopupMessages.ts merges getMyBodyAssessmentAssignmentCard into the same assignment candidate list', () => {
    const source = read('app/actions/rootPopupMessages.ts');
    expect(source).toContain('getMyBodyAssessmentAssignmentCard');
    expect(source).not.toContain("kind: 'body_assessment_assigned'");
  });

  it('DashboardInviteCards merges the body assessment card into the same priority-card list', () => {
    const source = read('components/dashboard/DashboardInviteCards.tsx');
    expect(source).toContain('bodyAssessmentCard');
  });
});
