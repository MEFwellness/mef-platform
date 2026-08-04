import { describe, it, expect, vi } from 'vitest';
import { resolveCvsCheckinPending } from '../lib/core-values-snapshot/experiment';
import {
  cvsPopupMessageKey,
  isOfferPopupDue,
  isRootPopupDueThisLogin,
  lscPopupMessageKey,
  pickFirstDueOneTimeMessage,
  questionnaireAssignedPopupMessageKey,
} from '../lib/root-popup-messages/data';

describe('resolveCvsCheckinPending', () => {
  it('is null before day 3', () => {
    expect(
      resolveCvsCheckinPending({
        isDay3Eligible: false,
        day3Answered: false,
        isDay7Eligible: false,
        day7Acknowledged: false,
      })
    ).toBeNull();
  });

  it('is day3 once eligible and unanswered', () => {
    expect(
      resolveCvsCheckinPending({
        isDay3Eligible: true,
        day3Answered: false,
        isDay7Eligible: false,
        day7Acknowledged: false,
      })
    ).toBe('day3');
  });

  it('is null once day 3 is answered and day 7 is not yet eligible', () => {
    expect(
      resolveCvsCheckinPending({
        isDay3Eligible: true,
        day3Answered: true,
        isDay7Eligible: false,
        day7Acknowledged: false,
      })
    ).toBeNull();
  });

  it('is day7 once eligible and unacknowledged, with day 3 already answered', () => {
    expect(
      resolveCvsCheckinPending({
        isDay3Eligible: true,
        day3Answered: true,
        isDay7Eligible: true,
        day7Acknowledged: false,
      })
    ).toBe('day7');
  });

  it('is day3 (oldest unhandled first), even when day 7 has also become eligible, if day 3 was never answered', () => {
    expect(
      resolveCvsCheckinPending({
        isDay3Eligible: true,
        day3Answered: false,
        isDay7Eligible: true,
        day7Acknowledged: false,
      })
    ).toBe('day3');
  });

  it('is null once both are resolved', () => {
    expect(
      resolveCvsCheckinPending({
        isDay3Eligible: true,
        day3Answered: true,
        isDay7Eligible: true,
        day7Acknowledged: true,
      })
    ).toBeNull();
  });
});

describe('cvsPopupMessageKey', () => {
  it('is stable and distinct per kind/experiment', () => {
    expect(cvsPopupMessageKey('day3', 'exp-1')).toBe('cvs_day3:exp-1');
    expect(cvsPopupMessageKey('day7', 'exp-1')).toBe('cvs_day7:exp-1');
    expect(cvsPopupMessageKey('day3', 'exp-1')).not.toBe(cvsPopupMessageKey('day3', 'exp-2'));
  });

  it('has a distinct offer key, keyed by session rather than experiment (no experiment exists yet)', () => {
    expect(cvsPopupMessageKey('offer', 'session-1')).toBe('cvs_offer:session-1');
    expect(cvsPopupMessageKey('offer', 'session-1')).not.toBe(cvsPopupMessageKey('day3', 'session-1'));
  });
});

describe('lscPopupMessageKey', () => {
  it('mirrors cvsPopupMessageKey under its own lsc_ prefix, including offer', () => {
    expect(lscPopupMessageKey('day3', 'exp-1')).toBe('lsc_day3:exp-1');
    expect(lscPopupMessageKey('offer', 'session-1')).toBe('lsc_offer:session-1');
  });
});

