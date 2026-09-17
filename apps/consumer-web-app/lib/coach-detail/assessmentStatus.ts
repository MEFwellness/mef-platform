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
 * ONE EXCEPTION, AND IT IS WHY A SECOND SITTING IS VISIBLE AT ALL. A
 * client who has FINISHED an assessment and been sent it AGAIN is two true
 * facts at once: something has come back, and something is out. Until
 * 2026-09-12 the open row simply won and the finished one vanished from
 * Completed, so sending a second sitting looked like losing the first, and
 * the results a coach had just been reading were suddenly filed under
 * nothing. Such an assessment now appears in BOTH groups: the open sitting
 * in Assigned, Waiting, and the most recent finished one still in
 * Completed with its View results link intact.
 *
 * THE EXTRA ROW IS THE COMPLETED ONE, AND IT OFFERS NO SEND. One open
 * sitting at a time is the ledger's own rule (migration 144's partial
 * unique index), so a second Assign control on the same assessment could
 * only ever write nothing. It carries a quiet line saying one is already
 * out instead, and the Resend control stays where the open sitting is.
 *
 * A ROW THEREFORE HAS TWO IDS. `id` is the template's, which is what every
 * write path, every data hook and the pinned search address it by, and is
 * deliberately the SAME on both halves of a split. `instanceId` is unique
 * across all three groups, and is what React keys, DOM ids and the
 * "which form is open" state use, because two elements carrying one DOM id
 * is a real defect and not a style question.
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
import type { AssignmentHistoryView } from '../coach-assign/history';
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
 * A KEY THAT IS ABSENT IS A DELIBERATE NULL. Three questionnaires
 * (Nutrition and Lifestyle, Four Doctors, Short Health Assessment) have no
 * card of their own in this section: their sittings are listed under
 * Progress and Reassessments, which renders only when a baseline exists. A
 * completed row for one of those therefore carries no tap-through rather
 * than a link that would land on nothing on some clients and say nothing
 * about it.
 *
 * THREE OF THEM WERE ABSENT BY OVERSIGHT RATHER THAN BY DECISION, and
 * 2026-09-17 added them. The Health Appraisal, the Fuel Pattern Assessment
 * and the Health and Lifestyle Intake each already had a card on this page
 * and a completed row in this block, and the two were simply never joined:
 * a coach reading "Completed" was offered Assign Again and no way to read
 * what had come back, on a page that was already drawing it further down.
 * Nothing new renders because of this; the rows now point at what was
 * always there.
 */
