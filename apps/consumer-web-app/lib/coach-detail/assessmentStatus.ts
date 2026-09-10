/**
 * Where this client stands on every assessment, in three groups, decided
 * once.
 *
 * WHY THIS EXISTS. The Assessments and Findings section used to open on
 * every finding it had, with the actual list of assessments at the very
 * bottom, and every unassigned one drawn as a full card repeating the same
 * sentence. A coach opening the section to answer "what has she been sent"
 * had to scroll past everything that answers "what came back". This module
 * answers the first question, as data, so the screen can put it first.
 *
 * IT DECIDES NOTHING NEW. The placement of a row is `currentAssignmentFor`
 * (lib/assignments/assignableCatalog.ts), which is already the one rule for
 * "which assignment row answers where this client stands": a still open row
 * first, then a completed one, then a withdrawn one. A withdrawn row and no
 * row at all both mean nothing is offered to her, so both read as not yet
 * assigned. Nothing here formats a date, reads a clock, or issues a query:
 * every sentence a row prints is the assignment's own `statusLine`, written
 * on the server in HER timezone.
 *
 * ONE SOURCE OF TRUTH FOR THE THREE COUNTS. The folded header's digest and
 * the three group headers read the same object, so a header saying
 * "2 waiting" over three waiting rows is not a state this page can reach.
 *
 * WHAT A ROW MAY OFFER IS READ FROM THE ROW, NEVER FROM THE COPY. Two
 * kinds of assessment land in one ledger, and they accept different
 * things: the registry's questionnaires take a reason, a Required flag and
 * a due date (`assignAssessmentAction`), while the nine coach-assigned
 * deep-dives take a due date and are always required (their own
 * `assign...Action`, which has accepted a `dueDate` since 2026-09-05). The
 * inline form draws the fields this says are real, and the server refuses
 * anything else, so a form can never collect something the write throws
 * away.
 */

import {
  currentAssignmentFor,
  type AssignableTemplate,
  type AssignmentStatusSource,
} from '../assignments/assignableCatalog';
import type { AssessmentKey } from '../assessment-registry/types';

/** The three groups, in the order a coach reads them. */
export type AssessmentStatusGroupKey = 'notYetAssigned' | 'waiting' | 'completed';

/** What the inline assign form under a row is allowed to collect. */
export type AssignCapability = {
  /** This page can send it at all. */
  canAssign: boolean;
  /** `assignAssessmentAction` stores a reason. The deep-dive actions do not. */
  acceptsReason: boolean;
  /** `assignAssessmentAction` takes a Required flag. A deep-dive is always required. */
  acceptsRequired: boolean;
  /** Both paths take a bare YYYY-MM-DD. */
  acceptsDueDate: boolean;
};

const CATALOG_CAPABILITY: AssignCapability = {
  canAssign: true,
  acceptsReason: true,
  acceptsRequired: true,
  acceptsDueDate: true,
};

const OWN_ACTION_CAPABILITY: AssignCapability = {
  canAssign: true,
  acceptsReason: false,
  acceptsRequired: false,
  acceptsDueDate: true,
};

/** A row this page knows about but cannot send, which today is only an assignment no template names. */
const NOT_SENDABLE: AssignCapability = {
  canAssign: false,
  acceptsReason: false,
  acceptsRequired: false,
  acceptsDueDate: false,
};

/**
 * Where each assessment's results actually render on this page.
 *
 * Keyed by the template's own row id, which is the registry key for a
 * registry row and the experience slug for a deep-dive, so no definition
 * UUID is typed out here and nothing can drift from the registry.
 *
 * A KEY THAT IS ABSENT IS A DELIBERATE NULL. Four questionnaires
 * (Nutrition and Lifestyle, Four Doctors, Primal Pattern Diet Type, Short
 * Health Assessment) have no card of their own in this section: their
 * sittings are listed under Progress and Reassessments, which renders only
 * when a baseline exists. A completed row for one of those therefore
 * carries no tap-through rather than a link that would land on nothing on
 * some clients and say nothing about it.
 */
export const ASSESSMENT_RESULT_ANCHORS: Record<string, string> = {
  'core-values-snapshot': 'detail-card-core-values',
  'life-signal-check': 'detail-card-life-signal',
  'readiness-pulse': 'detail-card-readiness-pulse',
  'onboarding-health-history': 'detail-card-baseline',
  'body-assessment': 'detail-card-body-assessment',
  wbsa: 'detail-card-wbsa',
  'body-systems-survey': 'detail-card-body-systems',
  'stress-load-deep-dive': 'detail-card-stress-load',
  'owning-your-value': 'detail-card-owning-your-value',
  'where-your-joy-lives': 'detail-card-where-your-joy-lives',
  'the-giving-ledger': 'detail-card-the-giving-ledger',
  'the-weight-of-yes': 'detail-card-the-weight-of-yes',
  'being-seen': 'detail-card-being-seen',
  'what-you-put-down': 'detail-card-what-you-put-down',
  'your-own-company': 'detail-card-your-own-company',
  'the-life-youre-building': 'detail-card-the-life-youre-building',
};

