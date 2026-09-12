/**
 * THE ONE ENTRY POINT BEHIND AN INLINE ASSIGN BUTTON (2026-09-08).
 *
 * A coach now sends any of twenty assessments from one button on one row,
 * and two different write paths sit behind that button: the registry
 * questionnaires go through `assignAssessmentAction`, and the ten
 * coach-assigned experiences go through their own actions, each holding
 * its own default due date and its own idempotent duplicate-click
 * behaviour.
 *
 * WHAT HAS TO BE TRUE, and none of it is visible from the screen:
 *
 *   IT DISPATCHES, IT DOES NOT INSERT. Every row reaches the action that
 *     already owned that write. An eleventh insert path would race the partial
 *     unique index behind these rows rather than be caught by it.
 *   A ROW NOBODY OFFERS IS REFUSED BEFORE ANYTHING IS READ. A stale page
 *     and a hand-made POST both exist, and the screen is not where this is
 *     decided.
 *   IT DROPS WHAT THE ROW CANNOT HOLD. A deep-dive stores no reason and is
 *     always required, so a POST carrying either changes nothing: the
 *     values never reach the write. The form draws no field for them from
 *     the same capability table, so the screen and the server agree by
 *     construction.
 *   A DUE DATE IS A CALENDAR DAY OR IT IS NOTHING. Anything that is not a
 *     bare YYYY-MM-DD is dropped rather than passed on as a guess, which
 *     leaves each action's own default in place.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const assignAssessmentAction = vi.fn(async () => ({}) as { error?: string });
vi.mock('@/app/actions/assessmentAssignments', () => ({ assignAssessmentAction }));

/** One spy per deep-dive, so a dispatch to the wrong one is a failure and not a coincidence. */
const deepDive = {
  'body-systems-survey': vi.fn(async () => ({ ok: true })),
  'whole-body-signal': vi.fn(async () => ({ ok: true })),
  'health-lifestyle-intake': vi.fn(async () => ({ ok: true })),
  'breathing-pattern-check-in': vi.fn(async () => ({ ok: true })),
  'stress-load-deep-dive': vi.fn(async () => ({ ok: true })),
  'owning-your-value': vi.fn(async () => ({ ok: true })),
  'where-your-joy-lives': vi.fn(async () => ({ ok: true })),
  'the-giving-ledger': vi.fn(async () => ({ ok: true })),
  'the-weight-of-yes': vi.fn(async () => ({ ok: true })),
  'being-seen': vi.fn(async () => ({ ok: true })),
  'what-you-put-down': vi.fn(async () => ({ ok: true })),
  'your-own-company': vi.fn(async () => ({ ok: true })),
  'the-life-youre-building': vi.fn(async () => ({ ok: true })),
};

vi.mock('@/app/actions/bodySystems', () => ({
  assignBodySystemsSurveyAction: deepDive['body-systems-survey'],
}));
vi.mock('@/app/actions/wholeBodySignal', () => ({
  assignWholeBodySignalAction: deepDive['whole-body-signal'],
}));
vi.mock('@/app/actions/healthIntake', () => ({
  assignHealthIntakeAction: deepDive['health-lifestyle-intake'],
}));
vi.mock('@/app/actions/breathingCheckInCoach', () => ({
  assignBreathingCheckInAction: deepDive['breathing-pattern-check-in'],
}));
vi.mock('@/app/actions/stressLoad', () => ({
  assignStressLoadDeepDiveAction: deepDive['stress-load-deep-dive'],
}));
vi.mock('@/app/actions/owningYourValue', () => ({
  assignOwningYourValueAction: deepDive['owning-your-value'],
}));
vi.mock('@/app/actions/whereYourJoyLives', () => ({
  assignWhereYourJoyLivesAction: deepDive['where-your-joy-lives'],
}));
vi.mock('@/app/actions/theGivingLedger', () => ({
  assignTheGivingLedgerAction: deepDive['the-giving-ledger'],
}));
vi.mock('@/app/actions/theWeightOfYes', () => ({
  assignTheWeightOfYesAction: deepDive['the-weight-of-yes'],
}));
vi.mock('@/app/actions/beingSeen', () => ({ assignBeingSeenAction: deepDive['being-seen'] }));
vi.mock('@/app/actions/whatYouPutDown', () => ({
  assignWhatYouPutDownAction: deepDive['what-you-put-down'],
}));
vi.mock('@/app/actions/yourOwnCompany', () => ({
  assignYourOwnCompanyAction: deepDive['your-own-company'],
}));
vi.mock('@/app/actions/theLifeYoureBuilding', () => ({
  assignTheLifeYoureBuildingAction: deepDive['the-life-youre-building'],
}));

const { assignAssessmentRowAction } = await import('@/app/actions/coachAssessmentRowAssign');
const { listAssignableTemplates } = await import('@/lib/assignments/assignableCatalog');

const TEMPLATES = listAssignableTemplates();

