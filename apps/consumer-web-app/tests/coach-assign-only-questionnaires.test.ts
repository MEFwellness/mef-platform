/**
 * THE FOUR THAT ONLY A COACH OPENS (2026-09-12).
 *
 * Four questionnaires stand in the Wellness Questionnaires library for every
 * member and open for none of them until a coach sends one: the Health &
 * Lifestyle Intake, the Rooted Reset Body Systems Survey, the Rooted Reset
 * Whole-Body Signal Assessment and the Breathing Pattern Check-In.
 *
 * This file holds the two claims that are genuinely new, and it is
 * deliberately narrow about which:
 *
 *   THE GATING EXCEPTION. No plan opens these four, at any level, and the
 *     only thing that does is an assignment. Every OTHER questionnaire is
 *     still gated by the plan alone, which tests/plan-gate.test.ts already
 *     proves for the whole registry, so the proof here is that these four
 *     are outside that map rather than a second copy of it.
 *   THE LOCK SHEET. The sentence on the sheet is the coach sentence, word
 *     for word, and it carries no plan and no plan link, because a plan
 *     sentence on these four would be false.
 *
 * It is a pure test on purpose. What it is checking is a decision, not a
 * query: the four feature access modules that read the database are already
 * covered by their own suites, and the state each one returns is the INPUT
 * here rather than the thing under test.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  COACH_ASSIGNED_QUESTIONNAIRES,
  buildCoachAssignedCatalogCard,
  type CoachAssignedQuestionnaireState,
} from '../lib/questionnaires/coachAssignedQuestionnaires';
import { findAssessmentRegistryEntry } from '../lib/assessment-registry/registry';
import { describeLockReason } from '../lib/assessment-registry/status';
import {
  COACH_ASSIGNMENT_LOCK_MESSAGE,
  lockNoteMessage,
  lockOffersPlanLink,
} from '../lib/locked-content/copy';
import { HLI_KEY, HLI_LABEL, HLI_ROUTE } from '../lib/health-intake/constants';
import {
  BODY_SYSTEMS_KEY,
  BODY_SYSTEMS_LABEL,
  BODY_SYSTEMS_ROUTE,
} from '../lib/body-systems/constants';
import { WBS_KEY, WBS_LABEL, WBS_ROUTE } from '../lib/whole-body-signal/constants';
import { BPC_KEY, BPC_LABEL, BPC_ROUTE } from '../lib/breathing-check-in/constants';

const ROOT = path.resolve(__dirname, '..');
const read = (relPath: string) => fs.readFileSync(path.join(ROOT, relPath), 'utf-8');

/** The sentence the brief specified, quoted once, here, so a reworded constant fails rather than silently shipping. */
const REQUIRED_LOCK_SENTENCE =
  "This one opens once your coach assigns it to you. I'll let you know the moment it's ready.";

const EXPECTED = [
  { key: HLI_KEY, title: HLI_LABEL, route: HLI_ROUTE },
  { key: BODY_SYSTEMS_KEY, title: BODY_SYSTEMS_LABEL, route: BODY_SYSTEMS_ROUTE },
  { key: WBS_KEY, title: WBS_LABEL, route: WBS_ROUTE },
  { key: BPC_KEY, title: BPC_LABEL, route: BPC_ROUTE },
] as const;

const NOT_ASSIGNED: CoachAssignedQuestionnaireState = null;
const ASSIGNED: CoachAssignedQuestionnaireState = { status: 'pending' };
const PARTWAY: CoachAssignedQuestionnaireState = { status: 'in_progress' };
const FINISHED: CoachAssignedQuestionnaireState = {
  status: 'completed',
  session: { completedAt: '2026-09-10T14:00:00.000Z' },
};

describe('the four coach-assign-only questionnaires are exactly these four', () => {
  it('all four are present, in the shelf order, and no fifth has crept in', () => {
    expect(COACH_ASSIGNED_QUESTIONNAIRES.map((q) => q.key)).toEqual(EXPECTED.map((e) => e.key));
  });

  it.each(EXPECTED)('$key carries its own feature name and its own route', ({ key, title, route }) => {
    const entry = COACH_ASSIGNED_QUESTIONNAIRES.find((q) => q.key === key)!;
    expect(entry.title).toBe(title);
    expect(entry.route).toBe(route);
    expect(entry.description.length).toBeGreaterThan(0);
    expect(entry.estimatedMinutes).toBeGreaterThan(0);
  });

  it('every word on these cards is free of em dashes', () => {
    for (const q of COACH_ASSIGNED_QUESTIONNAIRES) {
      expect(q.title).not.toContain('—');
      expect(q.description).not.toContain('—');
    }
  });
});