describe('isRootPopupDueThisLogin', () => {
  it('is due when never dismissed', () => {
    expect(isRootPopupDueThisLogin(null, '2026-08-01T00:00:00.000Z')).toBe(true);
  });

  it('is never due once ignored', () => {
    expect(
      isRootPopupDueThisLogin({ status: 'ignored', snoozedAt: null }, '2026-08-10T00:00:00.000Z')
    ).toBe(false);
  });

  it('is not due right after "Maybe later", same login (no new sign-in yet)', () => {
    const snoozedAt = '2026-08-01T12:00:00.000Z';
    // last_sign_in_at from the login that produced this snooze, unchanged since.
    expect(isRootPopupDueThisLogin({ status: 'snoozed', snoozedAt }, snoozedAt)).toBe(false);
    // Even an in-session refresh where last_sign_in_at is technically earlier
    // than the snooze timestamp (snooze always happens after login) must not be due.
    expect(
      isRootPopupDueThisLogin({ status: 'snoozed', snoozedAt }, '2026-08-01T09:00:00.000Z')
    ).toBe(false);
  });

  it('is due again once a real login happened after the snooze', () => {
    expect(
      isRootPopupDueThisLogin(
        { status: 'snoozed', snoozedAt: '2026-08-01T12:00:00.000Z' },
        '2026-08-02T08:00:00.000Z'
      )
    ).toBe(true);
  });
});

describe('questionnaireAssignedPopupMessageKey', () => {
  it('is stable and distinct per assignment id', () => {
    expect(questionnaireAssignedPopupMessageKey('assignment-1')).toBe(
      'questionnaire_assigned:assignment-1'
    );
    expect(questionnaireAssignedPopupMessageKey('assignment-1')).not.toBe(
      questionnaireAssignedPopupMessageKey('assignment-2')
    );
  });

  it('gives a new assignment cycle for the same questionnaire a genuinely new key', () => {
    // A coach re-assigning a questionnaire after a prior assignment
    // completed or was cancelled creates a new assessment_assignments row
    // with a new id — this key builder is keyed by that row id, not the
    // questionnaire, so the new cycle's pop-up is never suppressed by the
    // old cycle's dismissal.
    const firstCycleKey = questionnaireAssignedPopupMessageKey('assignment-original');
    const secondCycleKey = questionnaireAssignedPopupMessageKey('assignment-reassigned');
    expect(firstCycleKey).not.toBe(secondCycleKey);
  });
});

describe('pickFirstDueOneTimeMessage', () => {
  // This is the regression target itself. The real bug (documented in
  // app/actions/rootPopupMessages.ts's own header comment, fixed 2026-08-02,
  // commit 85bdb347): a message-selection function that returns the first
  // candidate it finds without checking whether it is still due, and
  // without falling through to the next candidate when it isn't, silently
  // returns null/nothing forever once the first candidate is ever
  // dismissed — starving every later candidate, of any kind, permanently.
  // These tests exercise the exact shared helper the new coach-assigned-
  // questionnaire pop-up branch uses for its own candidate list, proving
  // it cannot reintroduce that failure mode.

  it('returns the first candidate when it is still due (no dismissal), without needing to check later ones', async () => {
    const isDue = vi.fn(async (messageKey: string) => messageKey === 'a');
    const result = await pickFirstDueOneTimeMessage(
      [{ messageKey: 'a' }, { messageKey: 'b' }],
      isDue
    );
    expect(result).toEqual({ messageKey: 'a' });
    expect(isDue).toHaveBeenCalledTimes(1);
  });

  it('falls through to a later candidate once an earlier one is already dismissed, instead of returning null', async () => {
    // 'a' simulates an assignment whose pop-up was already dismissed
    // (isDue -> false); a fixed version must still find 'b'.
    const isDue = vi.fn(async (messageKey: string) => messageKey === 'b');
    const result = await pickFirstDueOneTimeMessage(
      [{ messageKey: 'a' }, { messageKey: 'b' }],
      isDue
    );
    expect(result).toEqual({ messageKey: 'b' });
    expect(isDue).toHaveBeenCalledTimes(2);
  });

  it('falls through past multiple already-dismissed candidates to reach a due one further down the list', async () => {
    // Reproduces the exact multi-candidate shape a member with several
    // pending assignments would hit: the first two pop-ups were already
    // shown and dismissed, only the third (newest assignment) is due.
    const isDue = vi.fn(async (messageKey: string) => messageKey === 'assignment-3');
    const result = await pickFirstDueOneTimeMessage(
      [{ messageKey: 'assignment-1' }, { messageKey: 'assignment-2' }, { messageKey: 'assignment-3' }],
      isDue
    );
    expect(result).toEqual({ messageKey: 'assignment-3' });
  });

  it('returns null only once every candidate has been dismissed, never before', async () => {
    const isDue = vi.fn(async () => false);
    const result = await pickFirstDueOneTimeMessage(
      [{ messageKey: 'a' }, { messageKey: 'b' }, { messageKey: 'c' }],
      isDue
    );
    expect(result).toBeNull();
    expect(isDue).toHaveBeenCalledTimes(3);
  });

  it('returns null immediately for an empty candidate list (no pending assignments)', async () => {
    const isDue = vi.fn(async () => true);
    const result = await pickFirstDueOneTimeMessage([], isDue);
    expect(result).toBeNull();
    expect(isDue).not.toHaveBeenCalled();
  });
});

