/**
 * Priority Card — delivery guards.
 *
 * The card moved from "an element on the Today screen" to "the pop-up a
 * member meets on open", and the risk in that move is not the rendering,
 * it is the plumbing: a second pop-up system, a second card component, a
 * second copy of what Done means, a pop-up that re-fires on every reload,
 * or three surfaces that quietly disagree about the same day's priority.
 * Each of those is what this file exists to catch.
 *
 * Source scans plus pure-function tests, for the reason
 * tests/product-analytics-payload-safety.test.ts already documents: server
 * actions cannot be invoked under vitest here (next/headers), and SSR
 * component tests do not render in this repo.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  priorityCardPopupMessageKey,
  isOfferPopupDue,
  isRootPopupDueThisLogin,
} from '@/lib/root-popup-messages/data';
import {
  PRIORITY_PRESENTATIONS,
  PRIORITY_RULES,
  isPriorityPresentation,
} from '@/lib/analytics/surfaces';
import { PRIORITY_LADDER, type PriorityRule } from '@/lib/priority/types';

const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '../..');

function read(relative: string): string {
  return readFileSync(path.join(APP_ROOT, relative), 'utf8');
}

// ---------------------------------------------------------------------

describe('it goes through the existing pop-up chain, not a second system', () => {
  it('is a kind in the existing RootPopupMessage union', () => {
    const source = read('app/actions/rootPopupMessages.ts');
    expect(source).toContain("kind: 'priority_card'");
    expect(source).toContain('getMyPriorityView');
  });

  it('renders from the existing RootMessagePopupClient dispatcher', () => {
    const client = read('components/dashboard/RootMessagePopupClient.tsx');
    expect(client).toContain("message.kind === 'priority_card'");
    expect(client).toContain('<PriorityCardPopup');
  });

  it('defines no modal of its own outside the chain', () => {
    // The pop-up presentation must not be mounted by a page directly; the
    // chain is the only thing allowed to decide a pop-up owns the screen.
    for (const file of ['app/dashboard/page.tsx', 'app/today/page.tsx']) {
      expect(read(file)).not.toContain('PriorityCardPopup');
    }
  });

  it('reuses the chain own modal chrome rather than inventing a second look', () => {
    const popup = read('components/priority/PriorityCardPopup.tsx');
    const invite = read('components/dashboard/RootMessagePopupClient.tsx');
    // The exact panel, backdrop and z-index the rest of the chain uses.
    for (const marker of [
      'fixed inset-0 z-[60]',
      'bg-[#0E1F17]/55 backdrop-blur-sm',
      'rounded-[28px] bg-[#1B3A2D]',
    ]) {
      expect(popup).toContain(marker);
      expect(invite).toContain(marker);
    }
  });

  it('has no backdrop-click or Escape dismissal, same as every other message in the chain', () => {
    const popup = read('components/priority/PriorityCardPopup.tsx');
    // Checks for real handlers, not the doc comment that explains the
    // absence of them.
    expect(popup).not.toContain('onKeyDown=');
    expect(popup).not.toContain("=== 'Escape'");
    expect(popup).not.toContain("addEventListener('keydown'");
    // The backdrop carries no onClick, exactly as it does not for the
    // other pop-ups in the chain.
    expect(popup).not.toMatch(/absolute inset-0[^>]*onClick/);
    expect(popup).toContain('aria-hidden="true"');
  });
});

describe('it pops once per day, not on every reload', () => {
  it('keys the message by the member own local date', () => {
    expect(priorityCardPopupMessageKey('2026-08-12')).toBe('priority_card:2026-08-12');
    expect(priorityCardPopupMessageKey('2026-08-13')).toBe('priority_card:2026-08-13');
  });

  it('a dismissal of today key stops it re-popping today', () => {
    // The date-scoped key plus the existing one-time-ever rule IS the
    // once-per-day rule. Never dismissed -> due; dismissed at all -> not.
    expect(isOfferPopupDue(null)).toBe(true);
    expect(isOfferPopupDue({ status: 'ignored', snoozedAt: null })).toBe(false);
    expect(isOfferPopupDue({ status: 'snoozed', snoozedAt: '2026-08-12T09:00:00Z' })).toBe(false);
  });

  it("tomorrow key is a different message, so it pops again the next day", () => {
    expect(priorityCardPopupMessageKey('2026-08-12')).not.toBe(
      priorityCardPopupMessageKey('2026-08-13')
    );
  });

  it('is deliberately NOT on the recurring next-login rule, which would re-pop within a day', () => {
    const source = read('app/actions/rootPopupMessages.ts');
    const branchStart = source.indexOf("if (message.kind === 'priority_card')");
    const branch = source.slice(branchStart, source.indexOf('}', branchStart));
    expect(branch).toContain('isOfferPopupDue');
    expect(branch).not.toContain('isRootPopupDueThisLogin');

    // Sanity: the recurring rule really would have re-popped after a new
    // sign-in on the same day, which is what makes this choice load-bearing.
    expect(
      isRootPopupDueThisLogin(
        { status: 'snoozed', snoozedAt: '2026-08-12T09:00:00Z' },
        '2026-08-12T18:00:00Z'
      )
    ).toBe(true);
  });

  it('marks itself dismissed on mount, so closing the tab still counts as its one showing', () => {
    const client = read('components/dashboard/RootMessagePopupClient.tsx');
    expect(client).toContain('isPriorityCard');
    expect(client).toContain('if (isOffer || isPriorityCard)');
    expect(client).toContain('ignoreRootPopupMessageAction(message.messageKey)');
  });
});

describe('chain ordering: a takeover when it should be, and never a starver', () => {
  const fullSource = read('app/actions/rootPopupMessages.ts');
  // Anchor everything INSIDE the resolver. The same `kind:` strings also
  // appear in the RootPopupMessage type union at the top of the file, and
  // matching those instead would make this whole block meaningless.
  const resolverStart = fullSource.indexOf('async function findMyPendingRootPopupMessage');
  const source = fullSource.slice(resolverStart);

  const reEntryAt = source.indexOf('if (priorityView?.isReEntry)');
  const ordinaryAt = source.lastIndexOf('if (priorityView) {');
  const coachAssignmentAt = source.indexOf('const dueAssignment =');
  const cvsDay3At = source.indexOf("kind: 'cvs_day3'");
  const resetPlanDay7At = source.indexOf("kind: 'reset_plan_day7'");
  const freeArcAt = source.indexOf('const nextFreeArcCard =');

  it('all the anchors this test reasons about really exist', () => {
    for (const index of [reEntryAt, ordinaryAt, coachAssignmentAt, cvsDay3At, resetPlanDay7At, freeArcAt]) {
      expect(index).toBeGreaterThan(-1);
    }
  });

  it('re-entry takes over above every self-serve message', () => {
    expect(reEntryAt).toBeLessThan(cvsDay3At);
    expect(reEntryAt).toBeLessThan(resetPlanDay7At);
    expect(reEntryAt).toBeLessThan(freeArcAt);
  });

  it('a coach assignment still outranks even the re-entry takeover', () => {
    expect(coachAssignmentAt).toBeLessThan(reEntryAt);
  });

  it('the ordinary daily card yields to every message that can actually be finished', () => {
    // This is the starvation guard. The ordinary priority is available
    // EVERY day and perpetual; the day-3/day-7 follow-ups are finite. If
    // the ordinary card sat above them it would starve them permanently
    // for a member who opens the app once a day.
    expect(ordinaryAt).toBeGreaterThan(cvsDay3At);
    expect(ordinaryAt).toBeGreaterThan(resetPlanDay7At);
  });

  it('but still beats an invitation to start something new', () => {
    expect(ordinaryAt).toBeLessThan(freeArcAt);
  });

  it('no branch above the Priority Card can starve it by returning an already-dismissed message', () => {
    // FIX 6 (2026-08-12), found live. Every day3/day7 branch that sits
    // above the Priority Card must check its OWN due-ness and fall through
    // when dismissed. A branch that returns unconditionally, trusting the
    // single outer check to filter it, turns the whole resolver into null
    // and blocks every lower pop-up forever, which is exactly what one
    // 'ignored' cvs_day3 row was doing to memberPopulated in production.
    const pendingBranches = [
      "if (cvsPending === 'day3')",
      "if (cvsPending === 'day7')",
      "if (lscPending === 'day3')",
      "if (lscPending === 'day7')",
      "if (rplPending === 'day3')",
      "if (rplPending === 'day7')",
      'resetPlanState.isDay3Eligible',
      'resetPlanState.isDay7Eligible',
    ];

    for (const branch of pendingBranches) {
      const at = source.indexOf(branch);
      expect(at, `${branch} should exist`).toBeGreaterThan(-1);
      // The guard must appear inside the branch, before its return.
      const body = source.slice(at, source.indexOf('return {', at));
      expect(body, `${branch} must check its own due-ness`).toContain(
        'await isRecurringMessageDue(messageKey)'
      );
    }
  });

  it('never pops for a priority she has already actioned', () => {
    // Done or saved on Home or Today writes the same row, so the pop-up
    // would otherwise interrupt her with something already finished.
    expect(source).toContain("priorityViewRaw?.status === 'active' ? priorityViewRaw : null");
  });

  it('returns one message, so the chain can never stack two pop-ups', () => {
    // Every branch in the resolver returns immediately; HomeScreenPopups
    // then freezes that single decision for the visit.
    const zones = read('components/dashboard/HomeScreenPopups.tsx');
    expect(zones).toContain('rootWonThisVisit');
  });
});

describe('one card, one state, three surfaces', () => {
  it('the pop-up and the inline card share their behavior rather than copying it', () => {
    const hook = read('components/priority/usePriorityCardActions.ts');
    expect(hook).toContain('completePriorityAction');
    expect(hook).toContain('savePriorityForLaterAction');
    expect(hook).toContain('trackPriorityHelpAction');

    for (const file of [
      'components/priority/PriorityCard.tsx',
      'components/priority/PriorityCardPopup.tsx',
    ]) {
      const source = read(file);
      expect(source).toContain('usePriorityCardActions');
      // Neither presentation may call the mutating actions itself; that is
      // exactly how "Done" would drift apart between them.
      expect(source).not.toContain('completePriorityAction(');
      expect(source).not.toContain('savePriorityForLaterAction(');
    }
  });

  it('all three surfaces read the same engine and therefore the same stored row', () => {
    // Home and the pop-up chain both go through the one memoized accessor.
    expect(read('app/dashboard/page.tsx')).toContain('getMyPriorityView()');
    expect(read('app/actions/rootPopupMessages.ts')).toContain('getMyPriorityView()');
    // Today passes what it already fetched into the same builder.
    expect(read('app/today/page.tsx')).toContain('buildPriorityView(');
    expect(read('lib/priority/view.ts')).toContain('buildPriorityView(');
  });

  it('Home computes the priority once for both the pop-up and its inline card', () => {
    const view = read('lib/priority/view.ts');
    expect(view).toContain('requestCache');
  });

  it('the inline card exists on both Home and Today', () => {
    expect(read('app/dashboard/page.tsx')).toContain('<PriorityCard view={priority} />');
    expect(read('app/today/page.tsx')).toContain('<PriorityCard view={priority} />');
  });

  it('Done writes one row, so it reads as Done on every surface with no syncing', () => {
    const actions = read('app/actions/priority.ts');
    expect(actions).toContain("setDailyPriorityStatus(supabase, ctx.memberId, ctx.localDate, 'done')");
    // Revalidating both surfaces is what makes the change visible at once.
    expect(actions).toContain("revalidatePath('/today')");
  });
});

describe('analytics: presentation recorded, one priority per day', () => {
  it('popup and inline are a closed vocabulary', () => {
    expect([...PRIORITY_PRESENTATIONS]).toEqual(['popup', 'inline']);
    expect(isPriorityPresentation('popup')).toBe(true);
    expect(isPriorityPresentation('inline')).toBe(true);
    expect(isPriorityPresentation('modal')).toBe(false);
    expect(isPriorityPresentation(7)).toBe(false);
  });

  it('both presentations report themselves', () => {
    expect(read('components/dashboard/RootMessagePopupClient.tsx')).toContain('presentation="popup"');
    expect(read('app/dashboard/page.tsx')).toContain('presentation="inline"');
    expect(read('app/today/page.tsx')).toContain('presentation="inline"');
  });

  it('which presentation gets recorded is deterministic, not a race', () => {
    // Home renders the pop-up and the inline card in the same paint. If
    // both reported, the winner would be whichever round trip landed
    // first, and the recorded presentation would be meaningless. The
    // pop-up is what actually reached her, so the inline tracker stands
    // down while it is showing.
    const home = read('app/dashboard/page.tsx');
    expect(home).toContain("rootPopupMessage?.kind === 'priority_card'");
    expect(home).toContain('{!priorityShownAsPopup && (');

    // Today has no pop-up, so its inline card always reports.
    const today = read('app/today/page.tsx');
    expect(today).not.toContain('priorityShownAsPopup');
  });

  it('the once-per-day guarantee is an atomic database claim, not a client timer', () => {
    const data = read('lib/priority/data.ts');
    expect(data).toContain('claimPriorityShown');
    expect(data).toContain("is('shown_at', null)");

    const actions = read('app/actions/priority.ts');
    expect(actions).toContain('const won = await claimPriorityShown(');
    expect(actions).toContain('if (!won) return;');
  });

  it('the new rule slugs match the ladder and the migration', () => {
    const fromTypes: PriorityRule[] = ['re_entry', ...PRIORITY_LADDER];
    expect([...PRIORITY_RULES].sort()).toEqual([...fromTypes].sort());

    const migration = readFileSync(
      path.join(REPO_ROOT, 'supabase/migrations/00000000000148_priority_card_popup_delivery.sql'),
      'utf8'
    );
    expect(migration).toContain("'daily_reset'");
    expect(migration).toContain("'gentle_focus'");
    expect(migration).toContain('shown_presentation');
    expect(migration).toContain('shown_at');
  });

  it('carries no health content on the shown payload', () => {
    const actions = read('app/actions/priority.ts');
    expect(actions).toContain('payload: { rule, presentation }');
    for (const banned of ['title', 'reason', 'statedGoalLabel', 'priorityKey']) {
      expect(actions).not.toContain(`payload: { ${banned}`);
    }
  });
});

describe('never during onboarding', () => {
  it('only ever mounts from Home, which onboarding never reaches', () => {
    // The chain lives on the dashboard alone, and middleware sends a member
    // who still owes onboarding to /onboarding instead.
    const middleware = readFileSync(path.join(APP_ROOT, 'middleware.ts'), 'utf8');
    expect(middleware).toContain('/onboarding');
    expect(read('app/dashboard/page.tsx')).toContain('<HomeScreenPopups');
    for (const file of ['app/onboarding/page.tsx']) {
      expect(read(file)).not.toContain('HomeScreenPopups');
      expect(read(file)).not.toContain('PriorityCard');
    }
  });

  it('is also suppressed during the one-time first-check-in transition', () => {
    expect(read('app/dashboard/page.tsx')).toContain("searchParams.firstCheckin !== '1' ? rootPopupMessage : null");
  });
});
