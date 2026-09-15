'use server';

/**
 * The Relationship Library's coach reads and coach writes.
 *
 * COACH ONLY, AND CHECKED HERE AS WELL AS IN THE DATABASE. Every function
 * below establishes the caller as a coach or an administrator before it
 * reads or writes anything. Row level security is the real boundary
 * (migration 243 gives this feature no member policy of any kind), and
 * these are the checks that keep a wrong caller from getting an empty
 * screen instead of somebody else's work.
 *
 * NOTHING HERE IS REACHABLE FROM A MEMBER SURFACE. There is no member
 * facing action in this file and no member facing route imports it.
 *
 * NOTHING HERE IS A MATCH. No function reads a member's signals, scores
 * anything or decides that a member is showing a pattern. This file writes
 * down what the coach knows. Matching is Prompt 3.
 *
 * NOTHING HERE RUNS ON A RENDER. The list read is called by the editor
 * page, which is a read. Every write is called because the coach pressed
 * a button.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { forgetSignalLibrary, loadSignalLibrary } from '@/lib/cross-system-signals/contentData';
import { ensureSignalName } from '@/lib/cross-system-signals/data';
import { slugify } from '@/lib/cross-system-signals/library';
import type {
  SignalBodyArea,
  SignalCategory,
  StandardizedSignalName,
} from '@/lib/cross-system-signals/types';
import { RELATIONSHIP_LIBRARY_HREF } from '@/lib/cross-system-relationships/constants';
import { buildPatternKey, resolveRelationshipDraft } from '@/lib/cross-system-relationships/draft';
import {
  createRelationship,
  deleteRelationship,
  getRelationship,
  listPatternKeys,
  listRelationships,
  saveNewVersion,
  setRelationshipActive,
} from '@/lib/cross-system-relationships/data';
import type {
  RelationshipDetail,
  RelationshipDraft,
  RelationshipSummary,
} from '@/lib/cross-system-relationships/types';

/** Everything the editor draws, in one read. */
export type RelationshipLibraryState = {
  /** False when the caller is not staff, so the screen says so rather than showing an empty library. */
  allowed: boolean;
  summaries: RelationshipSummary[];
  /** The pickers, driven by exactly the same vocabularies the Signal Library uses. */
  categories: SignalCategory[];
  bodyAreas: SignalBodyArea[];
  signalNames: StandardizedSignalName[];
};

