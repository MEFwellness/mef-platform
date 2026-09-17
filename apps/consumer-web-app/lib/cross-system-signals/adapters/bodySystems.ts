/**
 * The Rooted Reset Body Systems Survey, as signals.
 *
 * TWO LEVELS, AND BOTH ARE THINGS THE MEMBER ACTUALLY ANSWERED.
 *
 *   THE ELEVEN SECTION BANDS, every sitting, every section, including the
 *     quiet ones. That is the same discipline the survey's own Root Map
 *     adapter follows and for the same reason: a section that was Speaking
 *     loudly last month and is Quiet today has to be able to say so, and a
 *     library that only ingested loud sections would leave last month's
 *     alarm standing forever with nothing able to close it.
 *   THE NOTABLE INDIVIDUAL RESPONSES, which means an answer the survey
 *     rule treats as an active signal (../questionnaireRules.ts: Often or
 *     Almost always, or a Sometimes with a support condition), plus any
 *     signal this member has reported before, so a symptom that has settled
 *     can be seen to have settled rather than quietly disappearing off her
 *     timeline. An unsupported Sometimes, a Rarely and a Never about
 *     something she has never reported write nothing.
 *
 * IT CHANGES NOTHING ABOUT THE SURVEY. This file reads stored rows and
 * writes nothing back. No score, no section, no band cut off, no red flag,
 * no safety response and no member results screen is touched, and this
 * adapter has no function that could touch one. A Does not apply to me tap
 * is skipped rather than scored as anything, exactly as the survey itself
 * treats it.
 *
 * A QUESTION WITH NO DICTIONARY ROW IS SKIPPED. There is no transform here
 * that could turn a question ref into a signal name.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DNA_VALUE } from '@/lib/body-systems/types';
import type {
  BodySystemsBand,
  BodySystemsQuestion,
  BodySystemsResults,
  BodySystemsScaleOption,
  BodySystemsSection,
} from '@/lib/body-systems/types';
import { listBodySystemsSessions } from '@/lib/body-systems/data';
import { loadAssociationTriggers, loadMemberContent } from '@/lib/body-systems/contentData';
import type { AssociationTriggerRow } from '@/lib/body-systems/triggerEvaluation';
import { buildSittingFacts, decideAnswer } from '../questionnaireState';
import { SOURCE_BODY_SYSTEMS } from '../constants';
import { resolveMapped, sourceLabel } from '../library';
import { fingerprint, type BuildContext, type IngestibleSitting, type SignalAdapter } from '../registry';
import type { SignalDraft } from '../types';

/** Exactly what `build` needs, and nothing that could let it reach a database. */
export type BodySystemsAdapterInput = {
  sittingId: string;
  completedAt: string;
  /** question_ref to a scale value_key, or the Does not apply to me literal. */
  answers: Record<string, string>;
  results: BodySystemsResults | null;
  sections: readonly BodySystemsSection[];
  questions: readonly BodySystemsQuestion[];
  scale: readonly BodySystemsScaleOption[];
  bands: readonly BodySystemsBand[];
  /**
   * The association triggers, with no wording, so a Sometimes answer inside
   * a coach approved cluster that fired can be recognised. Optional: with
   * none, that one support condition simply cannot hold.
   */
  associationTriggers?: readonly AssociationTriggerRow[];
};

