/**
 * The Weekly Root Review — guard tests for HOW it is delivered.
 *
 * No database. Two kinds of check:
 *
 *   * pure logic: the once-per-week key, the reviewable-week gate, and the
 *     dismissal lifetime the chain applies to it;
 *   * SOURCE guards: the review's position in the existing pop-up chain, and
 *     the fact that it reuses that chain rather than adding a second pop-up
 *     or dismissal system.
 *
 * The position checks are source reads rather than behavioral tests on
 * purpose. `findMyPendingRootPopupMessage` is a 'use server' function that
 * cannot be called outside a Next.js request scope (see
 * tests/setup/test-clients.ts's own header on why), and the thing worth
 * protecting is precisely an ORDER of branches inside it, which is a
 * property of the file. tests/priority-card-delivery.test.ts guards its own
 * position the same way and for the same reason.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  isOfferPopupDue,
  isRootPopupDueThisLogin,
  priorityCardPopupMessageKey,
  weeklyReviewPopupMessageKey,
} from '@/lib/root-popup-messages/data';
import { hasReviewableWeek } from '@/lib/weekly-review/service';
import { weekStartFor } from '@/lib/weekly-review/week';

const REPO = path.resolve(__dirname, '..');
const CHAIN = readFileSync(path.join(REPO, 'app/actions/rootPopupMessages.ts'), 'utf-8');
const CLIENT = readFileSync(
  path.join(REPO, 'components/dashboard/RootMessagePopupClient.tsx'),
  'utf-8'
);
const HOME = readFileSync(path.join(REPO, 'app/dashboard/page.tsx'), 'utf-8');

/** Index of a marker in the chain source, asserted present so ordering checks cannot pass on a typo. */
function at(marker: string): number {
  const index = CHAIN.indexOf(marker);
  expect(index, `marker not found in the pop-up chain: ${marker}`).toBeGreaterThan(-1);
  return index;
}

describe('the once-per-week key', () => {
  it('is scoped to her own local week start', () => {
    expect(weeklyReviewPopupMessageKey('2026-08-10')).toBe('weekly_review:2026-08-10');
  });

  it('is a different message every week, which is what makes it pop again', () => {
    expect(weeklyReviewPopupMessageKey('2026-08-10')).not.toBe(
      weeklyReviewPopupMessageKey('2026-08-17')
    );
  });

  it('is the same message on every day of one week, which is what stops it popping twice', () => {
    const keys = new Set(
      ['2026-08-10', '2026-08-12', '2026-08-14', '2026-08-16'].map((date) =>
        weeklyReviewPopupMessageKey(weekStartFor(date))
      )
    );
    expect(keys.size).toBe(1);
  });

  it('cannot collide with the Priority Card key, which is scoped to a day', () => {
    expect(weeklyReviewPopupMessageKey('2026-08-10')).not.toBe(
      priorityCardPopupMessageKey('2026-08-10')
    );
  });
});

describe('the dismissal lifetime', () => {
  it('is one-time-ever against a week-scoped key, so any dismissal row retires this week', () => {
    expect(isOfferPopupDue(null)).toBe(true);
    expect(isOfferPopupDue({ status: 'snoozed', snoozedAt: '2026-08-10T09:00:00Z' })).toBe(false);
    expect(isOfferPopupDue({ status: 'ignored', snoozedAt: null })).toBe(false);
  });

  it('is deliberately NOT the recurring next-login rule, which would re-pop it every sign-in', () => {
    // The rule the day-3/day-7 messages use would let a snoozed message come
    // back on the next real login. Applied to a weekly report that would mean
    // several showings in one week.
    expect(
      isRootPopupDueThisLogin(
        { status: 'snoozed', snoozedAt: '2026-08-10T09:00:00Z' },
        '2026-08-11T09:00:00Z'
      )
    ).toBe(true);
    expect(CHAIN).toContain("if (message.kind === 'weekly_review') {\n    return isOfferPopupDue(dismissal) ? message : null;");
  });

  it('is marked dismissed on mount, so closing the tab still counts as its one showing', () => {
    expect(CLIENT).toContain('isOffer || isPriorityCard || isWeeklyReview');
  });
});