describe('the gating exception: no plan reaches these four, and assignment is the only key', () => {
  /**
   * THE REASON A PLAN CANNOT OPEN THEM is that no plan rule exists for
   * them at all. `membership.minLevel` is the one plan gate, it lives on a
   * registry entry, and none of these four has one. This is the whole
   * mechanism, so it is asserted directly rather than by sweeping plans.
   */
  it.each(EXPECTED)('$key has no registry entry, so no plan level can name it', ({ key }) => {
    expect(findAssessmentRegistryEntry(key)).toBeNull();
  });

  it('a member with no assignment gets a locked card, whatever she is paying', () => {
    for (const q of COACH_ASSIGNED_QUESTIONNAIRES) {
      const card = buildCoachAssignedCatalogCard(q, NOT_ASSIGNED);
      expect(card.flags.locked).toBe(true);
      expect(card.flags.lockReasonKind).toBe('coach_assignment');
      // Never a plan lock, so nothing can render a plan sentence or offer
      // a plan link on it.
      expect(card.flags.lockRequiredLevel).toBeNull();
      // And nowhere to tap through to: there is nothing to start yet.
      expect(card.primaryHref).toBeNull();
      expect(card.resultHref).toBeNull();
    }
  });

  it('a locked one is VISIBLE in Premium, never hidden and never in a dead-end bucket', () => {
    for (const q of COACH_ASSIGNED_QUESTIONNAIRES) {
      expect(buildCoachAssignedCatalogCard(q, NOT_ASSIGNED).section).toBe('premium');
    }
  });

  it('an assignment opens it, and the card offers the real route', () => {
    for (const q of COACH_ASSIGNED_QUESTIONNAIRES) {
      const card = buildCoachAssignedCatalogCard(q, ASSIGNED);
      expect(card.section).toBe('assigned');
      expect(card.flags.locked).toBe(false);
      expect(card.flags.lockNote).toBeNull();
      expect(card.primaryHref).toBe(q.route);
    }
  });

  it('partway through, Resume points at the same route, not at a /take child none of them has', () => {
    for (const q of COACH_ASSIGNED_QUESTIONNAIRES) {
      const card = buildCoachAssignedCatalogCard(q, PARTWAY);
      expect(card.flags.inProgress).toBe(true);
      expect(card.resumeHref).toBe(q.route);
      expect(card.resumeHref).not.toContain('/take');
    }
  });

  it('once finished it stays on the shelf as completed, with her results reachable', () => {
    for (const q of COACH_ASSIGNED_QUESTIONNAIRES) {
      const card = buildCoachAssignedCatalogCard(q, FINISHED);
      expect(card.section).toBe('completed');
      expect(card.flags.locked).toBe(false);
      expect(card.resultHref).toBe(q.route);
      expect(card.latestCompletedAt).toBe('2026-09-10T14:00:00.000Z');
      // A second sitting is the coach's call. The card never offers one.
      expect(card.flags.retakeAvailable).toBe(false);
    }
  });

  /**
   * ONE ASSIGNMENT, ONE KNOCK, ONE PRIORITY CARD. `assignmentId` is what
   * Home's AssignedQuestionnairePriorityCard and the generic
   * `questionnaire_assigned` Root knock both filter on, and all four of
   * these already have their own Home card and their own knock. Handing
   * the same assignment to the generic path as well would show her the
   * same thing twice and knock twice for one assignment.
   */
  it.each(['pending', 'in_progress', 'completed'] as const)(
    'a %s card never enters the generic assigned-questionnaire candidate list',
    (status) => {
      const state = (status === 'completed' ? FINISHED : { status }) as CoachAssignedQuestionnaireState;
      for (const q of COACH_ASSIGNED_QUESTIONNAIRES) {
        expect(buildCoachAssignedCatalogCard(q, state).assignmentId).toBeNull();
      }
    }
  );

  it('the library appends them AFTER the visibility filter, so no rule can hide one', () => {
    const source = read('app/actions/questionnaireCatalog.ts');
    const filterAt = source.indexOf('const visibleCards = cards.filter');
    const appendAt = source.indexOf('COACH_ASSIGNED_QUESTIONNAIRES.map');
    expect(filterAt).toBeGreaterThan(-1);
    expect(appendAt).toBeGreaterThan(filterAt);
    // And they really are in the shelf, not merely computed beside it.
    expect(source).toContain('[...visibleCards, ...coachAssignedCards]');
  });
});

