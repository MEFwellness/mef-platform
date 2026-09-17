/**
 * THE BODY SYSTEMS SURVEY QUESTION TO SIGNAL MAPPING, AS AUTHORED CONTENT.
 * Pure: the view a coach reviews it in, and the check an edit must pass.
 *
 * WHAT THE MAPPING IS. Migration 241's dictionary names, for every one of
 * the survey's 111 questions, the canonical signal it means. It is not a
 * phrase match and not a string transform: a question with no active row
 * produces no signal. Migration 258 made it editable and versioned, the
 * way the Relationship Library is: an edit appends the next revision and
 * then moves the head, and no revision is ever rewritten.
 *
 * WHAT AN EDIT CAN AND CANNOT DO. It can point a question at a different
 * existing canonical signal, narrow the body area, or switch the mapping
 * off. It cannot invent a signal name (a slug with no row in the Signal
 * Library is refused), cannot map a question the survey does not ask, and
 * cannot touch another source's dictionary. It changes what FUTURE sittings
 * file. Rows already on a member's timeline keep the signal they were filed
 * under, because a stored signal is a record of what was true on its day.
 */

import { formatDisplayDate } from '@/lib/time/displayDate';
import type { BodySystemsQuestion, BodySystemsSection } from '@/lib/body-systems/types';
import type { SignalBodyArea, StandardizedSignalName } from './types';

/** One head row of the dictionary for a survey question. */
export type SurveyMappingHead = {
  questionRef: string;
  signalSlug: string;
  bodyAreaKey: string | null;
  isActive: boolean;
  revisionNumber: number;
  updatedAt: string | null;
};

/** One stored revision. */
export type SurveyMappingRevision = {
  questionRef: string;
  revisionNumber: number;
  signalSlug: string;
  bodyAreaKey: string | null;
  isActive: boolean;
  changeNote: string | null;
  changedBy: string | null;
  changedAt: string;
};

/** What a coach may post. Keys only: every label is resolved on the server. */
export type SurveyMappingEdit = {
  questionRef: string;
  signalSlug: string;
  bodyAreaKey: string | null;
  isActive: boolean;
  note: string | null;
};

export const MAPPING_NOTE_MAX_LENGTH = 200;

/** Where the coach reviews the mapping. */
export const SURVEY_SIGNAL_MAPPING_HREF = '/coach/signal-mappings';

/** The screen's name, where a coach reads it. */
export const SURVEY_SIGNAL_MAPPING_LABEL = 'Survey Signal Mapping';

export type ResolvedMappingEdit =
  | { ok: true; edit: SurveyMappingEdit; nextRevision: number }
  | { ok: false; error: string };

/**
 * THE SERVER DECIDES EVERYTHING THE FORM COULD HAVE LIED ABOUT. The question
 * must be one the survey asks and already maps, the signal and the area
 * must exist in the Signal Library, and the next revision number is read
 * from the stored head rather than sent by the client, so two tabs cannot
 * both write revision 4.
 */
export function resolveMappingEdit(
  raw: unknown,
  context: {
    questions: readonly BodySystemsQuestion[];
    names: ReadonlyMap<string, StandardizedSignalName>;
    bodyAreas: ReadonlyMap<string, SignalBodyArea>;
    head: SurveyMappingHead | null;
  }
): ResolvedMappingEdit {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Nothing to save.' };
  const value = raw as Record<string, unknown>;

  const questionRef = typeof value.questionRef === 'string' ? value.questionRef.trim() : '';
  if (!context.questions.some((question) => question.questionRef === questionRef)) {
    return { ok: false, error: 'That question is not one the Body Systems Survey asks.' };
  }
  if (!context.head || context.head.questionRef !== questionRef) {
    return { ok: false, error: 'That question has no mapping to revise.' };
  }

  const signalSlug = typeof value.signalSlug === 'string' ? value.signalSlug.trim() : '';
  if (!context.names.has(signalSlug)) {
    return { ok: false, error: 'Choose a signal that already exists in the Signal Library.' };
  }

  let bodyAreaKey: string | null = null;
  if (typeof value.bodyAreaKey === 'string' && value.bodyAreaKey.trim().length > 0) {
    bodyAreaKey = value.bodyAreaKey.trim();
    if (!context.bodyAreas.has(bodyAreaKey)) {
      return { ok: false, error: 'Choose a body area from the list.' };
    }
  }

  const isActive = value.isActive !== false;
  const noteRaw = typeof value.note === 'string' ? value.note.trim() : '';
  if (noteRaw.length > MAPPING_NOTE_MAX_LENGTH) {
    return { ok: false, error: `Keep the note under ${MAPPING_NOTE_MAX_LENGTH} characters.` };
  }

  const unchanged =
    context.head.signalSlug === signalSlug &&
    context.head.bodyAreaKey === bodyAreaKey &&
    context.head.isActive === isActive;
  if (unchanged) return { ok: false, error: 'Nothing has changed, so no new version was written.' };

  return {
    ok: true,
    edit: { questionRef, signalSlug, bodyAreaKey, isActive, note: noteRaw.length > 0 ? noteRaw : null },
    nextRevision: context.head.revisionNumber + 1,
  };
}

