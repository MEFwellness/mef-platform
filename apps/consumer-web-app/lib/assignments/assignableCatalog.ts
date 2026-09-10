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
import {
  BODY_SYSTEMS_AREA,
  BODY_SYSTEMS_DEFINITION_ID,
  BODY_SYSTEMS_KEY,
  BODY_SYSTEMS_LABEL,
} from '../body-systems/constants';
import { STRESS_LOAD_AREA, STRESS_LOAD_LABEL } from '../stress-load/copy';
import { OYV_DEFINITION_ID } from '../owning-your-value/constants';
import { OYV_AREA, OYV_LABEL } from '../owning-your-value/copy';
import { WYJL_DEFINITION_ID } from '../where-your-joy-lives/constants';
import { WYJL_AREA, WYJL_LABEL } from '../where-your-joy-lives/copy';
import { TGL_DEFINITION_ID } from '../the-giving-ledger/constants';
import { TGL_AREA, TGL_LABEL } from '../the-giving-ledger/copy';
import { TWOY_DEFINITION_ID } from '../the-weight-of-yes/constants';
import { TWOY_AREA, TWOY_LABEL } from '../the-weight-of-yes/copy';
import { BSN_DEFINITION_ID } from '../being-seen/constants';
import { BSN_AREA, BSN_LABEL } from '../being-seen/copy';
import { WYPD_DEFINITION_ID } from '../what-you-put-down/constants';
import { WYPD_AREA, WYPD_LABEL } from '../what-you-put-down/copy';
import { YOC_DEFINITION_ID } from '../your-own-company/constants';
import { YOC_AREA, YOC_LABEL } from '../your-own-company/copy';
import { TLYB_DEFINITION_ID } from '../the-life-youre-building/constants';
import { TLYB_AREA, TLYB_LABEL } from '../the-life-youre-building/copy';
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
   * WHICH WRITE PATH SENDS THIS ROW, and nothing more.
   *
   * A key means `assignAssessmentAction` takes it. Null means the row has
   * its own dedicated action with its own default due date, which is
   * dispatched by app/actions/coachAssessmentRowAssign.ts. Both are
   * assignable from the coach's status block; they simply accept different
   * things, and lib/coach-detail/assessmentStatus.ts turns this into the
   * fields the inline form is allowed to draw.
   */
  assignKey: AssessmentKey | null;
};

/**
 * The ten coach-assigned experiences the registry deliberately does not
 * carry.
 *
 * WHY THEY APPEAR HERE. They land in the same assessment_assignments
 * ledger as everything above them, the coach's assessment list has always
 * printed them, and a coach typing "joy" is looking for Where Your Joy
 * Lives whether or not the registry happens to know the name. Leaving them
 * out of the one list of what can be sent would make it lie by omission.
 *
 * THEY CARRY NO assignKey, AND THAT IS NOT "NOT SENDABLE". Each one has
 * its own Assign action holding its own default due date and its own
 * idempotent duplicate-click behaviour, and the partial unique index
 * behind these rows means a second INSERT path could only ever race the
 * first. So there is still exactly one write per deep-dive: a null key
 * routes the coach's button to that same action
 * (app/actions/coachAssessmentRowAssign.ts) rather than to a second
 * insert of its own.
 */
const COACH_ASSIGNED_EXPERIENCES: {
  id: string;
  definitionId: string;
  displayName: string;
  areaLabel: string;
}[] = [
  {
    id: BODY_SYSTEMS_KEY,
    definitionId: BODY_SYSTEMS_DEFINITION_ID,
    displayName: BODY_SYSTEMS_LABEL,
    areaLabel: BODY_SYSTEMS_AREA,
  },
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
  {
    id: 'the-weight-of-yes',
    definitionId: TWOY_DEFINITION_ID,
    displayName: TWOY_LABEL,
    areaLabel: TWOY_AREA,
  },
  {
    id: 'being-seen',
    definitionId: BSN_DEFINITION_ID,
    displayName: BSN_LABEL,
    areaLabel: BSN_AREA,
  },
  {
    id: 'what-you-put-down',
    definitionId: WYPD_DEFINITION_ID,
    displayName: WYPD_LABEL,
    areaLabel: WYPD_AREA,
  },
  {
    id: 'your-own-company',
    definitionId: YOC_DEFINITION_ID,
    displayName: YOC_LABEL,
    areaLabel: YOC_AREA,
  },
  {
    id: 'the-life-youre-building',
    definitionId: TLYB_DEFINITION_ID,
    displayName: TLYB_LABEL,
    areaLabel: TLYB_AREA,
  },
];

/**
 * Every questionnaire this client can be searched for, named and filed.
 *
 * WHICH REGISTRY QUESTIONNAIRES A COACH MAY SEND IS UNCHANGED.
 * listAssignableAssessments() still decides it, and those rows are the
 * ones carrying an assignKey. The nine below them carry none and are sent
 * by their own actions.
 *
 * Registry order first, then the deep-dives, which is one stable order the
 * coach's status block files into groups without resorting.
 */
export function listAssignableTemplates(): AssignableTemplate[] {
  const names = assignmentNamesByDefinitionId();
  const registryRows: AssignableTemplate[] = listAssignableAssessments().map((entry) => ({
    id: entry.key,
    definitionId: entry.databaseId,
    displayName: names.get(entry.databaseId) ?? entry.displayName,
    areaLabel: assessmentAreaLabel(entry.category),
    assignKey: entry.key,
  }));
  const experienceRows: AssignableTemplate[] = COACH_ASSIGNED_EXPERIENCES.map((experience) => ({
    id: experience.id,
    definitionId: experience.definitionId,
    displayName: names.get(experience.definitionId) ?? experience.displayName,
    areaLabel: experience.areaLabel,
    assignKey: null,
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