/** The DOM id of one row, so the pinned search can scroll a coach to it. */
export function assessmentRowElementId(rowId: string): string {
  return `assessment-row-${rowId}`;
}

/** What one row carries. Everything a row prints is on it, and nothing is computed while rendering. */
export type AssessmentStatusRow = {
  /** The template's row id, or the assignment id for a row no template names. Unique across all three groups. */
  id: string;
  definitionId: string;
  displayName: string;
  areaLabel: string;
  /** What `assignAssessmentAction` is given, or null when its own action sends it. */
  assignKey: AssessmentKey | null;
  capability: AssignCapability;
  /** The assignment that placed this row in Waiting or Completed. Null in Not Yet Assigned. */
  assignment: {
    id: string;
    /** The server's own sentence: when it was sent, whether it reached her, whether it is late. */
    statusLine: string;
    isRequired: boolean;
    isOverdue: boolean;
  } | null;
  /** The card on this page that holds this assessment's results, or null when it has none. */
  resultsAnchorId: string | null;
};

export type AssessmentStatusGroups = {
  notYetAssigned: AssessmentStatusRow[];
  waiting: AssessmentStatusRow[];
  completed: AssessmentStatusRow[];
};

/** The minimum a row needs for this file to place it, plus the fields a placed row prints. */
export type AssessmentStatusAssignment = AssignmentStatusSource & {
  id: string;
  isRequired: boolean;
  progress: { due: { isOverdue: boolean } };
};

/**
 * Every assessment, filed under exactly one of the three groups.
 *
 * Template order is preserved inside each group, which is registry order
 * followed by the nine deep-dives, so a coach sees one stable list rather
 * than one that reshuffles as things are sent.
 *
 * AN ASSIGNMENT NO TEMPLATE NAMES IS STILL SHOWN. A definition that has
 * left the assignable library still has rows in the ledger, and the panel
 * this block replaces listed them. They are appended after the templates
 * in their own group, named from the shared map, and carry no Assign
 * button because nothing on this page can send them.
 */
export function groupAssessmentsByStatus(
  templates: AssignableTemplate[],
  assignments: AssessmentStatusAssignment[],
  namesByDefinitionId: Record<string, string>
): AssessmentStatusGroups {
  const groups: AssessmentStatusGroups = { notYetAssigned: [], waiting: [], completed: [] };
  const placedDefinitionIds = new Set<string>();

  for (const template of templates) {
    placedDefinitionIds.add(template.definitionId);
    const current = currentAssignmentFor(assignments, template.definitionId);
    const row: AssessmentStatusRow = {
      id: template.id,
      definitionId: template.definitionId,
      displayName: template.displayName,
      areaLabel: template.areaLabel,
      assignKey: template.assignKey,
      capability: template.assignKey === null ? OWN_ACTION_CAPABILITY : CATALOG_CAPABILITY,
      assignment:
        current && current.status !== 'cancelled'
          ? {
              id: current.id,
              statusLine: current.statusLine,
              isRequired: current.isRequired,
              isOverdue: current.progress.due.isOverdue,
            }
          : null,
      resultsAnchorId: ASSESSMENT_RESULT_ANCHORS[template.id] ?? null,
    };
    if (current?.status === 'pending') groups.waiting.push(row);
    else if (current?.status === 'completed') groups.completed.push(row);
    else groups.notYetAssigned.push(row);
  }

  for (const assignment of assignments) {
    if (placedDefinitionIds.has(assignment.assessmentDefinitionId)) continue;
    if (assignment.status === 'cancelled') continue;
    // Only the row that answers for this definition, so a definition with
    // three orphaned rows is one line rather than three.
    const current = currentAssignmentFor(assignments, assignment.assessmentDefinitionId);
    if (!current || current.id !== assignment.id) continue;
    const row: AssessmentStatusRow = {
      id: `assignment-${assignment.id}`,
      definitionId: assignment.assessmentDefinitionId,
      displayName: namesByDefinitionId[assignment.assessmentDefinitionId] ?? 'Assessment',
      areaLabel: 'No longer offered',
      assignKey: null,
      capability: NOT_SENDABLE,
      assignment: {
        id: assignment.id,
        statusLine: assignment.statusLine,
        isRequired: assignment.isRequired,
        isOverdue: assignment.progress.due.isOverdue,
      },
      resultsAnchorId: null,
    };
    if (current.status === 'pending') groups.waiting.push(row);
    else groups.completed.push(row);
  }

  return groups;
}

/** The three counts the digest and the three group headers both read. */
export type AssessmentStatusCounts = {
  notYetAssigned: number;
  waiting: number;
  completed: number;
  /** Still open, carrying a due day already behind her own today. The identical test behind the Overdue chip. */
  overdue: number;
};

export function assessmentStatusCounts(groups: AssessmentStatusGroups): AssessmentStatusCounts {
  return {
    notYetAssigned: groups.notYetAssigned.length,
    waiting: groups.waiting.length,
    completed: groups.completed.length,
    overdue: groups.waiting.filter((row) => row.assignment?.isOverdue).length,
  };
}
