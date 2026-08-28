/**
 * Source-scan guard proving every UI entry point that can show a lock
 * actually wires in the real server-side gate and the locked-visible
 * treatment, not just that the underlying registry/catalog logic is
 * correct in isolation (covered by tests/plan-gate.test.ts,
 * tests/coach-assignment-adds-only.test.ts and
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

describe('locked-card UI actually wires in LockedCardButton + LockedBadge', () => {
  /**
   * VISIBILITY LAYER (2026-08-17): app/progress/page.tsx left this list.
   * Its Assessments row used to render for every member either as a link or
   * as a dimmed, greyed locked card. Under the new rule a lock is still an
   * advertisement for a feature the member's own rules have not revealed,
   * so the row is now present or absent, never locked. The primitives are
   * still the right treatment on the three surfaces below, where the lock
   * means "this comes with a different plan" and says so.
   *
   * The badge was `CoachLockBadge`, labelled "Unlocked by your coach", and
   * is now `LockedBadge` (Build 2, 2026-08-27): a missing coach assignment
   * locks nothing any more, so a badge saying a coach would open it was
   * the last thing on the screen contradicting the card under it.
   */
  const FILES_WITH_LOCKED_CARD_TREATMENT = [
    'components/questionnaires/CatalogQuestionnaireCard.tsx',
    'components/MovementAssessmentCard.tsx',
    'app/profile/page.tsx',
  ];

  it.each(FILES_WITH_LOCKED_CARD_TREATMENT)('%s imports and uses both shared locked-state primitives', (relPath) => {
    const source = read(relPath);
    expect(source).toContain("from '@/components/locked/LockedCardButton'");
    expect(source).toContain("from '@/components/locked/LockedBadge'");
    expect(source).toContain('LockedCardButton');
    expect(source).toContain('LockedBadge');
    // The retired badge is gone by name, so nothing can quietly import it.
    expect(source).not.toContain('CoachLockBadge');
  });

  it('the retired coach badge no longer exists anywhere in the app', () => {
    expect(fs.existsSync(path.join(ROOT, 'components/locked/CoachLockBadge.tsx'))).toBe(false);
  });

  it('the coach lock sentence is gone from the copy module, not merely unused', () => {
    const copy = read('lib/locked-content/copy.ts');
    // The constant is deleted, so nothing can import it. The retired
    // sentence itself is quoted once, in the comment that records why it
    // went, which is why this asserts on the export rather than the words.
    expect(copy).not.toContain('export const COACH_LOCK_NOTE_MESSAGE');
    expect(copy).not.toMatch(/lockNoteMessage[\s\S]*COACH_LOCK_NOTE_MESSAGE/);
    // The sheet's title is not about a coach and stays.
    expect(copy).toContain('COACH_LOCK_NOTE_TITLE');
  });

  it('the Progress page shows no locked card at all any more', () => {
    const source = read('app/progress/page.tsx');
    expect(source).not.toContain('LockedCardButton');
    expect(source).not.toContain('LockedBadge');
    // And the row it used to lock is now decided by the visibility layer.
    expect(source).toContain('shows(F.featureBodyAssessment)');
  });

  it('CatalogQuestionnaireCard never shows a primary action / take link for ANY locked card', () => {
    const source = read('components/questionnaires/CatalogQuestionnaireCard.tsx');
    // ONE LOCK, ONE TREATMENT (2026-08-27). This used to branch on
    // `isCoachLocked`, which meant a plan lock kept its own inline layout
    // and its own separate sentence. Every lock is one branch now.
    expect(source).toContain('isLocked');
    expect(source).not.toContain('isCoachLocked');
    // The action buttons block is gated behind `!isLocked`.
    expect(source).toMatch(/!isLocked\s*&&\s*\(/);
  });
});

describe('server-side gating: real access checks are wired into every Body Assessment entry point', () => {
  const FILES_WITH_ACCESS_CHECK = [
    'app/assessment/page.tsx',
    'app/assessment/new/page.tsx',
    'app/actions/body-assessment.ts',
    // Home speed build (2026-08-28): Home's own check moved into its
    // shared per-request loader, which is the single place every Home
    // region now reads it from. Same check, same argument, one call.
    'lib/home/data.ts',
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
