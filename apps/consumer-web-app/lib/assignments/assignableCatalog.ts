/**
 * The list of questionnaires a coach can assign, named once, filed under
 * an area, and matched against what a coach types.
 *
 * WHY THIS IS ONE MODULE AND NOT THREE LINES IN A PANEL. The template
 * library is growing, and a coach on a phone cannot scroll it. Three
 * separate facts decide what one row of that list says, and every one of
 * them already had a home before this file existed:
 *
 *   the NAME comes from lib/assignments/experienceNames.ts, the shared map
 *     that exists precisely so the This Week band and the client detail
 *     panel cannot name one row two ways. Nothing here invents a name and
 *     nothing here falls back to the generic word.
 *   the AREA comes from lib/assessment-registry/areas.ts, which turns the
 *     registry's own internal category key into words.
 *   the STATUS comes from the assignment rows the client detail page has
 *     ALREADY fetched (getClientAssessmentAssignments), carrying the
 *     sentence the server already wrote for it. This file picks which row
 *     answers "where does this client stand on this questionnaire" and
 *     reads that row's sentence back. It formats nothing, it resolves no
 *     dates, and it issues no query.
 *
 * The filter itself is a pure string match so it can be tested without a
 * browser and reused by any other surface that grows the same problem.
 */

import { listAssignableAssessments } from '../assessment-registry/registry';
import { assessmentAreaLabel } from '../assessment-registry/areas';
import { assignmentNamesByDefinitionId, UNNAMED_ASSIGNMENT_LABEL } from './experienceNames';
import { STRESS_LOAD_DEFINITION_ID } from '../stress-load/constants';
import { STRESS_LOAD_AREA, STRESS_LOAD_LABEL } from '../stress-load/copy';
import { OYV_DEFINITION_ID } from '../owning-your-value/constants';
import { OYV_AREA, OYV_LABEL } from '../owning-your-value/copy';
import { WYJL_DEFINITION_ID } from '../where-your-joy-lives/constants';
import { WYJL_AREA, WYJL_LABEL } from '../where-your-joy-lives/copy';
import { TGL_DEFINITION_ID } from '../the-giving-ledger/constants';
import { TGL_AREA, TGL_LABEL } from '../the-giving-ledger/copy';
import type { AssessmentKey } from '../assessment-registry/types';
import type { AssignmentRowStatus } from './status';

/** One row of the coach's searchable list, with everything a row prints. */
export type AssignableTemplate = {
  /** Stable row id. Unique across the whole list, used as a React key and as the selection. */
  id: string;
  /** assessment_definition_id, which is how an assignment row points back here. */
  definitionId: string;
  /** From the shared name map. Never the generic word, never a registry key. */
  displayName: string;
  /** The area a coach can type instead of a name. */
  areaLabel: string;
  /**
   * What assignAssessmentAction is given when this panel's Assign button
   * sends it, or null when its Assign button lives on its own card.
   * Unchanged by this build for every row that has one.
   */
  assignKey: AssessmentKey | null;
  /** Where its own Assign button is, for a row this panel cannot send. Null when assignKey is set. */
  assignedFromLabel: string | null;
};

/** The line a findable but not sendable row carries. True today, and it names no date. */
export const ASSIGNED_FROM_OWN_CARD = 'Assigned from its own card on this page.';

/**
 * The three coach-assigned deep-dives, which are FINDABLE here and are
 * deliberately NOT sendable here.
 *
 * WHY THEY APPEAR AT ALL. They land in the same assessment_assignments
 * ledger as everything above them, the list further down this panel has
 * always printed them, and a coach typing "joy" is looking for Where Your
 * Joy Lives whether or not the registry happens to carry it. Leaving them
 * out of a search field on the page that already lists them would make the
 * field lie by omission.
 *
 * WHY THEY ARE NOT SENDABLE HERE. Each one has its own Assign action with
 * its own default due date and its own duplicate-click behaviour, and its
 * own card on this page shows what came back. A second Assign path would
 * be a second way to send one thing, which is the shape that drifts, and
 * the partial unique index behind these rows means a second path could
 * only ever race the first. So the row says where its button is and
 * nothing more, which is the honest thing a row can say.
 */
const COACH_ASSIGNED_EXPERIENCES: {
  id: string;
  definitionId: string;
  displayName: string;
  areaLabel: string;
}[] = [
  {
    id: 'stress-load-deep-dive',
    definitionId: STRESS_LOAD_DEFINITION_ID,
    displayName: STRESS_LOAD_LABEL,
    areaLabel: STRESS_LOAD_AREA,
  },
  {
    id: 'owning-your-value',
    definitionId: OYV_DEFINITION_ID,
    displayName: OYV_LABEL,
    areaLabel: OYV_AREA,
  },
  {
    id: 'where-your-joy-lives',
    definitionId: WYJL_DEFINITION_ID,
    displayName: WYJL_LABEL,
    areaLabel: WYJL_AREA,
  },
  {
    id: 'the-giving-ledger',
    definitionId: TGL_DEFINITION_ID,
    displayName: TGL_LABEL,
    areaLabel: TGL_AREA,
  },
];

