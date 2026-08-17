/**
 * Member Interpretation Layer — the canonical finding set.
 *
 * This is where "one source answer produces one canonical finding" is
 * enforced, once, for the whole app.
 *
 * The rule has two halves, and the audit found the app failing both:
 *
 *   DEDUPLICATION. Two registry rows describing the same source answer
 *   collapse to one. `buildCanonicalFindings` groups by sourceKey and keeps
 *   the newest row, so no caller can receive the same answer twice however
 *   many producers wrote it.
 *
 *   ONE FINDING, MANY DOMAINS. A finding relevant to three domains is still
 *   one finding. It has one primary domain, renders in full there, and
 *   appears everywhere else as a cross reference that says so out loud.
 *   The hip discomfort slider used to read as three independent
 *   observations on the Root Map. It is one now, and it says "Also shown
 *   under Movement & Physical Capacity."
 *
 * Pure. Takes already-fetched rows and returns the canonical set.
 */

import type { RegistryEntry, RegistryEntrySeverity } from '@mef/shared-types-contracts';
import { findingDisplayName } from '../naming/findingNames';
import { assignDomains, crossReferenceNote } from './domainMap';
import { checkinEvidenceForCode, evidenceFromRegistryEntry, type InterpretationCheckin } from './evidence';
import { findingStatement } from './copy';
import { enforceTierLanguage } from './language';
import { computeEvidenceTier, tierLabel } from './tiers';
import type { CanonicalFinding, EvidenceItem, FindingVerdict } from './types';
import { coachingDomainLabel } from '../naming/domainNames';

/**
 * The dedup key: what answer produced this.
 *
 * `(domain, code)` and nothing else. Not the row id (a supersede chain has
 * many rows for one answer), not the source feature (two producers can
 * legitimately report the same finding, and when they do it is still one
 * finding), and not the narrative text (which changes wording between
 * producers while meaning the same thing).
 */
export function sourceKeyFor(entry: Pick<RegistryEntry, 'domain' | 'code'>): string {
  return `${entry.domain}::${entry.code}`;
}

/**
 * A coach confirmation timestamp, read straight off the row.
 *
 * `coach_verified_at` is added by migration 165 and does not exist before
 * it, which is why this reads defensively rather than off the typed field:
 * the column being absent must degrade to "no coach has verified anything",
 * never to an error. `coach_reviewed_at` is the pre-existing column and
 * means the same thing where it is set, so it is honoured as a fallback and
 * no coach's existing confirmation is lost.
 */
export function coachVerifiedAt(entry: RegistryEntry): string | null {
  const withNewColumn = entry as RegistryEntry & { coach_verified_at?: string | null };
  return withNewColumn.coach_verified_at ?? entry.coach_reviewed_at ?? null;
}

/**
 * The verdict for one finding.
 *
 * Severity decides weight; trend decides direction. Note what is NOT here:
 * there is no path from `severity === 'none'` to 'improving'. That exact
 * confusion is what printed "Packaged food scan has been improving" from a
 * single barcode scan with no second data point. Improving requires a real
 * computed trend and nothing else.
 */
export function verdictFor(entry: RegistryEntry): FindingVerdict {
  if (entry.trend_status === 'resolved' || entry.severity === 'none') return 'resolved';
  if (entry.trend_status === 'improving') return 'improving';
  if (entry.severity === 'significant') return 'needs_attention';
  if (entry.severity === 'moderate') return 'worth_watching';
  return 'noted';
}

function severityOf(entry: RegistryEntry): RegistryEntrySeverity {
  return entry.severity ?? 'unknown';
}

/** Newest first, by when the underlying event happened rather than when the row was written. */
function newestFirst(a: RegistryEntry, b: RegistryEntry): number {
  return b.recorded_at.localeCompare(a.recorded_at);
}

/**
 * Collapse every row that describes the same source answer down to the one
 * that describes it now.
 *
 * Returns the winners AND the rows they absorbed, because the migration
 * that retires duplicates in the database needs the second list and a
 * report that claims a merge should be able to name what was merged.
 */
