'use server';

/**
 * The Body Systems Survey question to signal mapping: the coach's one read
 * and her one write.
 *
 * COACH ONLY, AND CHECKED HERE AS WELL AS IN THE DATABASE. Every function
 * establishes the caller as a coach or an administrator before it reads or
 * writes anything. Migration 258 is the real boundary: no member policy on
 * the revisions, and a coach may only append a revision signed by herself
 * and move the head of a survey question's mapping.
 *
 * NOTHING HERE READS A MEMBER. The mapping is authored content, like the
 * Association Map. Editing it changes what future sittings file and never
 * rewrites a signal already on anybody's timeline.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { loadMemberContent } from '@/lib/body-systems/contentData';
import { forgetSignalLibrary, loadSignalLibrary } from '@/lib/cross-system-signals/contentData';
import {
  SURVEY_SIGNAL_MAPPING_HREF,
  buildSurveyMappingView,
  resolveMappingEdit,
  type SurveyMappingView,
} from '@/lib/cross-system-signals/surveyMapping';
import {
  listSurveyMappingHeads,
  listSurveyMappingRevisions,
  readSurveyMappingHead,
  writeSurveyMappingRevision,
} from '@/lib/cross-system-signals/surveyMappingData';
import type { SignalBodyArea, StandardizedSignalName } from '@/lib/cross-system-signals/types';

export type SurveySignalMappingState = {
  allowed: boolean;
  view: SurveyMappingView;
  /** Every active canonical signal, for the picker. The picker cannot offer a name that does not exist. */
  signalNames: StandardizedSignalName[];
  bodyAreas: SignalBodyArea[];
};

const EMPTY_STATE: SurveySignalMappingState = {
  allowed: false,
  view: { sections: [], questionCount: 0, mappedCount: 0, inactiveCount: 0 },
  signalNames: [],
  bodyAreas: [],
};

async function coachOrAdmin(): Promise<{ supabase: ReturnType<typeof createClient>; userId: string } | null> {
  const user = await getCachedUser();
  if (!user) return null;
  const supabase = createClient();
  const allowed =
    (await hasActiveRole(supabase, user.id, 'coach')) ||
    (await hasActiveRole(supabase, user.id, 'platform_administrator'));
  if (!allowed) return null;
  return { supabase, userId: user.id };
}

export async function getSurveySignalMappingAction(): Promise<SurveySignalMappingState> {
  const session = await coachOrAdmin();
  if (!session) return EMPTY_STATE;

  const [content, library, heads, revisions] = await Promise.all([
    loadMemberContent(session.supabase),
    loadSignalLibrary(session.supabase),
    listSurveyMappingHeads(session.supabase),
    listSurveyMappingRevisions(session.supabase),
  ]);

  return {
    allowed: true,
    view: buildSurveyMappingView({
      sections: content.sections,
      questions: content.questions,
      heads: heads.heads,
      revisions: revisions.revisions,
      names: library.names,
      bodyAreas: library.bodyAreas,
    }),
    signalNames: [...library.names.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    ),
    bodyAreas: [...library.bodyAreas.values()].sort((a, b) => a.position - b.position),
  };
}

export type SaveSurveySignalMappingResult = { ok: true } | { ok: false; error: string };

export async function saveSurveySignalMappingAction(
  raw: unknown
): Promise<SaveSurveySignalMappingResult> {
  const session = await coachOrAdmin();
  if (!session) return { ok: false, error: 'Only a coach can change this mapping.' };

  const questionRef =
    raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).questionRef === 'string'
      ? ((raw as Record<string, unknown>).questionRef as string)
      : '';

  const [content, library, head] = await Promise.all([
    loadMemberContent(session.supabase),
    loadSignalLibrary(session.supabase),
    readSurveyMappingHead(session.supabase, questionRef),
  ]);

  const resolved = resolveMappingEdit(raw, {
    questions: content.questions,
    names: library.names,
    bodyAreas: library.bodyAreas,
    head,
  });
  if (!resolved.ok) return resolved;

  const written = await writeSurveyMappingRevision(session.supabase, {
    edit: resolved.edit,
    revisionNumber: resolved.nextRevision,
    coachId: session.userId,
    at: new Date().toISOString(),
  });
  if (!written.ok) return written;

  // The dictionary adapters read is held for a few minutes. Dropped here so
  // the next sitting this process files uses the mapping she just saved.
  forgetSignalLibrary();
  revalidatePath(SURVEY_SIGNAL_MAPPING_HREF);
  return { ok: true };
}