/**
 * Every questionnaire this client can be searched for, named and filed.
 *
 * WHAT A COACH MAY SEND FROM THIS PANEL IS UNCHANGED.
 * listAssignableAssessments() still decides it, exactly as it did before
 * this build, and those rows are the ones carrying an assignKey. The three
 * below them are findable and carry none.
 *
 * Registry order first, then the deep-dives, so a coach who never types
 * anything sees the same list in the same order she saw before, with three
 * rows added at the end.
 */
export function listAssignableTemplates(): AssignableTemplate[] {
  const names = assignmentNamesByDefinitionId();
  const registryRows: AssignableTemplate[] = listAssignableAssessments().map((entry) => ({
    id: entry.key,
    definitionId: entry.databaseId,
    displayName: names.get(entry.databaseId) ?? entry.displayName,
    areaLabel: assessmentAreaLabel(entry.category),
    assignKey: entry.key,
    assignedFromLabel: null,
  }));
  const experienceRows: AssignableTemplate[] = COACH_ASSIGNED_EXPERIENCES.map((experience) => ({
    id: experience.id,
    definitionId: experience.definitionId,
    displayName: names.get(experience.definitionId) ?? experience.displayName,
    areaLabel: experience.areaLabel,
    assignKey: null,
    assignedFromLabel: ASSIGNED_FROM_OWN_CARD,
  }));
  return [...registryRows, ...experienceRows];
}

/** Trimmed and lowercased, so a match never depends on capitals or stray spaces. */
export function normalizeSearchText(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Does one piece of text answer what was typed. Partial, case insensitive,
 * and an empty query matches everything.
 *
 * EXPORTED because the client detail page's own pinned search (2026-09-06)
 * matches section and card titles, and the brief promised it would behave
 * the same way this list already behaves. Sharing the function is the only
 * way two fields can be guaranteed to agree, so lib/coach-detail/sections.ts
 * calls this rather than writing a second `includes` of its own.
 */
export function textMatchesSearch(text: string, query: string): boolean {
  const needle = normalizeSearchText(query);
  if (needle.length === 0) return true;
  return normalizeSearchText(text).includes(needle);
}

/**
 * Does one template answer what the coach typed.
 *
 * Two fields, partial, case insensitive. "joy" finds a template by name,
 * an area name finds every template filed under it. An empty query matches
 * everything, which is what makes clearing the field restore the list
 * without any separate reset path.
 */
export function templateMatchesSearch(template: AssignableTemplate, query: string): boolean {
  return (
    textMatchesSearch(template.displayName, query) || textMatchesSearch(template.areaLabel, query)
  );
}

/** The filtered list, in the order the registry gave it. */
export function filterAssignableTemplates(
  templates: AssignableTemplate[],
  query: string
): AssignableTemplate[] {
  return templates.filter((template) => templateMatchesSearch(template, query));
}

/** What a row says when this client has never been sent this questionnaire. */
export const NOT_SENT_STATUS_LINE = 'Not sent.';

/**
 * The minimum an assignment row has to carry for this file to place it.
 * Structural on purpose, so lib does not import a 'use server' module.
 */
export type AssignmentStatusSource = {
  assessmentDefinitionId: string;
  status: AssignmentRowStatus;
  createdAt: string;
  /** Written on the server, in the member's own timezone. Read back verbatim. */
  statusLine: string;
};

/**
 * Which assignment row answers "where does this client stand on this
 * questionnaire right now".
 *
 * PRECEDENCE, and why it is this order.
 *   a still open row first, because that is the thing a coach would be
 *     about to send again, and sending a second copy of something already
 *     open is the mistake this list exists to prevent.
 *   a completed row next, because finishing is a stronger fact about a
 *     client than a coach having withdrawn an older copy.
 *   a cancelled row last, so a withdrawn assignment still reports honestly
 *     rather than reading as though nothing was ever sent.
 *
 * Newest first within each of those, which is the order
 * getClientAssessmentAssignments already returns. Nothing is sorted here,
 * so the row picked is the same row the list lower down the page prints.
 */
export function currentAssignmentFor<T extends AssignmentStatusSource>(
  assignments: T[],
  definitionId: string
): T | null {
  const mine = assignments.filter((a) => a.assessmentDefinitionId === definitionId);
  return (
    mine.find((a) => a.status === 'pending') ??
    mine.find((a) => a.status === 'completed') ??
    mine.find((a) => a.status === 'cancelled') ??
    null
  );
}

/**
 * The sentence one row of the assignable list prints for this client.
 *
 * It is the SAME string the assignment list further down the page shows
 * for that same assignment, because it is that assignment's own
 * statusLine, read back rather than rebuilt. No date is formatted here and
 * no state is re-derived, so the two places on one screen cannot disagree.
 */
export function templateStatusLine(
  assignments: AssignmentStatusSource[],
  definitionId: string
): string {
  return currentAssignmentFor(assignments, definitionId)?.statusLine ?? NOT_SENT_STATUS_LINE;
}

/** For the guard test: a template that resolved to the generic word is a bug. */
export function templatesMissingAName(templates: AssignableTemplate[]): AssignableTemplate[] {
  return templates.filter(
    (t) => t.displayName.length === 0 || t.displayName === UNNAMED_ASSIGNMENT_LABEL
  );
}
