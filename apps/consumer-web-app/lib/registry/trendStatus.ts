/**
 * Pattern Timeline — per-finding trend status (Prompt 6: "new / improving
 * / stable / worsening / resolved"). Pure, deterministic, no I/O: every
 * finding-writing adapter (questionnaireEngine.ts, onboarding.ts,
 * primalPattern.ts, and any future one) calls this with the entry it's
 * about to write and the active entry (if any) it will supersede, and
 * stamps the result on RegistryEntryDraft.trend_status before insert.
 *
 * Severity is treated as an ordered scale (none < mild < moderate <
 * significant) since that's the vocabulary every finding-kind adapter in
 * this codebase already uses (severity is null for entry_kind='metric'
 * rows, which never get a trend_status either — a classification isn't a
 * problem that can worsen).
 */

import type {
  RegistryEntry,
  RegistryEntrySeverity,
  FindingTrendStatus,
} from '@mef/shared-types-contracts';

const SEVERITY_RANK: Record<Exclude<RegistryEntrySeverity, 'unknown'>, number> = {
  none: 0,
  mild: 1,
  moderate: 2,
  significant: 3,
};

function rank(severity: RegistryEntrySeverity | null): number | null {
  if (severity === null || severity === 'unknown') return null;
  return SEVERITY_RANK[severity];
}

export function computeFindingTrendStatus(
  previousActive: Pick<RegistryEntry, 'severity'> | null,
  next: { severity: RegistryEntrySeverity | null; resolved?: boolean }
): FindingTrendStatus | null {
  if (next.severity === null) return null; // metrics don't get a trend status

  if (next.resolved) return 'resolved';
  if (!previousActive) return 'new';

  const previousRank = rank(previousActive.severity);
  const nextRank = rank(next.severity);
  if (previousRank === null || nextRank === null) return 'stable';

  if (nextRank > previousRank) return 'worsening';
  if (nextRank < previousRank) return 'improving';
  return 'stable';
}
