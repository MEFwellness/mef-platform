'use server';

/**
 * The Signal Library's coach reads and coach writes.
 *
 * COACH ONLY, AND CHECKED HERE AS WELL AS IN THE DATABASE. Every function
 * below establishes the caller as a coach or an administrator before it
 * reads or writes anything, and then asks lib/staff/testAccounts.ts
 * whether this member may be shown to this viewer at all. Row level
 * security is the real boundary (migration 240 gives this feature no
 * member policy of any kind), and these are the checks that keep a wrong
 * caller from getting an empty screen instead of somebody else's data.
 *
 * NOTHING HERE IS REACHABLE FROM A MEMBER SURFACE. There is no member
 * facing action in this file and no member facing route imports it. A
 * member's own session calling one of these gets the empty panel, and her
 * session could not read the rows even if it did not.
 *
 * NOTHING HERE RUNS ON A RENDER. The panel's read is called by the client
 * detail page, which is a read. The write is called because a coach
 * pressed Save.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { isMemberVisibleToStaff } from '@/lib/staff/testAccounts';
import { hearComplaints } from '@/lib/cross-system-complaints/service';
import { SURFACE_COACH_OBSERVATION } from '@/lib/cross-system-complaints/constants';
import { memberTimezone } from '@/lib/time/memberToday';
import { todaysLocalDate } from '@/lib/time/localDate';
import { SOURCE_COACH_ENTERED } from '@/lib/cross-system-signals/constants';
import { forgetSignalLibrary, loadSignalLibrary } from '@/lib/cross-system-signals/contentData';
import {
  ensureSignalName,
  insertCoachSignal,
  listSignalsForMember,
} from '@/lib/cross-system-signals/data';
import { resolveCoachSignal, type CoachSignalInput } from '@/lib/cross-system-signals/entry';
import { sourceLabel } from '@/lib/cross-system-signals/library';
import { buildCoachSignalsView, type CoachSignalsView } from '@/lib/cross-system-signals/coachView';
import { evaluateMember } from '@/lib/cross-system-patterns/evaluate';
import type {
  SignalBodyArea,
  SignalCategory,
  SignalSymptomType,
  StandardizedSignalName,
} from '@/lib/cross-system-signals/types';

/** Everything the Signals section draws, in one read. */
export type CoachSignalsPanelState = {
  memberId: string | null;
  view: CoachSignalsView;
  /** The vocabularies the entry tool taps through. */
  categories: SignalCategory[];
  bodyAreas: SignalBodyArea[];
  symptoms: SignalSymptomType[];
  /** Only the names a coach may enter. The instrument rollups are not offered. */
  searchableNames: StandardizedSignalName[];
};

const EMPTY_PANEL: CoachSignalsPanelState = {
  memberId: null,
  view: { groups: [], signalCount: 0, entryCount: 0, latestCapturedOn: null },
  categories: [],
  bodyAreas: [],
  symptoms: [],
  searchableNames: [],
};

async function isCoachOrAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  return (
    (await hasActiveRole(supabase, userId, 'coach')) ||
    (await hasActiveRole(supabase, userId, 'platform_administrator'))
  );
}

/**
 * The member's signals and the vocabularies behind the entry tool.
 *
 * Test accounts never reach a staff surface, and that is enforced through
 * lib/staff/testAccounts.ts rather than by this screen remembering.
 */
export async function getClientSignalsPanelAction(
  clientId: string
): Promise<CoachSignalsPanelState> {
  const user = await getCachedUser();
  if (!user) return EMPTY_PANEL;
  const supabase = createClient();

  if (!(await isCoachOrAdmin(supabase, user.id))) return EMPTY_PANEL;
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return EMPTY_PANEL;

  const [library, signalRead] = await Promise.all([
    loadSignalLibrary(supabase),
    listSignalsForMember(supabase, clientId),
  ]);

  return {
    memberId: clientId,
    view: buildCoachSignalsView(signalRead.records, library),
    categories: [...library.categories.values()].sort((a, b) => a.position - b.position),
    bodyAreas: [...library.bodyAreas.values()].sort((a, b) => a.position - b.position),
    symptoms: [...library.symptoms.values()].sort((a, b) => a.position - b.position),
    searchableNames: [...library.names.values()].filter((name) => name.isCoachAddable),
  };
}

export type AddCoachSignalResult = { ok: true } | { ok: false; error: string };

