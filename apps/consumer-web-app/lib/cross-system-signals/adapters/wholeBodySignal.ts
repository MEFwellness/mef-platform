/**
 * The Rooted Reset Whole-Body Signal Assessment, as signals.
 *
 * ITS NINE SECTION SIGNAL PERCENTAGES, AS SYSTEM LEVEL SIGNALS, AND
 * NOTHING ELSE.
 *
 * NO ZONE LOGIC CROSSES THIS LINE, and the fence is structural rather than
 * a promise. This file imports `loadReadingContent`, which asks the
 * database for no Zone name, no chakra lens, no organ or gland list and no
 * coach topic, and it never touches `loadCoachContent`. The stored results
 * do carry a Zone rollup, and the loop below reads `results.sections` and
 * has no branch that could reach `results.zones`. No individual answer is
 * mapped either: the dictionary holds section keys for this source and
 * nothing else (migration 241), so there is no question ref an adapter
 * could resolve even if one were passed.
 *
 * IT CHANGES NOTHING ABOUT THE ASSESSMENT. Stored rows in, drafts out. No
 * score, no band, no Signal Load, no pattern, no coaching question and no
 * member screen is touched.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadReadingContent } from '@/lib/whole-body-signal/contentData';
import { listWbsSessions } from '@/lib/whole-body-signal/data';
import type { MemberSection, SignalBand, WbsResults } from '@/lib/whole-body-signal/types';
import { SOURCE_WHOLE_BODY_SIGNAL } from '../constants';
import { resolveMapped, sourceLabel } from '../library';
import { fingerprint, type BuildContext, type IngestibleSitting, type SignalAdapter } from '../registry';
import type { SignalDraft } from '../types';

export type WholeBodySignalAdapterInput = {
  sittingId: string;
  completedAt: string;
  /** Sections only. This shape has no field a Zone rollup could arrive in. */
  sections: WbsResults['sections'];
  sectionContent: readonly MemberSection[];
  bands: readonly SignalBand[];
};

export function buildWholeBodySignalSignals(
  input: WholeBodySignalAdapterInput,
  context: BuildContext
): SignalDraft[] {
  const { library, capturedOn } = context;
  const label = sourceLabel(library, SOURCE_WHOLE_BODY_SIGNAL);
  const sectionByKey = new Map(input.sectionContent.map((section) => [section.sectionKey, section]));
  const bandByKey = new Map(input.bands.map((band) => [band.bandKey, band]));

  const drafts: SignalDraft[] = [];
  for (const section of input.sections) {
    const resolved = resolveMapped(library, SOURCE_WHOLE_BODY_SIGNAL, 'section', section.sectionKey);
    if (!resolved) continue;
    const band = bandByKey.get(section.bandKey);
    const name = sectionByKey.get(section.sectionKey);
    drafts.push({
      ...resolved,
      side: null,
      valueKind: 'band',
      valueLabel: band?.memberLabel ?? section.bandKey,
      valueKey: section.bandKey,
      valueNumeric: section.percent,
      sourceKey: SOURCE_WHOLE_BODY_SIGNAL,
      sourceLabel: label,
      sourceSessionId: input.sittingId,
      sourceQuestionRef: section.sectionKey,
      sourceQuestionPrompt: name
        ? `${name.displayName}, ${section.percent} percent signal`
        : null,
      sourceRecordId: null,
      capturedOn,
      capturedAt: input.completedAt,
      note: null,
      ingestFingerprint: fingerprint(
        SOURCE_WHOLE_BODY_SIGNAL,
        input.sittingId,
        `section:${section.sectionKey}`
      ),
    });
  }
  return drafts;
}

export const wholeBodySignalAdapter: SignalAdapter<WholeBodySignalAdapterInput> = {
  sourceKey: SOURCE_WHOLE_BODY_SIGNAL,
  description: 'Rooted Reset Whole-Body Signal Assessment section percentages, system level only',

  async listCompleted(supabase: SupabaseClient, memberId: string): Promise<IngestibleSitting[]> {
    const read = await listWbsSessions(supabase, memberId, 50);
    if (!read.ok) return [];
    return read.records
      .filter((record) => record.completedAt !== null && record.results !== null)
      .map((record) => ({ id: record.id, completedAt: record.completedAt as string }));
  },

  async load(supabase, memberId, sittingId) {
    const [read, content] = await Promise.all([
      listWbsSessions(supabase, memberId, 50),
      loadReadingContent(supabase),
    ]);
    if (!read.ok) return null;
    const record = read.records.find((candidate) => candidate.id === sittingId);
    if (!record || !record.completedAt || !record.results) return null;
    return {
      sittingId: record.id,
      completedAt: record.completedAt,
      sections: record.results.sections,
      sectionContent: content.sections,
      bands: content.bands,
    };
  },

  build: buildWholeBodySignalSignals,
};
