/**
 * Version locking (section 6). A Reset client's baseline stores its exact
 * content/scoring version (assessment_attempts.assessment_version); every
 * later reassessment is compared only against versions explicitly listed
 * as compatible (assessment_definition_versions.comparison_compatible_
 * versions, migration 76 — self-compatible by default, since every
 * existing assessment has only ever had version 1). Nothing recalculates
 * an old result with new scoring, and nothing compares across versions
 * that were never declared compatible.
 */

export function isAttemptVersionCurrent(attemptVersion: number, currentVersion: number): boolean {
  return attemptVersion === currentVersion;
}

export function areVersionsComparisonCompatible(
  versionA: number,
  versionB: number,
  compatibleVersions: readonly number[]
): boolean {
  if (versionA === versionB) return true;
  return compatibleVersions.includes(versionA) && compatibleVersions.includes(versionB);
}