/**
 * One signal, typed by a coach, dated today in the MEMBER'S timezone.
 *
 * TODAY IS HERS, NOT HIS AND NOT THE SERVER'S. A coach working late in
 * London recording something for a member in Denver dates it the day the
 * member is living in, which is the day every other signal on that
 * timeline is dated by.
 *
 * THE LIBRARY GROWS FROM HERE. A composed name the library has never held
 * ("Hip clicking" the first time anybody taps it) is added as a
 * standardized name, once, so every later entry and every later search
 * finds it. Migration 240's coach insert policy on the names table is what
 * allows that, and it is insert only: a coach cannot rename or retire one.
 */
export async function addCoachSignalAction(
  clientId: string,
  input: CoachSignalInput
): Promise<AddCoachSignalResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };
  const supabase = createClient();

  if (!(await isCoachOrAdmin(supabase, user.id))) return { ok: false, error: 'Not allowed.' };
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) {
    return { ok: false, error: 'Not allowed.' };
  }

  const library = await loadSignalLibrary(supabase);
  const resolution = resolveCoachSignal(input, library);
  if (!resolution.ok) return { ok: false, error: resolution.error };
  const signal = resolution.signal;

  if (signal.isNewName) {
    const added = await ensureSignalName(supabase, {
      signalSlug: signal.signalSlug,
      displayName: signal.signalName,
      categoryKey: signal.categoryKey,
      bodyAreaKey: signal.bodyAreaKey,
      symptomKey: signal.symptomKey,
    });
    if (!added) return { ok: false, error: 'Could not save that signal. Please try again.' };
    // The held bundle is now out of date by exactly one name, and the next
    // read of this panel is the one that needs it.
    forgetSignalLibrary();
  }

  const timezone = await memberTimezone(supabase, clientId);
  const write = await insertCoachSignal(supabase, {
    memberId: clientId,
    coachId: user.id,
    signalSlug: signal.signalSlug,
    signalName: signal.signalName,
    categoryKey: signal.categoryKey,
    bodyAreaKey: signal.bodyAreaKey,
    symptomKey: signal.symptomKey,
    side: signal.side,
    valueKey: signal.valueKey,
    valueLabel: signal.valueLabel,
    valueNumeric: signal.valueNumeric,
    sourceLabel: sourceLabel(library, SOURCE_COACH_ENTERED),
    // The DAY is hers, resolved from her zone. The INSTANT is the real
    // one, which is what a timestamptz column means and what two rows
    // captured on one day are ordered by.
    capturedOn: todaysLocalDate(timezone),
    capturedAt: new Date().toISOString(),
    note: signal.note,
  });
  if (!write.ok) return { ok: false, error: 'Could not save that signal. Please try again.' };

  // RE-EVALUATION, THE SECOND OF THE THREE TRIGGERS (Prompt 3). Her
  // timeline has a new row on it, so the patterns it meets may have
  // changed. Best effort and after the fact: the signal is already stored
  // and a failed evaluation is logged and swallowed inside evaluateMember,
  // because losing an audit row must never cost a coach her entry.
  //
  // IT USES THE ENGINE'S OWN TRUSTED CONNECTION rather than her session,
  // for the reason migration 245 states: no role has a write policy on the
  // ledger at all, so a coach cannot manufacture a match by hand either.
  await evaluateMember({ memberId: clientId, reason: 'coach_signal_added' });

  // THE COACH'S OWN NOTE ON THE SIGNAL, read by the same pipeline.
  //
  // The signal she just entered is structured already: a name, an area, a
  // side, a value. The NOTE beside it is the part in words, and it is
  // routinely where the rest of the picture is ("only on stairs, and her
  // left ankle has been swelling too"). That second half was reaching
  // nothing.
  //
  // IT CANNOT MANUFACTURE THE SAME SIGNAL TWICE. The structured entry
  // wrote its own row through her session a moment ago; anything the
  // classifier finds in the note writes its own rows under a different
  // source and a fingerprint of its own, and the coach's Signals list
  // shows both for what they are.
  //
  // COACH ONLY, STRUCTURALLY, for the reason migration 246 gives: not one
  // of these tables carries a member policy.
  await hearComplaints([
    {
      memberId: clientId,
      surfaceKey: SURFACE_COACH_OBSERVATION,
      rawText: signal.note ?? '',
      fieldRef: 'coach_signal_note',
      fieldPrompt: 'Coach observation recorded with a signal',
      reportedAt: new Date().toISOString(),
      authorRole: 'coach',
      authoredBy: user.id,
    },
  ]);

  revalidatePath(`/coach/clients/${clientId}/detail`);
  return { ok: true };
}