beforeEach(() => {
  assignAssessmentAction.mockClear();
  assignAssessmentAction.mockResolvedValue({});
  for (const spy of Object.values(deepDive)) {
    spy.mockClear();
    spy.mockResolvedValue({ ok: true });
  }
});

function calledSpies(): string[] {
  return Object.entries(deepDive)
    .filter(([, spy]) => spy.mock.calls.length > 0)
    .map(([id]) => id);
}

describe('every row reaches the write that already owned it', () => {
  it('a registry questionnaire goes through assignAssessmentAction with its own key', async () => {
    const four = TEMPLATES.find((t) => t.id === 'four-doctors')!;
    const result = await assignAssessmentRowAction('member-1', four.id, {
      isRequired: true,
      reason: 'to open the nutrition conversation',
      dueDate: '2026-09-20',
    });
    expect(result).toEqual({ ok: true });
    expect(assignAssessmentAction).toHaveBeenCalledWith('member-1', four.assignKey, {
      isRequired: true,
      reason: 'to open the nutrition conversation',
      dueAt: '2026-09-20',
      stage: 'standard',
    });
    expect(calledSpies()).toEqual([]);
  });

  it.each(Object.keys(deepDive))('%s goes to its own action and to no other', async (rowId) => {
    const result = await assignAssessmentRowAction('member-1', rowId, { dueDate: '2026-09-15' });
    expect(result).toEqual({ ok: true });
    expect(calledSpies()).toEqual([rowId]);
    expect(deepDive[rowId as keyof typeof deepDive]).toHaveBeenCalledWith('member-1', {
      dueDate: '2026-09-15',
    });
    expect(assignAssessmentAction).not.toHaveBeenCalled();
  });

  it('every deep-dive in the catalog has an action here, so no row is unsendable by omission', () => {
    const withoutKey = TEMPLATES.filter((t) => t.assignKey === null).map((t) => t.id);
    expect(withoutKey.sort()).toEqual(Object.keys(deepDive).sort());
  });
});

describe('the server refuses what the screen never offered', () => {
  it('a row id nobody offers is refused before anything is read', async () => {
    const result = await assignAssessmentRowAction('member-1', 'not-a-real-row', {});
    expect(result).toEqual({ ok: false, error: 'That assessment cannot be sent from here.' });
    expect(assignAssessmentAction).not.toHaveBeenCalled();
    expect(calledSpies()).toEqual([]);
  });

  it('a missing client or a missing row writes nothing', async () => {
    expect(await assignAssessmentRowAction('', 'four-doctors', {})).toEqual({
      ok: false,
      error: 'Unknown client.',
    });
    expect(await assignAssessmentRowAction('member-1', '', {})).toEqual({
      ok: false,
      error: 'Unknown assessment.',
    });
    expect(await assignAssessmentRowAction(null, 'four-doctors', {})).toMatchObject({ ok: false });
    expect(assignAssessmentAction).not.toHaveBeenCalled();
    expect(calledSpies()).toEqual([]);
  });

  /**
   * The rule this exists for: a button never claims what the rows cannot
   * support. A deep-dive stores no reason and is always required, so a
   * hand-made POST carrying either has to change nothing at all.
   */
  it('drops a reason and a Required flag a deep-dive has nowhere to put', async () => {
    await assignAssessmentRowAction('member-1', 'being-seen', {
      isRequired: false,
      reason: 'smuggled in by a stale page',
      dueDate: '2026-09-15',
    });
    expect(deepDive['being-seen']).toHaveBeenCalledWith('member-1', { dueDate: '2026-09-15' });
    expect(deepDive['being-seen'].mock.calls[0]).toHaveLength(2);
  });

  it('a due date that is not a calendar day is dropped, leaving the action its own default', async () => {
    for (const bad of ['tomorrow', '2026-9-1', '', '2026-09-20T00:00:00Z', 42, null]) {
      deepDive['being-seen'].mockClear();
      await assignAssessmentRowAction('member-1', 'being-seen', { dueDate: bad });
      expect(deepDive['being-seen'], String(bad)).toHaveBeenCalledWith('member-1', undefined);
    }
  });

  it('a blank due date on a registry row is passed on as blank, never as a guess', async () => {
    await assignAssessmentRowAction('member-1', 'four-doctors', { dueDate: 'tomorrow' });
    expect((assignAssessmentAction.mock.calls[0] as unknown[])[2]).toMatchObject({ dueAt: '' });
  });
});

describe('a refusal underneath is reported, never swallowed', () => {
  it('an error from assignAssessmentAction comes back as the row error', async () => {
    assignAssessmentAction.mockResolvedValue({ error: 'Unknown assessment.' });
    expect(await assignAssessmentRowAction('member-1', 'four-doctors', {})).toEqual({
      ok: false,
      error: 'Unknown assessment.',
    });
  });

  it('a refusal from a deep-dive action comes back the same way', async () => {
    deepDive['being-seen'].mockResolvedValue({ ok: false, error: 'Not allowed.' } as never);
    expect(await assignAssessmentRowAction('member-1', 'being-seen', {})).toEqual({
      ok: false,
      error: 'Not allowed.',
    });
  });
});