describe('the lock sheet says the one true thing about these four', () => {
  it('the sentence is the coach sentence, word for word', () => {
    expect(COACH_ASSIGNMENT_LOCK_MESSAGE).toBe(REQUIRED_LOCK_SENTENCE);
  });

  it('every locked card of the four carries exactly that sentence', () => {
    for (const q of COACH_ASSIGNED_QUESTIONNAIRES) {
      expect(buildCoachAssignedCatalogCard(q, NOT_ASSIGNED).flags.lockNote).toBe(
        REQUIRED_LOCK_SENTENCE
      );
    }
  });

  it('it comes from the one shared copy function, so the card and the sheet cannot drift', () => {
    expect(lockNoteMessage({ kind: 'coach_assignment' })).toBe(REQUIRED_LOCK_SENTENCE);
  });

  it('it names a coach and never a plan, and carries no em dash', () => {
    expect(COACH_ASSIGNMENT_LOCK_MESSAGE.toLowerCase()).toContain('coach');
    expect(COACH_ASSIGNMENT_LOCK_MESSAGE).not.toContain('—');
    for (const word of ['Monthly', '24 week', 'plan', 'program', 'upgrade']) {
      expect(COACH_ASSIGNMENT_LOCK_MESSAGE).not.toContain(word);
    }
  });

  it('the sheet offers no way to buy out of it, because there is none', () => {
    expect(lockOffersPlanLink({ kind: 'coach_assignment' })).toBe(false);
    const card = buildCoachAssignedCatalogCard(COACH_ASSIGNED_QUESTIONNAIRES[0]!, NOT_ASSIGNED);
    // The card component only ever renders the plan link for a membership
    // lock, and this is the field it reads.
    expect(card.flags.lockReasonKind).not.toBe('membership');
  });

  it('the short card line agrees with the sheet: a coach, not a plan', () => {
    const line = describeLockReason({ kind: 'coach_assignment' });
    expect(line.toLowerCase()).toContain('coach');
    expect(line).not.toContain('—');
    expect(buildCoachAssignedCatalogCard(COACH_ASSIGNED_QUESTIONNAIRES[0]!, NOT_ASSIGNED).flags
      .lockMessage).toBe(line);
  });

  it('the Premium heading no longer promises that a plan opens everything under it', () => {
    const source = read('components/questionnaires/QuestionnaireCatalogView.tsx');
    expect(source).not.toContain('Each of these opens with a plan');
  });
});

describe('the rename is complete in the source, and is display name only', () => {
  const OLD_NAMES = ['MEF Body Systems Survey', 'MEF Whole-Body Signal Assessment'];

  it('the two labels read the new names', () => {
    expect(BODY_SYSTEMS_LABEL).toBe('Rooted Reset Body Systems Survey');
    expect(WBS_LABEL).toBe('Rooted Reset Whole-Body Signal Assessment');
  });

  it('the ids, keys and routes did NOT move', () => {
    expect(BODY_SYSTEMS_KEY).toBe('body-systems-survey');
    expect(WBS_KEY).toBe('whole-body-signal');
    expect(BODY_SYSTEMS_ROUTE).toBe('/body-systems');
    expect(WBS_ROUTE).toBe('/whole-body-signal');
  });

  it('no source file anywhere in the app still says the old name', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.next') continue;
          walk(rel);
          continue;
        }
        if (!/\.(ts|tsx|mjs)$/.test(entry.name)) continue;
        // Two files quote both old names ON PURPOSE, and each is the only
        // way its own check can be non-vacuous: this test, in the list
        // above and in the migration assertion below, and the production
        // walk, which asserts the old name appears nowhere on the real
        // shelf. A guard that flagged the assertion that the thing is gone
        // would be a guard nobody could satisfy.
        if (rel === 'tests/coach-assign-only-questionnaires.test.ts') continue;
        if (rel === 'scripts/verify-coach-assign-only-shelf-prod.mjs') continue;
        const source = read(rel);
        if (OLD_NAMES.some((name) => source.includes(name))) offenders.push(rel);
      }
    };
    for (const dir of ['app', 'components', 'lib', 'scripts', 'tests']) walk(dir);
    expect(offenders).toEqual([]);
  });

  it('a migration renames the stored copy too, because the survey speaks from the database', () => {
    const migration = fs.readFileSync(
      path.join(ROOT, '../../supabase/migrations/00000000000234_body_systems_whole_body_signal_rooted_reset_rename.sql'),
      'utf-8'
    );
    for (const table of ['body_systems_copy', 'whole_body_signal_copy', 'assessment_definitions']) {
      expect(migration).toContain(table);
    }
    for (const name of OLD_NAMES) expect(migration).toContain(name);
    expect(migration).toContain('Rooted Reset Body Systems Survey');
    expect(migration).toContain('Rooted Reset Whole-Body Signal Assessment');
    // Display name only: nothing in it touches a key or an id column.
    expect(migration).not.toMatch(/set\s+key\s*=/i);
    expect(migration).not.toMatch(/set\s+id\s*=/i);
  });
});