describe('the reviewable-week gate', () => {
  it('refuses a member whose account did not exist before this week started', () => {
    // Account created on the Monday itself: her week has not elapsed.
    expect(hasReviewableWeek('2026-08-10T14:00:00Z', 'UTC', '2026-08-10')).toBe(false);
    // Created mid-week.
    expect(hasReviewableWeek('2026-08-12T14:00:00Z', 'UTC', '2026-08-10')).toBe(false);
  });

  it('admits a member whose account existed before it', () => {
    expect(hasReviewableWeek('2026-08-09T23:00:00Z', 'UTC', '2026-08-10')).toBe(true);
    expect(hasReviewableWeek('2025-01-01T00:00:00Z', 'UTC', '2026-08-10')).toBe(true);
  });

  it('reads the boundary in HER timezone, not the servers', () => {
    // 2026-08-10T02:00Z is still Sunday 2026-08-09 in New York, so this
    // member DOES have a completed week. In UTC she would not.
    expect(hasReviewableWeek('2026-08-10T02:00:00Z', 'America/New_York', '2026-08-10')).toBe(true);
    expect(hasReviewableWeek('2026-08-10T02:00:00Z', 'UTC', '2026-08-10')).toBe(false);
  });

  it('refuses when there is no account timestamp at all, which is fail-closed', () => {
    expect(hasReviewableWeek(null, 'UTC', '2026-08-10')).toBe(false);
  });
});

describe('its position in the existing pop-up chain', () => {
  it('sits BELOW the welcome-back takeover', () => {
    expect(at('if (priorityView?.isReEntry)')).toBeLessThan(at("kind: 'weekly_review',"));
  });

  it('sits BELOW coach assignments', () => {
    expect(at('if (dueAssignment)')).toBeLessThan(at("kind: 'weekly_review',"));
  });

  it('sits BELOW every finite day-3 and day-7 follow-up', () => {
    const review = at("kind: 'weekly_review',");
    for (const marker of [
      "if (cvsPending === 'day3')",
      "if (cvsPending === 'day7')",
      "if (lscPending === 'day3')",
      "if (lscPending === 'day7')",
      "if (rplPending === 'day3')",
      "if (rplPending === 'day7')",
      "resetPlanPopupMessageKey('day3'",
      "resetPlanPopupMessageKey('day7'",
    ]) {
      expect(at(marker), marker).toBeLessThan(review);
    }
  });

  it('sits ABOVE the ordinary daily priority card', () => {
    const review = at("kind: 'weekly_review',");
    const ordinaryCard = CHAIN.indexOf('if (priorityView) {');
    expect(ordinaryCard).toBeGreaterThan(review);
  });

  it('sits ABOVE the free-arc invitation, which is the lowest message of all', () => {
    expect(at("kind: 'weekly_review',")).toBeLessThan(at("kind: 'free_arc_available',"));
  });

  it('yields to safety by declining explicitly, without moving the safety card up the chain', () => {
    expect(CHAIN).toContain("priorityViewRaw?.selected.rule === 'safety'");
    expect(CHAIN).toContain('if (weeklyReview && !safetyOverrideActive)');
    // Non-vacuity for "without moving it": the ordinary card branch is still
    // the only place a safety card is returned, and it is still below.
    expect(CHAIN.indexOf('if (priorityView) {')).toBeGreaterThan(
      at("priorityViewRaw?.selected.rule === 'safety'")
    );
  });

  it('adds no second pop-up system and no second dismissal system', () => {
    // One chain function, one dismissal table, one client component.
    expect(CHAIN).toContain('weeklyReviewPopupMessageKey');
    expect(CHAIN).not.toContain('member_weekly_review_dismissals');
    expect(CLIENT).toContain('WeeklyReviewPopup');
  });
});

