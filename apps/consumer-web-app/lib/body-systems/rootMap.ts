/**
 * The Root Map feed. ELEVEN dimensions, written as eleven rows.
 *
 * WHY ELEVEN AND NOT ONE. The survey never adds sections together and
 * never gives the whole body a number, so there is nothing to publish as a
 * single finding. Each section is its own dimension and lands on its own
 * Coaching Domain card, which is the mapping the specification's build
 * notes give and lib/member-interpretation/domainMap.ts enforces.
 *
 * EVERY SECTION IS PUBLISHED EVERY TIME, including the quiet ones, and
 * that is the important half. A section that was Speaking loudly last
 * month and is Quiet today supersedes its own prior row with a milder
 * severity. Publishing only the loud ones would leave last month's alarm
 * standing on her map forever with nothing able to close it, which is
 * exactly the failure "a condition alert needs a closer" is about.
 *
 * SEVERITY COMES FROM ONE SECTION ONLY. Each row's severity is a function
 * of that section's own band and nothing else. No function here can see
 * another section's value, because none takes one as an argument.
 *
 * Quiet maps to 'mild' rather than 'none' for the reason
 * recoverySeverity() gives: 'none' becomes the verdict 'resolved', and
 * "this looks like it has settled down since we first noticed it" is not
 * what a member with a genuinely quiet system should read on her first
 * ever sitting.
 *
 * THE NAME NEVER COMES FROM THE SECTION'S OWN TITLE. A section is called
 * "Thyroid and Metabolism" on the screen a coach reads with her, which is
 * the approved survey content, but a Root Map finding is named by the
 * Naming Standard (docs/NAMING-STANDARD.md): what she experiences, never
 * an organ. So the label is looked up by domain::code in
 * lib/naming/findingNames.ts, which is the one place a finding's name is
 * decided, and no fallback to the section title is passed.
 *
 * THE WORDS A MEMBER READS ABOUT THESE ROWS ARE NOT WRITTEN HERE. The
 * Member Interpretation Layer authors the sentence and the NAME comes from
 * lib/naming/findingNames.ts. What this file supplies is severity,
 * provenance and a short coach facing note.
 */

import type { RegistryEntrySeverity, RegistryDomain } from '@mef/shared-types-contracts';
import type { RegistryEntryDraft } from '../registry/types';
import { BODY_SYSTEMS_SOURCE_FEATURE } from './constants';
import { findingDisplayName } from '../naming/findingNames';
import type { BodySystemsBand, BodySystemsResults, BodySystemsSection } from './types';

/**
 * Band to severity. Reads one section's band and nothing else.
 *
 * Keyed by the band's own stored position rather than by its key, so a
 * coach who renames a band does not silently drop every section into the
 * fallback.
 */
export function severityForBandPosition(
  position: number,
  bandCount: number
): RegistryEntrySeverity {
  if (bandCount <= 1) return 'mild';
  if (position >= bandCount) return 'significant';
  if (position === bandCount - 1) return 'moderate';
  return 'mild';
}

/** The coach facing note on one row. Names the numbers behind the band, so a coach can see how it was reached. */
export function sectionCoachContext(input: {
  sectionName: string;
  percent: number;
  bandLabel: string;
  answeredCount: number;
  dnaCount: number;
}): string {
  const questions = input.answeredCount === 1 ? 'question' : 'questions';
  const skipped =
    input.dnaCount > 0
      ? `, ${input.dnaCount} marked as not applying and left out of the total`
      : '';
  return `MEF Body Systems Survey: ${input.sectionName} at ${input.percent}% (${input.bandLabel}) across ${input.answeredCount} answered ${questions}${skipped}.`;
}

/**
 * Eleven drafts, in the sections' own fixed order rather than in loudness
 * order, so two sittings write the same rows in the same order and a diff
 * of the map is a diff of her answers.
 *
 * `recordedAt` is passed in rather than read from the clock here, so this
 * stays pure and so all eleven rows carry the identical instant, which is
 * what makes them legible as one sitting later.
 */
export function buildBodySystemsRegistryDrafts(input: {
  sections: readonly BodySystemsSection[];
  bands: readonly BodySystemsBand[];
  results: BodySystemsResults;
  sessionId: string;
  recordedAt: string;
}): RegistryEntryDraft[] {
  const { sections, bands, results, sessionId, recordedAt } = input;
  const evidence = [{ type: 'body_systems_session', id: sessionId }];
  const bandCount = bands.length;
  const resultBySection = new Map(results.sections.map((row) => [row.sectionKey, row]));

  const drafts: RegistryEntryDraft[] = [];
  for (const section of sections.slice().sort((a, b) => a.position - b.position)) {
    const result = resultBySection.get(section.sectionKey);
    if (!result) continue;
    const band = bands.find((entry) => entry.bandKey === result.bandKey);
    if (!band) continue;

    drafts.push({
      entry_kind: 'finding',
      domain: section.registryDomain as RegistryDomain,
      code: section.registryCode,
      label: findingDisplayName(section.registryDomain, section.registryCode),
      severity: severityForBandPosition(band.position, bandCount),
      numeric_value: result.percent,
      unit: 'signal_percent',
      confidence: 0.7,
      narrative: null,
      evidence_refs: evidence,
      source_feature: BODY_SYSTEMS_SOURCE_FEATURE,
      source_record_id: sessionId,
      trend_status: null,
      member_visible: true,
      coach_context: sectionCoachContext({
        sectionName: section.displayName,
        percent: result.percent,
        bandLabel: band.memberLabel,
        answeredCount: result.answeredCount,
        dnaCount: result.dnaCount,
      }),
      coach_reviewed_by: null,
      coach_reviewed_at: null,
      recorded_at: recordedAt,
    });
  }

  return drafts;
}