export function buildBodySystemsSignals(
  input: BodySystemsAdapterInput,
  context: BuildContext
): SignalDraft[] {
  const { library, capturedOn, knownSlugs } = context;
  const label = sourceLabel(library, SOURCE_BODY_SYSTEMS);
  const drafts: SignalDraft[] = [];

  const sectionByKey = new Map(input.sections.map((section) => [section.sectionKey, section]));
  const bandByKey = new Map(input.bands.map((band) => [band.bandKey, band]));
  const optionByKey = new Map(input.scale.map((option) => [option.valueKey, option]));

  // The eleven section bands.
  for (const section of input.results?.sections ?? []) {
    const resolved = resolveMapped(library, SOURCE_BODY_SYSTEMS, 'section', section.sectionKey);
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
      sourceKey: SOURCE_BODY_SYSTEMS,
      sourceLabel: label,
      sourceSessionId: input.sittingId,
      sourceQuestionRef: section.sectionKey,
      sourceQuestionPrompt: name ? `${name.displayName}, ${section.percent} percent` : null,
      sourceRecordId: null,
      capturedOn,
      capturedAt: input.completedAt,
      note: null,
      ingestFingerprint: fingerprint(SOURCE_BODY_SYSTEMS, input.sittingId, `section:${section.sectionKey}`),
    });
  }

  // The survey rule reads the sitting's own sections and fired associations.
  // Without a stored reading there is nothing to judge a Sometimes against,
  // and the rule then lets only the points and another source speak.
  const sitting = input.results
    ? buildSittingFacts({
        sittingId: input.sittingId,
        completedAt: input.completedAt,
        branch: input.results.branch,
        answers: input.answers,
        results: input.results,
        questions: input.questions,
        scale: input.scale,
        bands: input.bands,
        associationTriggers: input.associationTriggers ?? [],
      })
    : null;

  // The notable individual responses. A question she was not asked, did not
  // answer, or marked Does not apply to me is never read at all.
  for (const question of input.questions) {
    const answer = input.answers[question.questionRef];
    if (!answer || answer === DNA_VALUE) continue;
    const option = optionByKey.get(answer);
    if (!option) continue;

    const resolved = resolveMapped(library, SOURCE_BODY_SYSTEMS, 'question', question.questionRef);
    if (!resolved) continue;

    // An active signal by the survey rule, or something she has reported
    // before and may have settled.
    const decision = decideAnswer({
      points: option.points,
      questionRef: question.questionRef,
      signalSlug: resolved.signalSlug,
      sitting,
      sittingDay: capturedOn,
      records: context.records ?? [],
    });
    if (!decision.active && !knownSlugs.has(resolved.signalSlug)) continue;

    drafts.push({
      ...resolved,
      side: null,
      valueKind: 'scale',
      valueLabel: option.label,
      valueKey: option.valueKey,
      valueNumeric: option.points,
      sourceKey: SOURCE_BODY_SYSTEMS,
      sourceLabel: label,
      sourceSessionId: input.sittingId,
      sourceQuestionRef: question.questionRef,
      sourceQuestionPrompt: question.prompt,
      sourceRecordId: null,
      capturedOn,
      capturedAt: input.completedAt,
      note: null,
      ingestFingerprint: fingerprint(
        SOURCE_BODY_SYSTEMS,
        input.sittingId,
        `question:${question.questionRef}`
      ),
    });
  }

  return drafts;
}

export const bodySystemsAdapter: SignalAdapter<BodySystemsAdapterInput> = {
  sourceKey: SOURCE_BODY_SYSTEMS,
  description: 'Rooted Reset Body Systems Survey section bands and notable individual responses',

  async listCompleted(supabase: SupabaseClient, memberId: string): Promise<IngestibleSitting[]> {
    const read = await listBodySystemsSessions(supabase, memberId, 50);
    if (!read.ok) return [];
    return read.records
      .filter((record) => record.completedAt !== null && record.results !== null)
      .map((record) => ({ id: record.id, completedAt: record.completedAt as string }));
  },

  async load(supabase, memberId, sittingId) {
    const [read, content, associationTriggers] = await Promise.all([
      listBodySystemsSessions(supabase, memberId, 50),
      loadMemberContent(supabase),
      loadAssociationTriggers(supabase),
    ]);
    if (!read.ok) return null;
    const record = read.records.find((candidate) => candidate.id === sittingId);
    if (!record || !record.completedAt || !record.results) return null;
    return {
      sittingId: record.id,
      completedAt: record.completedAt,
      answers: record.answers,
      results: record.results,
      sections: content.sections,
      // Only the questions her own branch was asked, so a branch b member
      // never gets a signal from a branch a question she never saw.
      questions: content.questions.filter(
        (question) => question.branch === 'all' || question.branch === record.branch
      ),
      scale: content.scale,
      bands: content.bands,
      associationTriggers,
    };
  },

  build: buildBodySystemsSignals,
};