describe('the persistent entry on Home', () => {
  it('is rendered from the same request-memoized accessor the pop-up chain reads', () => {
    expect(HOME).toContain('getMyWeeklyReview()');
    expect(CHAIN).toContain('await getMyWeeklyReview()');
  });

  it('renders the same body component the pop-up renders, not a second copy of the review', () => {
    const entry = readFileSync(
      path.join(REPO, 'components/weekly-review/WeeklyReviewEntry.tsx'),
      'utf-8'
    );
    const popup = readFileSync(
      path.join(REPO, 'components/weekly-review/WeeklyReviewPopup.tsx'),
      'utf-8'
    );
    expect(entry).toContain('WeeklyReviewBody');
    expect(popup).toContain('WeeklyReviewBody');
  });

  it('sits below the priority card on Home', () => {
    expect(HOME.indexOf('<PriorityCard view={priority} />')).toBeLessThan(
      HOME.indexOf('<WeeklyReviewEntry')
    );
  });
});

describe('the four analytics events', () => {
  const service = readFileSync(path.join(REPO, 'lib/weekly-review/service.ts'), 'utf-8');
  const actions = readFileSync(path.join(REPO, 'app/actions/weeklyReview.ts'), 'utf-8');

  it('all go through the one existing write path', () => {
    expect(service).toContain("from '../analytics/track'");
    expect(actions).toContain("from '@/lib/analytics/track'");
    // Neither module touches the events table itself. Matched on the real
    // query form rather than the bare table name, which also appears in
    // these files' own doc comments explaining why they do not.
    for (const source of [service, actions]) {
      expect(source).not.toContain("from('member_wellness_events')");
    }
  });

  it('delivered rides the composition claim on the server, never a client assertion', () => {
    expect(service).toContain('if (created) {');
    const created = service.indexOf('if (created) {');
    const delivered = service.indexOf("eventType: 'weekly_review_delivered'");
    expect(delivered).toBeGreaterThan(created);
    // The actions module explains in prose why delivery is not its job; what
    // must be absent is a real emit of that event type.
    expect(actions).not.toContain("eventType: 'weekly_review_delivered'");
  });

  it('viewed rides the atomic viewed_at claim', () => {
    expect(actions).toContain('claimWeeklyReviewViewed');
    expect(actions.indexOf('claimWeeklyReviewViewed')).toBeLessThan(
      actions.indexOf("eventType: 'weekly_review_viewed'")
    );
  });

  it('completed rides the atomic acknowledged_at claim', () => {
    expect(actions).toContain('claimWeeklyReviewAcknowledged');
    expect(actions.indexOf('claimWeeklyReviewAcknowledged')).toBeLessThan(
      actions.indexOf("eventType: 'weekly_review_completed'")
    );
  });

  it('question_answered carries the question key and there is no answer in the payload', () => {
    expect(actions).toContain('payload: { questionKey }');
    expect(actions).not.toMatch(/payload:\s*{[^}]*option/);
    expect(actions).not.toMatch(/payload:\s*{[^}]*answer/);
  });
});

describe('the test-account-only force mechanism', () => {
  const route = readFileSync(
    path.join(REPO, 'app/api/test-only/weekly-review-reset/route.ts'),
    'utf-8'
  );

  it('requires a session', () => {
    expect(route).toContain('if (!user) return NextResponse.json');
    expect(route).toContain('status: 401');
  });

  it('refuses any account that is not flagged is_test, fail-closed', () => {
    expect(route).toContain("select('is_test, timezone')");
    expect(route).toContain('if (!profile?.is_test)');
    expect(route).toContain('status: 403');
  });

  it('takes no member id and no week, so it can only ever reach the callers current week', () => {
    expect(route).toContain('export async function POST(): Promise<NextResponse>');
    expect(route).toContain('weekStartFor(localDate)');
    expect(route).not.toMatch(/request\.(json|nextUrl|url)/);
  });

  it('is also gated in the database, independently of this handler', () => {
    const migration = readFileSync(
      path.resolve(REPO, '../../supabase/migrations/00000000000151_weekly_root_review.sql'),
      'utf-8'
    );
    expect(migration).toContain('test_member_delete_own_weekly_reviews');
    expect(migration).toContain('test_member_delete_own_week_focus');
    expect(migration).toContain('p.is_test = true');
  });

  it('composes nothing itself, so a forced review is the same review a real Monday produces', () => {
    expect(route).not.toContain('composeWeeklyReview');
    expect(route).not.toContain('claimWeeklyReview');
  });
});
