import { describe, it, expect } from 'vitest';
import { resolveCvsCheckinPending } from '../lib/core-values-snapshot/experiment';
import { cvsPopupMessageKey, isOfferPopupDue, isRootPopupDueThisLogin, lscPopupMessageKey } from '../lib/root-popup-messages/data';

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
