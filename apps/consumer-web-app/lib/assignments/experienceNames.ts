/**
 * What to CALL one row in the assignment ledger, in one place.
 *
 * THE PROBLEM THIS SOLVES. assessment_assignments (migration 77) carries
 * every coach assignment, and lib/assessment-registry/registry.ts names
 * most of them. It deliberately does not name the coach-assigned-only
 * experiences (the Stress & Load Deep-Dive, Owning Your Value), because a
 * registry entry is what builds the Questionnaires catalog and the plan
 * map, and those experiences belong to neither. The consequence was that
 * any screen listing assignments printed "Assessment" beside them, so a
 * coach with two open rows could not tell which one was late.
 *
 * app/actions/coachWeek.ts already fixed that for the This Week band with a
 * map built inline. This is that map, lifted out, so the band and the
 * client detail panel cannot drift into naming the same row two different
 * things.
 *
 * ADDING AN EXPERIENCE. One entry here, and every surface that lists
 * assignments picks the name up. Nothing else needs to change.
 */

import { listAssessmentRegistryEntries } from '../assessment-registry/registry';
import { STRESS_LOAD_DEFINITION_ID } from '../stress-load/constants';
import { STRESS_LOAD_LABEL } from '../stress-load/copy';
import { OYV_DEFINITION_ID } from '../owning-your-value/constants';
import { OYV_LABEL } from '../owning-your-value/copy';

/** What a row is called when nothing above names it. Kept as one constant so the two callers print the same word. */
export const UNNAMED_ASSIGNMENT_LABEL = 'Assessment';

/** Every assessment_definition_id a coach can assign, mapped to the name a coach reads. */
export function assignmentNamesByDefinitionId(): Map<string, string> {
  return new Map<string, string>([
    ...listAssessmentRegistryEntries().map(
      (entry) => [entry.databaseId, entry.displayName] as const
    ),
    [STRESS_LOAD_DEFINITION_ID, STRESS_LOAD_LABEL],
    [OYV_DEFINITION_ID, OYV_LABEL],
  ]);
}

/** The same map as a plain object, for the client components that receive it as a prop. */
export function assignmentNameRecord(): Record<string, string> {
  return Object.fromEntries(assignmentNamesByDefinitionId());
}

export function assignmentNameFor(definitionId: string): string {
  return assignmentNamesByDefinitionId().get(definitionId) ?? UNNAMED_ASSIGNMENT_LABEL;
}
