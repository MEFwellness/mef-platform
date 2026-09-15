/**
 * What changed between one version and the one before it.
 *
 * COMPUTED, NEVER STORED. A stored change list would be a second account
 * of the same fact, and the two would drift the first time a version was
 * written by anything other than the editor. The versions themselves are
 * the record; this reads them.
 *
 * IT IS NOT A REPLACEMENT FOR HER OWN WORDS. change_summary is what the
 * coach typed about why she edited, and the history view shows both: her
 * reason, and the fields that actually moved.
 *
 * PURE. Two versions in, a list of lines out.
 */

import { ROLE_LABELS } from './constants';
import type {
  RelationshipChange,
  RelationshipComponent,
  RelationshipStrengthLevel,
  RelationshipVersion,
} from './types';

/** The one line a component reads as, used to tell two lists apart. */
export function componentLine(component: RelationshipComponent): string {
  const parts = [component.refLabel];
  if (component.side && component.side !== 'not_applicable') parts.push(component.side);
  if (component.valueLabel) parts.push(`at ${component.valueLabel}`);
  else if (component.minValueNumeric !== null) parts.push(`at ${component.minValueNumeric} or above`);
  if (component.sourceQuestionRef) parts.push(`from ${component.sourceQuestionRef}`);
  return parts.join(', ');
}

function levelLine(level: RelationshipStrengthLevel): string {
  const parts = [`${level.displayLabel} at ${level.minSupportingSignals} supporting`];
  if (level.minDistinctCategories !== null) {
    parts.push(`${level.minDistinctCategories} body systems`);
  }
  if (level.minRelatedSignals !== null) {
    parts.push(`${level.minRelatedSignals} related`);
  }
  return parts.join(', ');
}

function listChange(
  field: string,
  before: readonly string[],
  after: readonly string[]
): RelationshipChange | null {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((line) => !beforeSet.has(line));
  const removed = before.filter((line) => !afterSet.has(line));
  if (added.length === 0 && removed.length === 0) return null;
  const detail: string[] = [];
  if (added.length > 0) detail.push(`added ${added.join('; ')}`);
  if (removed.length > 0) detail.push(`removed ${removed.join('; ')}`);
  return { field, detail: detail.join(', ') };
}

function textChange(
  field: string,
  before: string | null,
  after: string | null
): RelationshipChange | null {
  if ((before ?? '') === (after ?? '')) return null;
  if (!before) return { field, detail: 'added' };
  if (!after) return { field, detail: 'cleared' };
  return { field, detail: 'rewritten' };
}

/**
 * Every difference between `previous` and `version`, as lines a coach
 * reads. An empty list means the edit moved nothing the schema holds,
 * which is worth saying out loud rather than drawing an empty box.
 */
export function describeChanges(
  version: RelationshipVersion,
  previous: RelationshipVersion | null
): RelationshipChange[] {
  if (!previous) return [{ field: 'Created', detail: 'the first version of this pattern' }];

  const changes: RelationshipChange[] = [];

  if (previous.patternName !== version.patternName) {
    changes.push({
      field: 'Pattern name',
      detail: `"${previous.patternName}" to "${version.patternName}"`,
    });
  }

  if (previous.minSupportingSignals !== version.minSupportingSignals) {
    changes.push({
      field: 'Minimum supporting signals',
      detail: `${previous.minSupportingSignals} to ${version.minSupportingSignals}`,
    });
  }

  for (const role of ['primary', 'related', 'support'] as const) {
    const change = listChange(
      `${ROLE_LABELS[role]} inputs`,
      previous.components.filter((item) => item.role === role).map(componentLine),
      version.components.filter((item) => item.role === role).map(componentLine)
    );
    if (change) changes.push(change);
  }

  const levels = listChange(
    'Strength levels',
    previous.strengthLevels.map(levelLine),
    version.strengthLevels.map(levelLine)
  );
  if (levels) changes.push(levels);

  const considerations = listChange(
    'Coaching considerations',
    previous.considerations.map((item) => item.body),
    version.considerations.map((item) => item.body)
  );
  if (considerations) changes.push(considerations);

  const association = textChange(
    'Possible Association text',
    previous.possibleAssociationText,
    version.possibleAssociationText
  );
  if (association) changes.push(association);

  const evidence = textChange(
    'Evidence and methodology notes',
    previous.evidenceNotes,
    version.evidenceNotes
  );
  if (evidence) changes.push(evidence);

  return changes;
}

/**
 * The whole trail, newest first, each version already carrying what it
 * changed against the one before it.
 *
 * `history` arrives newest first, which is the order the editor draws it
 * in and the order the read returns.
 */
export function buildVersionHistory(
  history: readonly RelationshipVersion[]
): { version: RelationshipVersion; changes: RelationshipChange[] }[] {
  const ordered = [...history].sort((a, b) => b.versionNumber - a.versionNumber);
  return ordered.map((version, index) => ({
    version,
    changes: describeChanges(version, ordered[index + 1] ?? null),
  }));
}