const EMPTY_STATE: RelationshipLibraryState = {
  allowed: false,
  summaries: [],
  categories: [],
  bodyAreas: [],
  signalNames: [],
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

/**
 * The whole library plus the vocabularies behind the pickers.
 *
 * THE PICKERS ARE THE SIGNAL LIBRARY'S OWN LISTS. Categories, body areas
 * and standardized signal names all come from loadSignalLibrary, which is
 * the same call the ingestion adapters and the Add Signal tool make. There
 * is no second vocabulary for relationships and there must never be one.
 */
export async function getRelationshipLibraryAction(): Promise<RelationshipLibraryState> {
  const session = await coachOrAdmin();
  if (!session) return EMPTY_STATE;

  const [library, listed] = await Promise.all([
    loadSignalLibrary(session.supabase),
    listRelationships(session.supabase),
  ]);

  return {
    allowed: true,
    summaries: listed.summaries,
    categories: [...library.categories.values()].sort((a, b) => a.position - b.position),
    bodyAreas: [...library.bodyAreas.values()].sort((a, b) => a.position - b.position),
    signalNames: [...library.names.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    ),
  };
}

/** One relationship and its whole version trail, for the history view. */
export async function getRelationshipAction(
  relationshipId: string
): Promise<RelationshipDetail | null> {
  const session = await coachOrAdmin();
  if (!session) return null;
  return getRelationship(session.supabase, relationshipId);
}

export type SaveRelationshipResult =
  | { ok: true; relationshipId: string; versionNumber: number }
  | { ok: false; error: string };

/**
 * A brand new relationship, at version 1.
 *
 * IT IS SAVED INACTIVE, whatever the form thinks. A definition the coach
 * has just typed has not been decided on yet, and a pattern that could
 * surface the instant it was saved would be a half written one surfacing.
 * She turns it on with the toggle when she is ready.
 */
export async function createRelationshipAction(
  draft: RelationshipDraft
): Promise<SaveRelationshipResult> {
  const session = await coachOrAdmin();
  if (!session) return { ok: false, error: 'Not allowed.' };

  const library = await loadSignalLibrary(session.supabase);
  const resolution = resolveRelationshipDraft(draft, library);
  if (!resolution.ok) return { ok: false, error: resolution.error };

  const taken = await listPatternKeys(session.supabase);
  const patternKey = buildPatternKey(resolution.draft.patternName, taken);

  const written = await createRelationship(session.supabase, {
    patternKey,
    coachId: session.userId,
    draft: resolution.draft,
  });
  if (!written.ok) return written;

  revalidatePath(RELATIONSHIP_LIBRARY_HREF);
  return written;
}

/**
 * An edit, which is always the NEXT version rather than a rewrite of this
 * one. Migration 243 gives the version tables no update policy at all, so
 * this is the only shape an edit can take.
 */
export async function saveRelationshipVersionAction(
  relationshipId: string,
  draft: RelationshipDraft
): Promise<SaveRelationshipResult> {
  const session = await coachOrAdmin();
  if (!session) return { ok: false, error: 'Not allowed.' };

  const library = await loadSignalLibrary(session.supabase);
  const resolution = resolveRelationshipDraft(draft, library);
  if (!resolution.ok) return { ok: false, error: resolution.error };

  const written = await saveNewVersion(session.supabase, {
    relationshipId,
    coachId: session.userId,
    draft: resolution.draft,
  });
  if (!written.ok) return written;

  revalidatePath(RELATIONSHIP_LIBRARY_HREF);
  return written;
}

/**
 * A copy of an existing pattern, at version 1 of its own, inactive.
 *
 * It copies the CURRENT version's composition and text and nothing else:
 * the original's history belongs to the original, and a duplicate that
 * arrived carrying somebody else's version trail would make "which
 * definition did that match read" unanswerable.
 */
export async function duplicateRelationshipAction(
  relationshipId: string
): Promise<SaveRelationshipResult> {
  const session = await coachOrAdmin();
  if (!session) return { ok: false, error: 'Not allowed.' };

  const detail = await getRelationship(session.supabase, relationshipId);
  if (!detail) return { ok: false, error: 'That pattern is no longer in the library.' };

  const source = detail.current;
  const draft: RelationshipDraft = {
    patternName: `Copy of ${source.patternName}`,
    minSupportingSignals: source.minSupportingSignals,
    possibleAssociationText: source.possibleAssociationText,
    evidenceNotes: source.evidenceNotes,
    changeSummary: null,
    components: source.components.map((component) => ({
      role: component.role,
      refKind: component.refKind,
      refKey: component.refKey,
      side: component.side,
      valueKey: component.valueKey,
      valueLabel: component.valueLabel,
      minValueNumeric: component.minValueNumeric,
      sourceKey: component.sourceKey,
      sourceQuestionRef: component.sourceQuestionRef,
      sourceQuestionPrompt: component.sourceQuestionPrompt,
      note: component.note,
    })),
    strengthLevels: source.strengthLevels.map((level) => ({
      levelKey: level.levelKey,
      displayLabel: level.displayLabel,
      minSupportingSignals: level.minSupportingSignals,
      minDistinctCategories: level.minDistinctCategories,
      minRelatedSignals: level.minRelatedSignals,
    })),
    considerations: source.considerations.map((item) => item.body),
  };

  return createRelationshipAction(draft);
}

export type ToggleRelationshipResult = { ok: true } | { ok: false; error: string };

/** Active or inactive. The one thing about a relationship that moves without a new version. */
export async function setRelationshipActiveAction(
  relationshipId: string,
  isActive: boolean
): Promise<ToggleRelationshipResult> {
  const session = await coachOrAdmin();
  if (!session) return { ok: false, error: 'Not allowed.' };

  const written = await setRelationshipActive(session.supabase, relationshipId, isActive);
  if (!written) return { ok: false, error: 'Could not change that. Please try again.' };

  revalidatePath(RELATIONSHIP_LIBRARY_HREF);
  return { ok: true };
}

/** Removes a relationship and every version under it. */
export async function deleteRelationshipAction(
  relationshipId: string
): Promise<ToggleRelationshipResult> {
  const session = await coachOrAdmin();
  if (!session) return { ok: false, error: 'Not allowed.' };

  const written = await deleteRelationship(session.supabase, relationshipId);
  if (!written) return { ok: false, error: 'Could not remove that. Please try again.' };

  revalidatePath(RELATIONSHIP_LIBRARY_HREF);
  return { ok: true };
}

export type AddSignalNameResult =
  | { ok: true; name: StandardizedSignalName }
  | { ok: false; error: string };

/**
 * A standardized signal name added from inside this editor.
 *
 * SAME DOOR THE ADD SIGNAL TOOL USES. It writes through ensureSignalName,
 * which is an insert that ignores a conflict, so composing a name that
 * already exists leaves the reviewed row alone rather than re-filing it
 * under a new category. Migration 240's coach insert policy on the names
 * table is what allows it, and it is insert only: nothing here can rename
 * or retire a name that stored signals already point at.
 */
export async function addStandardizedSignalNameAction(
  displayName: string,
  categoryKey: string
): Promise<AddSignalNameResult> {
  const session = await coachOrAdmin();
  if (!session) return { ok: false, error: 'Not allowed.' };

  const cleaned = displayName.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (cleaned.length < 2) return { ok: false, error: 'Give the signal a name.' };

  const library = await loadSignalLibrary(session.supabase);
  if (!library.categories.has(categoryKey)) {
    return { ok: false, error: 'Choose a body system for the new signal.' };
  }

  const slug = slugify(cleaned);
  if (slug.length === 0) return { ok: false, error: 'Give the signal a name.' };

  const existing = library.names.get(slug);
  if (existing) return { ok: true, name: existing };

  const added = await ensureSignalName(session.supabase, {
    signalSlug: slug,
    displayName: cleaned,
    categoryKey,
    bodyAreaKey: null,
    symptomKey: null,
  });
  if (!added) return { ok: false, error: 'Could not add that signal. Please try again.' };

  // The held bundle is now out of date by exactly one name, and the next
  // read of this page is the one that needs it.
  forgetSignalLibrary();

  return {
    ok: true,
    name: {
      signalSlug: slug,
      displayName: cleaned,
      categoryKey,
      defaultBodyAreaKey: null,
      defaultSymptomKey: null,
      searchTerms: '',
      isCoachAddable: true,
    },
  };
}