export const ASSESSMENT_RESULT_ANCHORS: Record<string, string> = {
  'core-values-snapshot': 'detail-card-core-values',
  'life-signal-check': 'detail-card-life-signal',
  'readiness-pulse': 'detail-card-readiness-pulse',
  'onboarding-health-history': 'detail-card-baseline',
  'fuel-pattern': 'detail-card-fuel-pattern',
  'body-assessment': 'detail-card-body-assessment',
  wbsa: 'detail-card-wbsa',
  'body-systems-survey': 'detail-card-body-systems',
  'whole-body-signal': 'detail-card-whole-body-signal',
  'health-lifestyle-intake': 'detail-card-health-intake',
  'breathing-pattern-check-in': 'detail-card-breathing-check-in',
  haq: 'detail-card-health-appraisal',
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
  /**
   * The template's row id, or the assignment id for a row no template
   * names. It is what every write path and the pinned search address, and
   * it is deliberately the SAME on both halves of a split assessment.
   */
  id: string;
  /**
   * Unique across all three groups, always. React keys, DOM ids and the
   * "which inline form is open" state read this one, never `id`, because a
   * split assessment puts two rows on the screen for one template.
   *
   * It EQUALS `id` for every row that is not the extra completed half, so
   * the pinned search's scroll target is unchanged.
   */
  instanceId: string;
  definitionId: string;
  displayName: string;
  areaLabel: string;
  /** What `assignAssessmentAction` is given, or null when its own action sends it. */
  assignKey: AssessmentKey | null;
  capability: AssignCapability;
  /**
   * WHETHER THE ROW OFFERS A CONTROL ONCE IT HAS BEEN SENT. Read off the
   * template (lib/assignments/assignableCatalog.ts), never off the group:
   * a completed row is finished whatever it is, and only the instruments
   * that draw a real reassessment comparison offer to be sent again.
   */
  allowsReassign: boolean;
  /**
   * What has already happened between this client and this instrument, as
   * sentences the server has already written in HER timezone.
   *
   * NULL MEANS NEVER SENT, and the form then draws nothing extra and
   * behaves exactly as it did before this existed. It is also null on
   * every row that cannot be sent again, because the form under those is
   * unchanged.
   */
  history: AssignmentHistoryView | null;
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
  /**
   * TRUE ONLY ON THE COMPLETED HALF OF A SPLIT: she has finished this one,
   * and a newer sitting is open right now.
   *
   * The row draws a quiet line instead of a send control, because the
   * ledger allows exactly one open sitting per assessment and a second
   * Assign here could only ever write nothing.
   */
  openElsewhere: boolean;
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
 * The instance id of the COMPLETED half of a split assessment.
 *
 * A suffix on the template's own id rather than a second scheme, so a
 * reader who sees it on the page knows immediately which assessment it
 * belongs to. The template id itself stays on the open half, which is what
 * keeps the pinned search's scroll target unchanged.
 *
 * TWO UNDERSCORES AND NOT A COLON, because this becomes a DOM id and
 * several verification scripts address these rows as `#assessment-row-…`.
 * A colon in an id is legal HTML and a PSEUDO-CLASS in a CSS selector, so
 * `querySelector('#assessment-row-x:completed')` throws rather than
 * returning nothing, which is a failure in the reader rather than in the
 * thing being read.
 */
export function completedInstanceId(rowId: string): string {
  return `${rowId}__completed`;
}

/**
 * The most recent FINISHED assignment for one definition, or null.
 *
 * Separate from `currentAssignmentFor`, which answers a different question
 * ("where does this client stand"): an open row wins there, which is
 * exactly why a finished one needs its own lookup to stay visible.
 *
 * It trusts the caller's order no more than `currentAssignmentFor` does:
 * getClientAssessmentAssignments returns newest first, and the first
 * completed row in that order is the most recent completion.
 */
function latestCompletedAssignmentFor<T extends AssessmentStatusAssignment>(
  assignments: T[],
  definitionId: string
): T | null {
  return (
    assignments.find(
      (row) => row.assessmentDefinitionId === definitionId && row.status === 'completed'
    ) ?? null
  );
}

/**
 * Every assessment, filed under one of the three groups, and a finished
 * one under an open one filed under two.
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
  namesByDefinitionId: Record<string, string>,
  /**
   * The finished history sentences, by definition id, for the instruments
   * that offer to be sent again. Absent for everything else, and for a
   * client this has never been sent to, which is the same thing to the
   * form: draw nothing extra.
   */
  historiesByDefinitionId: Record<string, AssignmentHistoryView> = {}
): AssessmentStatusGroups {
  const groups: AssessmentStatusGroups = { notYetAssigned: [], waiting: [], completed: [] };
  const placedDefinitionIds = new Set<string>();

  for (const template of templates) {
    placedDefinitionIds.add(template.definitionId);
    const current = currentAssignmentFor(assignments, template.definitionId);

    const base = {
      id: template.id,
      definitionId: template.definitionId,
      displayName: template.displayName,
      areaLabel: template.areaLabel,
      assignKey: template.assignKey,
      capability: template.assignKey === null ? OWN_ACTION_CAPABILITY : CATALOG_CAPABILITY,
      allowsReassign: template.allowsReassign,
      history: template.allowsReassign
        ? (historiesByDefinitionId[template.definitionId] ?? null)
        : null,
      resultsAnchorId: ASSESSMENT_RESULT_ANCHORS[template.id] ?? null,
    };

    const row: AssessmentStatusRow = {
      ...base,
      instanceId: template.id,
      assignment:
        current && current.status !== 'cancelled'
          ? {
              id: current.id,
              statusLine: current.statusLine,
              isRequired: current.isRequired,
              isOverdue: current.progress.due.isOverdue,
            }
          : null,
      openElsewhere: false,
    };

    if (current?.status === 'pending') {
      groups.waiting.push(row);

      /*
        AND THE SITTING SHE ALREADY FINISHED KEEPS ITS PLACE.

        Sending a second sitting is not the same fact as losing the first,
        and before this the open row simply won: the finished one left
        Completed, taking its View results link with it, on the very screen
        a coach opens to compare the two. So a finished sitting under an
        open one gets its own row in Completed, carrying the FINISHED
        assignment's own sentence rather than the open one's.

        It offers no send. One open sitting at a time is the ledger's rule
        (migration 144), so a second Assign control on one assessment could
        only ever write nothing, and `openElsewhere` is what the screen
        draws a quiet line from instead.
      */
      const finished = latestCompletedAssignmentFor(assignments, template.definitionId);
      if (finished) {
        groups.completed.push({
          ...base,
          instanceId: completedInstanceId(template.id),
          assignment: {
            id: finished.id,
            statusLine: finished.statusLine,
            isRequired: finished.isRequired,
            isOverdue: finished.progress.due.isOverdue,
          },
          openElsewhere: true,
        });
      }
    } else if (current?.status === 'completed') groups.completed.push(row);
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
      instanceId: `assignment-${assignment.id}`,
      definitionId: assignment.assessmentDefinitionId,
      displayName: namesByDefinitionId[assignment.assessmentDefinitionId] ?? 'Assessment',
      areaLabel: 'No longer offered',
      assignKey: null,
      capability: NOT_SENDABLE,
      // A definition no template names cannot be sent from here at all, so
      // it can certainly not be sent again.
      allowsReassign: false,
      history: null,
      assignment: {
        id: assignment.id,
        statusLine: assignment.statusLine,
        isRequired: assignment.isRequired,
        isOverdue: assignment.progress.due.isOverdue,
      },
      resultsAnchorId: null,
      openElsewhere: false,
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