export function dedupeBySourceAnswer(entries: readonly RegistryEntry[]): {
  canonical: RegistryEntry[];
  merged: Array<{ keptId: string; mergedId: string; sourceKey: string }>;
} {
  const bySourceKey = new Map<string, RegistryEntry[]>();
  for (const entry of entries) {
    const key = sourceKeyFor(entry);
    const bucket = bySourceKey.get(key);
    if (bucket) bucket.push(entry);
    else bySourceKey.set(key, [entry]);
  }

  const canonical: RegistryEntry[] = [];
  const merged: Array<{ keptId: string; mergedId: string; sourceKey: string }> = [];

  for (const [sourceKey, bucket] of bySourceKey) {
    const sorted = [...bucket].sort(newestFirst);
    const keeper = sorted[0]!;
    canonical.push(keeper);
    for (const loser of sorted.slice(1)) {
      merged.push({ keptId: keeper.id, mergedId: loser.id, sourceKey });
    }
  }

  return { canonical, merged };
}

/**
 * The canonical finding set for one member.
 *
 * `entries` should be the member's ACTIVE registry rows. Everything else
 * about which of them a given screen may show (member_visible, safety
 * gating) is decided by the caller reading this, not here, so one member
 * and one coach looking at the same person are looking at the same
 * findings with different visibility rather than at two different sets.
 */
export function buildCanonicalFindings(input: {
  entries: readonly RegistryEntry[];
  checkins: readonly InterpretationCheckin[];
}): CanonicalFinding[] {
  const { canonical } = dedupeBySourceAnswer(
    input.entries.filter((e) => e.entry_kind === 'finding' && e.status === 'active')
  );

  return canonical
    .map((entry) => toCanonicalFinding(entry, input.checkins))
    .sort(byWeightThenLabel);
}

function toCanonicalFinding(
  entry: RegistryEntry,
  checkins: readonly InterpretationCheckin[]
): CanonicalFinding {
  const evidence: EvidenceItem[] = [
    ...evidenceFromRegistryEntry(entry),
    ...checkinEvidenceForCode(entry.code, checkins),
  ];

  const tier = computeEvidenceTier(evidence, coachVerifiedAt(entry));
  const verdict = verdictFor(entry);
  const { primary, alsoRelevant } = assignDomains(entry.domain, entry.code);

  // The NAME is looked up by the finding's stable identity rather than read
  // off the row. `entry.label` is the wording the adapter used on the day the
  // row was written, and rows in production go back months: some carry
  // retired clinical names ("Gut Fungal & Parasite Concerns"), one carries a
  // raw enum with its underscores swapped for spaces ("thoracic kyphosis").
  // Renaming a finding is one edit in lib/naming/findingNames.ts and it lands
  // on every screen at once, because every screen renders findings through
  // this layer. See docs/NAMING-STANDARD.md.
  const label = findingDisplayName(entry.domain, entry.code, entry.label);

  // The statement is AUTHORED here rather than passed through from the
  // producer. The stored narratives were written per-adapter years apart:
  // one of them interpolated a raw enum into member copy ("reported as
  // 'poor' on the latest onboarding submission"), and none of them knew
  // anything about tiers. Authoring one sentence per finding, in one place,
  // from the tier and the verdict, is what makes "language matches tier" a
  // property rather than an aspiration.
  const statement = enforceTierLanguage(
    findingStatement({ label, tier, verdict, evidence }),
    tier,
    label
  );

  return {
    id: sourceKeyFor(entry),
    sourceKey: sourceKeyFor(entry),
    label,
    statement,
    tier,
    tierLabel: tierLabel(tier),
    evidence,
    verdict,
    severity: severityOf(entry),
    primaryDomain: primary,
    primaryDomainLabel: primary ? coachingDomainLabel(primary) : null,
    alsoRelevantDomains: alsoRelevant,
    crossReferenceNote: crossReferenceNote(alsoRelevant),
    memberVisible: entry.member_visible,
    registryEntryId: entry.id,
  };
}

const VERDICT_WEIGHT: Record<FindingVerdict, number> = {
  needs_attention: 4,
  worth_watching: 3,
  noted: 2,
  improving: 1,
  resolved: 0,
};

function byWeightThenLabel(a: CanonicalFinding, b: CanonicalFinding): number {
  const weight = VERDICT_WEIGHT[b.verdict] - VERDICT_WEIGHT[a.verdict];
  if (weight !== 0) return weight;
  return a.label.localeCompare(b.label);
}

/** The findings a member may see. Coach surfaces skip this and read the full set. */
export function memberVisibleFindings(findings: readonly CanonicalFinding[]): CanonicalFinding[] {
  return findings.filter((f) => f.memberVisible);
}

/** Findings that are still live concerns, i.e. not resolved. */
export function activeFindings(findings: readonly CanonicalFinding[]): CanonicalFinding[] {
  return findings.filter((f) => f.verdict !== 'resolved');
}