describe('isOfferPopupDue', () => {
  it('is due the first time, before any dismissal exists', () => {
    expect(isOfferPopupDue(null)).toBe(true);
  });

  it('is never due again once any dismissal exists, ignored or snoozed alike', () => {
    // RootMessagePopupClient always writes 'ignored' the instant the offer
    // is shown, but this must hold for either status — the offer's "only
    // once, ever" promise doesn't depend on which status gets written.
    expect(isOfferPopupDue({ status: 'ignored', snoozedAt: null })).toBe(false);
    expect(isOfferPopupDue({ status: 'snoozed', snoozedAt: '2026-08-01T12:00:00.000Z' })).toBe(false);
  });

  it('unlike isRootPopupDueThisLogin, a later login never revives a dismissed offer', () => {
    const dismissal = { status: 'snoozed' as const, snoozedAt: '2026-08-01T12:00:00.000Z' };
    // The day3/day7 rule would say this is due again after a later login...
    expect(isRootPopupDueThisLogin(dismissal, '2026-08-02T08:00:00.000Z')).toBe(true);
    // ...but the offer's own rule ignores login timing entirely once dismissed.
    expect(isOfferPopupDue(dismissal)).toBe(false);
  });
});

describe('FIX 5 (2026-08-03): questionnaire_assigned and free_arc_available use recurring semantics, not one-time-ever', () => {
  // app/actions/rootPopupMessages.ts's own findMyPendingRootPopupMessage
  // now checks each assignment candidate with isRootPopupDueThisLogin
  // (via a local isRecurringMessageDue closure), not isOfferPopupDue —
  // exercised here through the exact same pickFirstDueOneTimeMessage
  // helper that call site uses, proving "Maybe later" (snoozed) really
  // does come back on a later login for this message kind, unlike the
  // old one-time-ever shape.

  it('a snoozed assignment candidate is skipped this login, but becomes due again on pickFirstDueOneTimeMessage after a later login', async () => {
    const messageKey = questionnaireAssignedPopupMessageKey('assignment-1');
    const snoozedAt = '2026-08-03T09:00:00.000Z';

    const isDueSameLogin = (key: string) =>
      Promise.resolve(
        key === messageKey
          ? isRootPopupDueThisLogin({ status: 'snoozed', snoozedAt }, snoozedAt)
          : true
      );
    const resultSameLogin = await pickFirstDueOneTimeMessage([{ messageKey }], isDueSameLogin);
    expect(resultSameLogin).toBeNull();

    const isDueLaterLogin = (key: string) =>
      Promise.resolve(
        key === messageKey
          ? isRootPopupDueThisLogin({ status: 'snoozed', snoozedAt }, '2026-08-04T08:00:00.000Z')
          : true
      );
    const resultLaterLogin = await pickFirstDueOneTimeMessage([{ messageKey }], isDueLaterLogin);
    expect(resultLaterLogin).toEqual({ messageKey });
  });

  it('an ignored assignment candidate never becomes due again, on any later login', async () => {
    const messageKey = questionnaireAssignedPopupMessageKey('assignment-2');
    const isDue = (key: string) =>
      Promise.resolve(
        key === messageKey ? isRootPopupDueThisLogin({ status: 'ignored', snoozedAt: null }, '2099-01-01T00:00:00.000Z') : true
      );
    const result = await pickFirstDueOneTimeMessage([{ messageKey }], isDue);
    expect(result).toBeNull();
  });
});