/** One revision as the history list prints it. */
export type SurveyMappingRevisionView = {
  revisionNumber: number;
  signalName: string;
  bodyAreaLabel: string | null;
  isActive: boolean;
  note: string | null;
  changedOnDisplay: string;
  /** What moved since the revision below it, computed rather than stored. */
  changes: string[];
};

export type SurveyMappingRowView = {
  questionRef: string;
  prompt: string;
  /** Which question set asks it, for the two Hormonal Health branches. */
  branchLabel: string | null;
  signalSlug: string;
  signalName: string;
  bodyAreaKey: string | null;
  bodyAreaLabel: string | null;
  isActive: boolean;
  revisionNumber: number;
  /** Newest first. */
  revisions: SurveyMappingRevisionView[];
};

export type SurveyMappingSectionView = {
  sectionKey: string;
  sectionName: string;
  rows: SurveyMappingRowView[];
  inactiveCount: number;
};

export type SurveyMappingView = {
  sections: SurveyMappingSectionView[];
  questionCount: number;
  mappedCount: number;
  inactiveCount: number;
};

const BRANCH_LABELS: Record<string, string | null> = {
  all: null,
  a: 'Question set A',
  b: 'Question set B',
};

const CHANGED_ON: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

export function buildSurveyMappingView(input: {
  sections: readonly BodySystemsSection[];
  questions: readonly BodySystemsQuestion[];
  heads: readonly SurveyMappingHead[];
  revisions: readonly SurveyMappingRevision[];
  names: ReadonlyMap<string, StandardizedSignalName>;
  bodyAreas: ReadonlyMap<string, SignalBodyArea>;
}): SurveyMappingView {
  const nameOf = (slug: string) => input.names.get(slug)?.displayName ?? slug;
  const areaOf = (key: string | null) => (key ? (input.bodyAreas.get(key)?.displayName ?? key) : null);
  const headByRef = new Map(input.heads.map((head) => [head.questionRef, head]));
  const revisionsByRef = new Map<string, SurveyMappingRevision[]>();
  for (const revision of input.revisions) {
    const held = revisionsByRef.get(revision.questionRef);
    if (held) held.push(revision);
    else revisionsByRef.set(revision.questionRef, [revision]);
  }

  const sections: SurveyMappingSectionView[] = [];
  let mappedCount = 0;
  let inactiveCount = 0;

  for (const section of [...input.sections].sort((a, b) => a.position - b.position)) {
    const rows: SurveyMappingRowView[] = [];
    const questions = input.questions
      .filter((question) => question.sectionKey === section.sectionKey)
      .sort((a, b) => a.position - b.position);
    for (const question of questions) {
      const head = headByRef.get(question.questionRef);
      if (!head) continue;
      mappedCount += 1;
      if (!head.isActive) inactiveCount += 1;

      const ordered = [...(revisionsByRef.get(question.questionRef) ?? [])].sort(
        (a, b) => a.revisionNumber - b.revisionNumber
      );
      const views: SurveyMappingRevisionView[] = ordered.map((revision, index) => {
        const previous = index > 0 ? ordered[index - 1]! : null;
        const changes: string[] = [];
        if (!previous) {
          changes.push('First version of this mapping');
        } else {
          if (previous.signalSlug !== revision.signalSlug) {
            changes.push(`Signal: ${nameOf(previous.signalSlug)} to ${nameOf(revision.signalSlug)}`);
          }
          if (previous.bodyAreaKey !== revision.bodyAreaKey) {
            changes.push(
              `Body area: ${areaOf(previous.bodyAreaKey) ?? 'the signal default'} to ${areaOf(revision.bodyAreaKey) ?? 'the signal default'}`
            );
          }
          if (previous.isActive !== revision.isActive) {
            changes.push(revision.isActive ? 'Switched on' : 'Switched off');
          }
        }
        return {
          revisionNumber: revision.revisionNumber,
          signalName: nameOf(revision.signalSlug),
          bodyAreaLabel: areaOf(revision.bodyAreaKey),
          isActive: revision.isActive,
          note: revision.changeNote,
          changedOnDisplay: formatDisplayDate(revision.changedAt, CHANGED_ON),
          changes,
        };
      });

      rows.push({
        questionRef: question.questionRef,
        prompt: question.prompt,
        branchLabel: BRANCH_LABELS[question.branch] ?? null,
        signalSlug: head.signalSlug,
        signalName: nameOf(head.signalSlug),
        bodyAreaKey: head.bodyAreaKey,
        bodyAreaLabel: areaOf(head.bodyAreaKey),
        isActive: head.isActive,
        revisionNumber: head.revisionNumber,
        revisions: views.reverse(),
      });
    }
    sections.push({
      sectionKey: section.sectionKey,
      sectionName: section.displayName,
      rows,
      inactiveCount: rows.filter((row) => !row.isActive).length,
    });
  }

  return {
    sections,
    questionCount: input.questions.length,
    mappedCount,
    inactiveCount,
  };
}
