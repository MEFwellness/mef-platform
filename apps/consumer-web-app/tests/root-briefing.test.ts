/**
 * THE COACH BRIEFING, END TO END AND RULE BY RULE.
 *
 * The end to end cases drive the REAL pipeline: the survey's own scoring,
 * the real adapter, the real survey lookup over the shipped Whole-Body
 * Association Map, the real store and the coach's real read. Only the
 * database is a stand-in, and it caps an unbounded read at a thousand rows
 * the way production does. The rule cases drive ./briefingRules.ts with
 * literals.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cross-system-relationships/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cross-system-relationships/data')>();
  const fixture = await import('./questionnaire-root-fixture');
  return { ...actual, listRelationships: async () => ({ ok: true, summaries: fixture.REAL_SUMMARIES }) };
});
vi.mock('@/lib/cross-system-signals/contentData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cross-system-signals/contentData')>();
  const fixture = await import('./questionnaire-root-fixture');
  return { ...actual, loadSignalLibrary: async () => fixture.REAL_LIBRARY };
});
vi.mock('@/lib/body-systems/contentData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/body-systems/contentData')>();
  const fixture = await import('./questionnaire-root-fixture');
  const survey = await import('./body-systems-fixture');
  return {
    ...actual,
    loadMemberContent: async () => fixture.SURVEY_CONTENT,
    loadAssociationTriggers: async () => fixture.SURVEY_TRIGGERS,
    loadCoachContent: async () => ({ ...fixture.SURVEY_CONTENT, library: survey.LIBRARY, coachCopy: {} }),
  };
});
vi.mock('@/lib/time/memberToday', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/time/memberToday')>();
  return { ...actual, memberTimezone: async () => 'America/New_York' };
});
vi.mock('@/lib/cross-system-patterns/evaluate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cross-system-patterns/evaluate')>();
  return { ...actual, evaluateMember: async () => ({ evaluated: 0, surfaced: 0, skipped: null }) };
});
vi.mock('@/lib/cross-system-complaints/lexiconData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cross-system-complaints/lexiconData')>();
  const lexicon = await import('./cross-system-complaint-fixture');
  return {
    ...actual,
    loadComplaintLexicon: async () => ({
      ...lexicon.shippedLexicon(),
      surfaces: new Map([
        [
          'daily_checkin_notes',
          {
            surfaceKey: 'daily_checkin_notes',
            position: 1,
            displayName: 'Daily check-in notes',
            defaultAuthorRole: 'member' as const,
          },
        ],
      ]),
    }),
  };
});

import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ingestSitting } from '@/lib/cross-system-signals/service';
import { runQuestionnaireLookup } from '@/lib/cross-system-root/questionnaireEngine';
import { readRootNoticed } from '@/lib/cross-system-root/noticedRead';
import { ingestComplaint } from '@/lib/cross-system-complaints/service';
import { judgeRecords, loadQuestionnaire } from '@/lib/cross-system-signals/questionnaireFacts';
import { listAllSignalsForMember } from '@/lib/cross-system-signals/data';
import {
  buildRootBriefing,
  cautious,
  findBriefingCard,
  findDismissedBriefingCard,
  describeAbsence,
  type BriefingCardView,
  type RootBriefingInputs,
  type RootBriefingView,
} from '@/lib/cross-system-root/briefing';
import {
  BRIEFING_CARD_LIMIT,
  BRIEFING_RESTORE_ACTION,
  EMPTY_EVIDENCE_STATE,
  REPORTING_WINDOWS,
  compareByRank,
  evidenceFingerprint,
  groupKeyFor,
  isMaterialChange,
  parseEvidenceState,
  relatedFindingEntries,
  reviewStatusOf,
  type BriefingEvidenceState,
  type RankFacts,
} from '@/lib/cross-system-root/briefingRules';
import { recordBriefingReview } from '@/lib/cross-system-root/briefingData';
import {
  ABSENCE_LABELS,
  BRIEFING_DISCLAIMER,
  BRIEFING_HEADLINE_FALLBACK,
  BRIEFING_MARKERS,
  DIRECTION_BY_SIGNAL,
  NOT_A_DIAGNOSIS,
  NO_RELATED_FINDINGS,
  PAIR_QUESTIONS,
  SHORT_SOURCE_LABELS,
  WHY_REVIEW_FALLBACK,
  briefingHeadline,
  exploreChangeQuestion,
  explorePairQuestion,
  whyReviewTogetherLine,
} from '@/lib/cross-system-root/copy';
import { rootNoticedDigest, signalsDigest } from '@/lib/coach-detail/digests';
import { findBannedLanguage } from '@/lib/cross-system-relationships/language';
import { RootNoticedPanel } from '@/app/coach/clients/[id]/RootNoticedPanel';
import type { FullRootNoticedView } from '@/lib/cross-system-root/noticedView';
import {
  FakeDb,
  MEMBER_ID,
  REAL_LIBRARY,
  REAL_NAMES,
  REAL_SUMMARIES,
  SURVEY_CONTENT,
  answers,
  sittingRow,
} from './questionnaire-root-fixture';

const COACH_ID = '00000000-0000-4000-8000-00000000c0ac';
const SEP16 = '2026-09-16T14:00:00.000Z';
const SEP17 = '2026-09-17T14:00:00.000Z';
const JUN12 = '2026-06-12T14:00:00.000Z';

let db: FakeDb;

beforeEach(() => {
  db = new FakeDb();
});

/** Exactly what the survey's submit does after her result is built. */
async function complete(
  id: string,
  sheet: Record<string, string>,
  completedAt: string,
  options: { branch?: 'a' | 'b'; redFlags?: Record<string, boolean> } = {}
) {
  db.rows('member_body_systems_sessions').push(sittingRow({ id, answers: sheet, completedAt, ...options }));
  await ingestSitting({ memberId: MEMBER_ID, sourceKey: 'body_systems_survey', sittingId: id, client: db.asClient() });
  await runQuestionnaireLookup({
    memberId: MEMBER_ID,
    sittingId: id,
    trigger: 'sitting_ingested',
    client: db.asClient(),
    now: completedAt,
  });
}

async function coachOpens(today = '2026-09-17'): Promise<FullRootNoticedView> {
  return readRootNoticed(db.asClient(), MEMBER_ID, { today, viewerId: COACH_ID });
}

function briefingOf(view: FullRootNoticedView): RootBriefingView {
  expect(view.briefing, 'the read builds a briefing').toBeTruthy();
  return view.briefing!;
}

function card(briefing: RootBriefingView, anchorSlug: string): BriefingCardView {
  const found = briefing.cards.find((entry) => entry.anchorSlug === anchorSlug);
  expect(found, `a card anchored on ${anchorSlug}`).toBeDefined();
  return found!;
}

/** The same inputs readRootNoticed builds, for the pure helpers. */
async function inputsFor(today = '2026-09-17'): Promise<RootBriefingInputs> {
  const [signals, questionnaire] = await Promise.all([
    listAllSignalsForMember(db.asClient(), MEMBER_ID),
    loadQuestionnaire(db.asClient(), MEMBER_ID),
  ]);
  return {
    records: judgeRecords(signals.records, questionnaire),
    summaries: REAL_SUMMARIES,
    library: REAL_LIBRARY,
    complaints: [],
    classifications: new Map(),
    flaggedSignals: new Set(),
    questionnaire: { facts: questionnaire.facts, sittings: questionnaire.sittings, content: questionnaire.content },
    today,
    timezone: 'America/New_York',
    lastEvaluatedAt: null,
    reviews: [],
    lastVisitedAt: null,
  };
}

function facts(overrides: Partial<RankFacts>): RankFacts {
  return {
    targetKey: 'signal:x',
    anchorName: 'X',
    meaningfulChange: false,
    frequencyPoints: 6,
    supportingSignalCount: 0,
    sourceCount: 1,
    pinned: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------

describe('ranking order', () => {
  it('applies meaningful change, then frequency, then supporting signals, then source count', () => {
    const changed = facts({ targetKey: 'a', anchorName: 'A', meaningfulChange: true, frequencyPoints: 3 });
    const loud = facts({ targetKey: 'b', anchorName: 'B', frequencyPoints: 8 });
    const supported = facts({ targetKey: 'c', anchorName: 'C', frequencyPoints: 6, supportingSignalCount: 3 });
    const plain = facts({ targetKey: 'd', anchorName: 'D', frequencyPoints: 6, supportingSignalCount: 1, sourceCount: 2 });
    const tie = facts({ targetKey: 'e', anchorName: 'E', frequencyPoints: 6, supportingSignalCount: 1, sourceCount: 1 });
    const order = [tie, plain, supported, loud, changed].sort(compareByRank).map((entry) => entry.targetKey);
    expect(order).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('source count only ever breaks a tie: more sources never beats more supporting signals', () => {
    const manySources = facts({ targetKey: 'a', supportingSignalCount: 1, sourceCount: 5 });
    const moreSupport = facts({ targetKey: 'b', supportingSignalCount: 2, sourceCount: 1 });
    expect([manySources, moreSupport].sort(compareByRank)[0]!.targetKey).toBe('b');
  });

  it('a pin is not a ranking rule: the order ignores it', () => {
    const pinnedQuiet = facts({ targetKey: 'p', frequencyPoints: 3, pinned: true });
    const loud = facts({ targetKey: 'l', frequencyPoints: 8 });
    expect([pinnedQuiet, loud].sort(compareByRank).map((entry) => entry.targetKey)).toEqual(['l', 'p']);
  });

  it('FIRST SURVEY FALLTHROUGH: with no comparable history the order is frequency, then supporting signals', async () => {
    await complete(
      's1',
      answers({ N4: 'often', D1: 'almost_always', N5: 'often', K7: 'often', HB7: 'often' }),
      SEP16
    );
    const briefing = briefingOf(await coachOpens());
    expect(briefing.cards.length).toBeGreaterThan(1);
    for (const entry of briefing.cards) {
      expect(entry.changeMarker).toBe('First recorded');
      expect(entry.reported.every((line) => line.change.kind === 'first_recorded')).toBe(true);
    }
    // Almost always first.
    expect(briefing.cards[0]!.anchorSlug).toBe('bloating-after-eating');
    // Then the Often cards, most supporting signals first.
    const often = briefing.cards.slice(1);
    const counts = often.map((entry) => Number(/(\d+) supporting/.exec(entry.rankReason)?.[1] ?? 0));
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(briefing.cards[0]!.rankReason).toMatch(/^First recorded, reported Almost always/);
  });
});

// ---------------------------------------------------------------------
// Change
// ---------------------------------------------------------------------

describe('worsening, and the comparable history it needs', () => {
  it('a retake that moves up the scale is Answer changed, with both dates, and ranks first', async () => {
    await complete('s1', answers({ N4: 'sometimes', D1: 'almost_always', HB7: 'often' }), JUN12);
    await complete('s2', answers({ N4: 'often', D1: 'almost_always', HB7: 'often' }), SEP16);
    const briefing = briefingOf(await coachOpens());
    const headaches = card(briefing, 'headaches');
    expect(briefing.cards[0]!.targetKey).toBe(headaches.targetKey);
    expect(headaches.changeMarker).toBe('Answer changed');
    const line = headaches.reported.find((entry) => entry.signalSlug === 'headaches')!;
    expect(line.change.line).toBe('Answer changed: Often (Sep 16) from Sometimes (Jun 12)');
    expect(headaches.rankReason).toMatch(/^Answer changed/);
    // The louder card that did not change ranks below it.
    const bloating = card(briefing, 'bloating-after-eating');
    expect(bloating.changeMarker).toBeNull();
    expect(bloating.reported[0]!.change.line).toBe('Same answer: Almost always (Jun 12 and Sep 16)');
  });

  it('moving DOWN the scale is a change but not a reason to rank first', async () => {
    await complete('s1', answers({ N4: 'almost_always', HB7: 'often' }), JUN12);
    await complete('s2', answers({ N4: 'often', HB7: 'often' }), SEP16);
    const briefing = briefingOf(await coachOpens());
    const headaches = card(briefing, 'headaches');
    expect(headaches.changeMarker).toBe('Answer changed');
    expect(headaches.rankReason).not.toContain('a higher frequency selected');
    expect(headaches.reported[0]!.change.line).toBe('Answer changed: Often (Sep 16) from Almost always (Jun 12)');
  });

  it('an earlier sitting that did not ASSESS the question is not comparable history', async () => {
    // HA1 is only asked on branch a. Branch b in June never asked it.
    await complete('s1', answers({ N4: 'often' }, 'b'), JUN12, { branch: 'b' });
    await complete('s2', answers({ HA1: 'often', N4: 'often' }, 'a'), SEP16, { branch: 'a' });
    const briefing = briefingOf(await coachOpens());
    const cycle = card(briefing, 'irregular-cycle');
    expect(cycle.changeMarker).toBe('First recorded');
    expect(cycle.reported[0]!.change.kind).toBe('first_recorded');
    // And headaches, asked both times, is compared.
    expect(card(briefing, 'headaches').reported[0]!.change.kind).toBe('unchanged');
  });

  it('newly crossing into active against comparable history counts as meaningful change', async () => {
    await complete('s1', answers({ K2: 'never', D1: 'almost_always' }), JUN12);
    await complete('s2', answers({ K2: 'often', D1: 'almost_always' }), SEP16);
    const briefing = briefingOf(await coachOpens());
    expect(briefing.cards[0]!.anchorSlug).toBe('frequent-urination');
    expect(briefing.cards[0]!.reported[0]!.change.line).toBe('Answer changed: Often (Sep 16) from Never (Jun 12)');
  });

  it('First recorded never says the symptom just began', async () => {
    await complete('s1', answers({ N4: 'often' }), SEP16);
    const line = card(briefingOf(await coachOpens()), 'headaches').reported[0]!;
    expect(line.change.kind).toBe('first_recorded');
    if (line.change.kind === 'first_recorded') {
      expect(line.change.line).toBe('First recorded');
      expect(line.change.note).toContain('does not mean it just began');
    }
  });
});

// ---------------------------------------------------------------------
// Canonical signals
// ---------------------------------------------------------------------

describe('canonical signals, never raw rows', () => {
  it('two questions filing one canonical signal are one reported signal and inflate nothing', async () => {
    // T2 and H9 both file "Cold hands or feet".
    await complete('one', answers({ T2: 'often' }), SEP16);
    const single = card(briefingOf(await coachOpens()), 'cold-hands-or-feet');

    db = new FakeDb();
    await complete('both', answers({ T2: 'often', H9: 'often' }), SEP16);
    const briefing = briefingOf(await coachOpens());
    const cards = briefing.cards.filter((entry) => entry.anchorSlug === 'cold-hands-or-feet');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.reported).toHaveLength(1);
    expect(cards[0]!.rankReason).toBe(single.rankReason);
    expect(cards[0]!.evidenceState).toEqual(single.evidenceState);
  });

  it('the same symptom from a survey and a sentence is one canonical signal: one card, supporting count unchanged', async () => {
    await complete('s1', answers({ N4: 'often' }), SEP16);
    const surveyOnly = card(briefingOf(await coachOpens()), 'headaches');

    await ingestComplaint({
      memberId: MEMBER_ID,
      surfaceKey: 'daily_checkin_notes',
      rawText: 'I have had headaches again this week.',
      reportedAt: SEP17,
      authorRole: 'member',
      client: db.asClient(),
      now: SEP17,
    });
    const briefing = briefingOf(await coachOpens());
    const headacheCards = briefing.cards.filter((entry) => entry.targetKey === surveyOnly.targetKey);
    expect(headacheCards).toHaveLength(1);
    const both = headacheCards[0]!;
    const supporting = (reason: string) => Number(/(\d+) supporting/.exec(reason)?.[1] ?? 0);
    // Non vacuous: the sentence really was read as a second source.
    expect(both.reported.map((line) => line.sourceLabel)).toHaveLength(2);
    expect(both.rankReason).toContain('from 2 sources');
    expect(supporting(both.rankReason)).toBe(supporting(surveyOnly.rankReason));
    expect(Object.keys(both.evidenceState.reported)).toEqual(['headaches']);
  });
});

// ---------------------------------------------------------------------
// The related findings relevance bar
// ---------------------------------------------------------------------

describe('related findings', () => {
  it('never lists a section score', async () => {
    await complete('s1', answers({ N4: 'almost_always', N1: 'almost_always', N2: 'almost_always', N3: 'often', D1: 'often' }), SEP16);
    const view = await coachOpens();
    const bandSlugs = new Set(
      db.rows('cross_system_signals').filter((row) => row.value_kind === 'band').map((row) => row.signal_slug as string)
    );
    expect(bandSlugs.size, 'the sitting filed section rollups').toBeGreaterThan(0);
    for (const entry of briefingOf(view).cards) {
      for (const line of entry.evidence.allRelated) expect(bandSlugs.has(line.signalSlug)).toBe(false);
    }
  });

  it('never lists an inactive signal: an unsupported Sometimes, or an answer a newer sitting replaced', async () => {
    await complete('s1', answers({ N4: 'often', HB7: 'often' }), JUN12);
    await complete('s2', answers({ N4: 'often', HB7: 'never', D1: 'sometimes' }), SEP16);
    const headaches = card(briefingOf(await coachOpens()), 'headaches');
    const slugs = headaches.evidence.allRelated.map((line) => line.signalSlug);
    expect(slugs).not.toContain('lighter-or-broken-sleep');
    expect(slugs).not.toContain('bloating-after-eating');
    expect(headaches.noRelatedLine).toBe(NO_RELATED_FINDINGS);
  });

  it('lists only what a fired entry for THIS symptom connects, never an unconnected active signal', async () => {
    // Headaches' own entry lists sleep; it does not list urination.
    await complete('s1', answers({ N4: 'often', HB7: 'often', K2: 'often' }), SEP16);
    const briefing = briefingOf(await coachOpens());
    const headaches = card(briefing, 'headaches');
    const slugs = headaches.evidence.allRelated.map((line) => line.signalSlug);
    expect(slugs).toContain('lighter-or-broken-sleep');
    expect(slugs).not.toContain('frequent-urination');
    for (const line of headaches.evidence.allRelated) expect(line.viaPatternNames.length).toBeGreaterThan(0);
  });

  it('says so in one sentence when nothing qualifies, rather than padding with possibilities', async () => {
    await complete('s1', answers({ K7: 'often' }), SEP16);
    const puffiness = card(briefingOf(await coachOpens()), 'under-eye-puffiness');
    expect(puffiness.related).toHaveLength(0);
    expect(puffiness.noRelatedLine).toBe('No related findings are currently supported by her answers.');
    // Anchored on what she reported, never on an area she did not, and with
    // nothing displayed to support a direction it is the symptom alone.
    expect(puffiness.headline).toBe('Under-eye puffiness in the morning');
    expect(puffiness.whyReviewTogether).toBeNull();
    expect(puffiness.headline).not.toMatch(/^Urinary/);
  });

  it('broad category entries do not repeat the same findings across every card', () => {
    const specific = { version: { components: [{ role: 'primary', refKind: 'signal', refKey: 'headaches' }] } };
    const broad = { version: { components: [{ role: 'primary', refKind: 'category', refKey: 'mood' }] } };
    expect(relatedFindingEntries([specific, broad], new Set(['headaches']))).toEqual([specific]);
    // A card that reached no entry naming its own signal keeps what it reached.
    expect(relatedFindingEntries([broad], new Set(['headaches']))).toEqual([broad]);
  });

  it('at most three on the card, all of them in View evidence', async () => {
    await complete('s1', answers({ N4: 'often', HB7: 'often', D1: 'almost_always', K7: 'often', N5: 'often', A5: 'often', B3: 'often', D2: 'often' }), SEP16);
    for (const entry of briefingOf(await coachOpens()).cards) {
      expect(entry.related.length).toBeLessThanOrEqual(3);
      expect(entry.evidence.allRelated.slice(0, entry.related.length)).toEqual(entry.related);
    }
  });
});

// ---------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------

describe('grouping overlapping complaints', () => {
  it('"Headaches" and "Headaches when not eaten" are one card, and each answer stays visible', async () => {
    await complete('s1', answers({ N4: 'often', B5: 'often' }), SEP16);
    const briefing = briefingOf(await coachOpens());
    const headacheCards = briefing.cards.filter((entry) =>
      entry.reported.some((line) => line.signalSlug === 'headaches' || line.signalSlug === 'headaches-when-not-eaten')
    );
    expect(headacheCards).toHaveLength(1);
    const grouped = headacheCards[0]!;
    expect(grouped.targetKey).toBe(groupKeyFor('headaches', REAL_LIBRARY.names));
    expect(grouped.anchorName).toBe('Headaches');
    expect(grouped.headline.startsWith('Headaches: explore meal timing')).toBe(true);
    expect(grouped.reported.map((line) => line.questionRef).sort()).toEqual(['B5', 'N4']);
    expect(grouped.exploreNext).toContain('Do your headaches follow delayed or skipped meals?');
  });

  it('a group counts once toward ranking', async () => {
    await complete('s1', answers({ N4: 'often', B5: 'often' }), SEP16);
    const briefing = briefingOf(await coachOpens());
    expect(briefing.cards.filter((entry) => entry.targetKey.startsWith('group:head:pain'))).toHaveLength(1);
    // The sibling adds one supporting canonical signal, not one per answer.
    const grouped = card(briefing, 'headaches');
    const supporting = Number(/(\d+) supporting/.exec(grouped.rankReason)?.[1] ?? 0);
    expect(supporting).toBe(1 + grouped.evidence.allRelated.length);
  });

  it('two puffiness signals in different body areas are not merged', () => {
    expect(groupKeyFor('under-eye-puffiness', REAL_LIBRARY.names)).not.toBe(
      groupKeyFor('morning-facial-puffiness', REAL_LIBRARY.names)
    );
  });
});

// ---------------------------------------------------------------------
// The four missing data states
// ---------------------------------------------------------------------

describe('missing data states', () => {
  it('Never on the latest survey is "Not reported on the latest assessment", never an improvement', async () => {
    await complete('s1', answers({ K2: 'never' }), SEP16);
    const absence = describeAbsence('frequent-urination', await inputsFor());
    expect(absence!.kind).toBe('not_reported_latest');
    expect(absence!.line).toBe(`${ABSENCE_LABELS.not_reported_latest} (answered Never on Sep 16)`);
    expect(absence!.line).not.toMatch(/previous|improv|before/i);
  });

  it('a question her branch never asked is Not assessed, even with a stray stored value, and never "Never"', async () => {
    await complete('s1', { ...answers({ N4: 'often' }, 'b'), HA1: 'never' }, SEP16, { branch: 'b' });
    const absence = describeAbsence('irregular-cycle', await inputsFor());
    expect(absence!.kind).toBe('not_assessed');
    expect(absence!.line).toBe('Not assessed (the question was not asked on her survey path)');
    expect(absence!.line).not.toContain('Never');
  });

  it('a "does not apply" answer is Not assessed', async () => {
    await complete('s1', answers({ L2: 'dna' }), SEP16);
    const absence = describeAbsence('unwell-after-alcohol', await inputsFor());
    expect(absence!.kind).toBe('not_assessed');
    expect(absence!.line).toContain('marked as not applying');
  });

  it('active before and below the threshold now is "Previously reported, now below the active threshold"', async () => {
    await complete('s1', answers({ K2: 'often' }), JUN12);
    await complete('s2', answers({ K2: 'rarely' }), SEP16);
    const absence = describeAbsence('frequent-urination', await inputsFor());
    expect(absence!.kind).toBe('previously_reported_now_below');
    expect(absence!.line).toBe(`${ABSENCE_LABELS.previously_reported_now_below} (Rarely on Sep 16, Often on Jun 12)`);
  });

  it('active on a sitting whose question the latest one did not ask is "Historical evidence with no recent update"', async () => {
    await complete('s1', answers({ HA1: 'often' }, 'a'), JUN12, { branch: 'a' });
    await complete('s2', answers({ N4: 'often' }, 'b'), SEP16, { branch: 'b' });
    const absence = describeAbsence('irregular-cycle', await inputsFor());
    expect(absence!.kind).toBe('historical_no_update');
    expect(absence!.line).toContain('Often on Jun 12, not assessed since');
  });

  it('the four labels are four different words', () => {
    const labels = Object.values(ABSENCE_LABELS);
    expect(new Set(labels).size).toBe(4);
  });

  it('a card lists the absences of its own complaint group in View evidence', async () => {
    await complete('s1', answers({ N4: 'often', B5: 'rarely' }), SEP16);
    const headaches = card(briefingOf(await coachOpens()), 'headaches');
    const sibling = headaches.evidence.absences.find((entry) => entry.signalSlug === 'headaches-when-not-eaten');
    expect(sibling?.kind).toBe('not_reported_latest');
  });
});

// ---------------------------------------------------------------------
// Timeframe wording
// ---------------------------------------------------------------------

describe('the timeframe names the assessment window, not a recency tier', () => {
  it('reads "Reported Sep 16 (covers past 3 months)"', async () => {
    await complete('s1', answers({ N4: 'often' }), SEP16);
    const view = await coachOpens('2026-09-17');
    const line = card(briefingOf(view), 'headaches').reported[0]!;
    expect(line.reportedLine).toBe('Reported Sep 16 (covers past 3 months)');
    const html = renderToStaticMarkup(createElement(RootNoticedPanel, { state: { allowed: true, view } }));
    // On the card it is said once, in the shared source line.
    expect(html).toContain('Rooted Reset Body Systems Survey, Sep 16 (covers past 3 months)');
    expect(JSON.stringify(view.briefing)).not.toMatch(/last 30 days/i);
  });

  it('the window is the one the survey tells the member, read from migration 221', () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../../supabase/migrations/00000000000221_body_systems_content.sql'),
      'utf8'
    );
    expect(sql).toContain('Answer for the last 3 months.');
    expect(REPORTING_WINDOWS.body_systems_survey).toBe('past 3 months');
  });
});

// ---------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------

describe('the three card limit, without padding', () => {
  function render(view: FullRootNoticedView): string {
    return renderToStaticMarkup(createElement(RootNoticedPanel, { state: { allowed: true, view } }));
  }

  it('one qualifying finding draws one card and no "View all findings"', async () => {
    await complete('s1', answers({ K7: 'often' }), SEP16);
    const view = await coachOpens();
    expect(briefingOf(view).cards).toHaveLength(1);
    const html = render(view);
    expect(html.match(/data-briefing-card=/g)).toHaveLength(1);
    expect(html).not.toContain('View all findings');
  });

  it('five draw three, and "View all findings" names the rest', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always', N5: 'often', K7: 'often', HB7: 'often' }), SEP16);
    const view = await coachOpens();
    expect(briefingOf(view).cards.length).toBe(5);
    const html = render(view);
    expect(html.match(/data-briefing-card=/g)).toHaveLength(BRIEFING_CARD_LIMIT);
    expect(html).toContain('View all findings (2 more)');
  });

  it('draws the five parts, the disclaimer once, the last updated line, and the evidence behind a tap', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always', N5: 'often', K7: 'often', HB7: 'often' }), SEP16);
    const view = await coachOpens();
    const html = render(view);
    const drawn = briefingOf(view).cards.slice(0, BRIEFING_CARD_LIMIT);
    for (const part of ['reported', 'related', 'explore']) {
      expect(html.match(new RegExp(`data-briefing-part="${part}"`, 'g'))).toHaveLength(3);
    }
    // A card holding one finding has nothing to review together.
    expect(html.match(/data-briefing-part="why"/g) ?? []).toHaveLength(
      drawn.filter((entry) => entry.whyReviewTogether !== null).length
    );
    expect(html.split(BRIEFING_DISCLAIMER).length - 1).toBe(1);
    expect(html).toContain('Last updated Sep 16, 2026');
    expect(html).toContain('All evidence Root checked');
    // The boilerplate is not drawn per card any more.
    expect(html).not.toContain('Why Root checked this area');
    expect(html).not.toContain(NOT_A_DIAGNOSIS);
    expect(html).not.toContain('—');
    expect(html).not.toContain('%');
  });
});

// ---------------------------------------------------------------------
// Review actions
// ---------------------------------------------------------------------

describe('review actions', () => {
  const state = (points: number | null, supporting: string[] = []): BriefingEvidenceState => ({
    version: 1,
    reported: { headaches: { points, active: true } },
    supporting,
  });

  it('material change is exactly: a frequency shift, a new supporting signal, or a threshold crossing', () => {
    expect(isMaterialChange(state(6), state(6))).toBe(false);
    expect(isMaterialChange(state(6), state(8))).toBe(true);
    expect(isMaterialChange(state(8), state(6))).toBe(true);
    expect(isMaterialChange(state(6), state(6, ['sleep']))).toBe(true);
    expect(isMaterialChange(state(6, ['sleep']), state(6))).toBe(true);
    const inactive: BriefingEvidenceState = { version: 1, reported: { headaches: { points: 6, active: false } }, supporting: [] };
    expect(isMaterialChange(state(6), inactive)).toBe(true);
    expect(isMaterialChange(EMPTY_EVIDENCE_STATE, state(6))).toBe(true);
    expect(evidenceFingerprint(state(6, ['b', 'a']))).toBe(evidenceFingerprint(state(6, ['a', 'b'])));
    expect(parseEvidenceState(JSON.parse(JSON.stringify(state(6, ['a']))))).toEqual(state(6, ['a']));
    expect(parseEvidenceState({ nope: true })).toBeNull();
  });

  it('Reviewed and Not relevant dismiss at the current evidence, and Discuss pins', () => {
    expect(reviewStatusOf({ action: 'reviewed', state: state(6) }, state(6)).status).toBe('dismissed');
    expect(reviewStatusOf({ action: 'not_relevant', state: state(6) }, state(6)).status).toBe('dismissed');
    expect(reviewStatusOf({ action: 'discuss_next_session', state: state(6) }, state(6)).status).toBe('pinned');
    expect(reviewStatusOf({ action: 'reviewed', state: state(6) }, state(8))).toEqual({
      status: 'open',
      changedSinceReview: true,
    });
    // A stored state that cannot be read shows the card rather than hiding it.
    expect(reviewStatusOf({ action: 'reviewed', state: null }, state(6)).status).toBe('open');
  });

  async function act(targetKey: string, action: 'reviewed' | 'not_relevant' | 'discuss_next_session', at: string) {
    const view = await coachOpens();
    const briefing = briefingOf(view);
    const target = [...briefing.pinned, ...briefing.cards].find((entry) => entry.targetKey === targetKey)!;
    await recordBriefingReview(db.asClient(), {
      coachId: COACH_ID,
      memberId: MEMBER_ID,
      targetKey,
      action,
      evidenceState: target.evidenceState,
      actedAt: at,
    });
  }

  it.each(['reviewed', 'not_relevant'] as const)(
    '%s: the card leaves the briefing, survives an identical retake, and returns on a material change',
    async (action) => {
      await complete('s1', answers({ N4: 'often', D1: 'almost_always' }), SEP16);
      const before = await coachOpens();
      const headaches = card(briefingOf(before), 'headaches');
      await act(headaches.targetKey, action, '2026-09-16T20:00:00.000Z');

      const after = await coachOpens();
      expect(briefingOf(after).cards.some((entry) => entry.targetKey === headaches.targetKey)).toBe(false);
      expect(briefingOf(after).dismissed.map((entry) => entry.targetKey)).toContain(headaches.targetKey);
      // NO EVIDENCE DISAPPEARS: the full Root Noticed view is identical.
      expect(after.questionnaire).toEqual(before.questionnaire);
      expect(after.findings).toEqual(before.findings);

      // The same answers again: still dismissed.
      await complete('s2', answers({ N4: 'often', D1: 'almost_always' }), '2026-09-17T09:00:00.000Z');
      expect(briefingOf(await coachOpens()).cards.some((entry) => entry.targetKey === headaches.targetKey)).toBe(false);

      // A frequency change: back, marked.
      await complete('s3', answers({ N4: 'almost_always', D1: 'almost_always' }), SEP17);
      const returned = card(briefingOf(await coachOpens()), 'headaches');
      expect(returned.reviewStatus).toBe('open');
      expect(returned.changedSinceReview).toBe(true);
      // Changed after a REVIEW, which is not the same as new since a visit.
      expect(returned.newSinceVisit).toBe(false);
      expect(briefingOf(await coachOpens()).cards[0]!.targetKey).toBe(headaches.targetKey);
    }
  );

  it('Discuss next session moves the card into its own section, off the priority slots, until Reviewed or Not relevant', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always', N5: 'often', K7: 'often', HB7: 'often' }), SEP16);
    const start = briefingOf(await coachOpens());
    expect(start.cards).toHaveLength(5);
    expect(start.pinned).toHaveLength(0);
    const top = start.cards[0]!;

    await act(top.targetKey, 'discuss_next_session', '2026-09-16T20:00:00.000Z');
    const pinnedView = await coachOpens();
    const briefing = briefingOf(pinnedView);
    expect(briefing.pinned.map((entry) => entry.targetKey)).toEqual([top.targetKey]);
    // Never in both sections, and the priority list still has its own three.
    expect(briefing.cards.some((entry) => entry.targetKey === top.targetKey)).toBe(false);
    expect(briefing.cards).toHaveLength(4);
    const html = renderToStaticMarkup(createElement(RootNoticedPanel, { state: { allowed: true, view: pinnedView } }));
    const pinnedAt = html.indexOf('data-briefing-pinned');
    const priorityAt = html.indexOf('data-briefing-priority');
    expect(pinnedAt).toBeGreaterThan(-1);
    expect(pinnedAt).toBeLessThan(priorityAt);
    expect(html.match(new RegExp(`data-briefing-card="${top.targetKey}"`, 'g'))).toHaveLength(1);
    const priorityHtml = html.slice(priorityAt);
    expect(priorityHtml.match(/data-briefing-card=/g)).toHaveLength(BRIEFING_CARD_LIMIT);
    expect(html).toContain('data-briefing-marker="Discuss next session"');

    await act(top.targetKey, 'not_relevant', '2026-09-16T21:00:00.000Z');
    const cleared = briefingOf(await coachOpens());
    expect(cleared.pinned).toHaveLength(0);
    expect(cleared.cards.some((entry) => entry.targetKey === top.targetKey)).toBe(false);
    expect(cleared.dismissed.map((entry) => entry.targetKey)).toContain(top.targetKey);
  });

  it('the review action finds a pinned card as well as a priority card (the live run found it could not)', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always' }), SEP16);
    const headaches = card(briefingOf(await coachOpens()), 'headaches');
    await act(headaches.targetKey, 'discuss_next_session', '2026-09-16T20:00:00.000Z');
    const briefing = briefingOf(await coachOpens());
    expect(briefing.cards.some((entry) => entry.targetKey === headaches.targetKey)).toBe(false);
    expect(findBriefingCard(briefing, headaches.targetKey)?.targetKey).toBe(headaches.targetKey);
    expect(findBriefingCard(briefing, card(briefing, 'bloating-after-eating').targetKey)).not.toBeNull();
    expect(findBriefingCard(briefing, 'group:nowhere:nothing')).toBeNull();
    expect(findBriefingCard(null, headaches.targetKey)).toBeNull();
    const action = fs.readFileSync(path.resolve(__dirname, '../app/actions/crossSystemRootFindings.ts'), 'utf8');
    expect(action).toContain('findBriefingCard(view.briefing, targetKey)');
    expect(action).not.toMatch(/briefing\?\.cards\.find/);
  });

  it('a pinned card whose evidence changes stays pinned and says it changed since the review', async () => {
    await complete('s1', answers({ N4: 'often' }), SEP16);
    const headaches = card(briefingOf(await coachOpens()), 'headaches');
    await act(headaches.targetKey, 'discuss_next_session', '2026-09-16T20:00:00.000Z');
    await complete('s2', answers({ N4: 'almost_always' }), SEP17);
    const briefing = briefingOf(await coachOpens());
    expect(briefing.pinned[0]!.targetKey).toBe(headaches.targetKey);
    expect(briefing.pinned[0]!.changedSinceReview).toBe(true);
  });

  it('a review is one coach\'s: another coach still sees the card', async () => {
    await complete('s1', answers({ N4: 'often' }), SEP16);
    const headaches = card(briefingOf(await coachOpens()), 'headaches');
    await act(headaches.targetKey, 'reviewed', '2026-09-16T20:00:00.000Z');
    const other = await readRootNoticed(db.asClient(), MEMBER_ID, {
      today: '2026-09-17',
      viewerId: '00000000-0000-4000-8000-0000000000ff',
    });
    expect(briefingOf(other).cards.some((entry) => entry.targetKey === headaches.targetKey)).toBe(true);
  });

  it('"New since your last visit" marks only a card that first appeared after the previous visit', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always' }), SEP16);
    db.rows('cross_system_root_briefing_visits').push({
      coach_id: COACH_ID,
      member_id: MEMBER_ID,
      visited_at: '2026-09-16T20:00:00.000Z',
    });
    const quiet = briefingOf(await coachOpens());
    expect(quiet.cards.every((entry) => !entry.newSinceVisit)).toBe(true);

    // Headaches gets louder (it existed before the visit); puffiness is new.
    await complete('s2', answers({ N4: 'almost_always', D1: 'almost_always', K7: 'often' }), SEP17);
    const briefing = briefingOf(await coachOpens());
    expect(card(briefing, 'under-eye-puffiness').newSinceVisit).toBe(true);
    expect(card(briefing, 'headaches').newSinceVisit).toBe(false);
    expect(card(briefing, 'bloating-after-eating').newSinceVisit).toBe(false);
  });

  it('a visit is not a review: opening the page marks no card reviewed and records nothing about any card', async () => {
    await complete('s1', answers({ N4: 'often' }), SEP16);
    db.rows('cross_system_root_briefing_visits').push({
      coach_id: COACH_ID,
      member_id: MEMBER_ID,
      visited_at: '2026-09-17T09:00:00.000Z',
    });
    const briefing = briefingOf(await coachOpens());
    const headaches = card(briefing, 'headaches');
    expect(headaches.reviewStatus).toBe('open');
    expect(headaches.lastAction).toBeNull();
    expect(headaches.changedSinceReview).toBe(false);
    expect(db.rows('cross_system_root_briefing_reviews')).toHaveLength(0);
  });

  it('the markers read the PREVIOUS visit: the read never writes one', async () => {
    await complete('s1', answers({ N4: 'often' }), SEP16);
    await coachOpens();
    await coachOpens();
    expect(db.rows('cross_system_root_briefing_visits')).toHaveLength(0);
    const source = fs.readFileSync(path.resolve(__dirname, '../lib/cross-system-root/noticedRead.ts'), 'utf8');
    expect(source).not.toMatch(/recordBriefingVisit|recordBriefingReview/);
  });

  it('review actions feed nothing back: no Root, map or mapping table is written', async () => {
    await complete('s1', answers({ N4: 'often' }), SEP16);
    const headaches = card(briefingOf(await coachOpens()), 'headaches');
    const before = db.snapshot();
    await act(headaches.targetKey, 'reviewed', '2026-09-16T20:00:00.000Z');
    const after = db.snapshot();
    const changed = Object.keys(after).filter(
      (table) => JSON.stringify(after[table]) !== JSON.stringify(before[table])
    );
    expect(changed).toEqual(['cross_system_root_briefing_reviews']);
    const source = fs.readFileSync(path.resolve(__dirname, '../lib/cross-system-root/briefingData.ts'), 'utf8');
    const tables = [...source.matchAll(/\.from\('([a-z_]+)'\)/g)].map((match) => match[1]);
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(['cross_system_root_briefing_reviews', 'cross_system_root_briefing_visits']).toContain(table);
    }
  });
});

// ---------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------

describe('safety is never ranked', () => {
  it('a red flagged sitting draws the safety block above the briefing, and none of its findings are ranked', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always' }), SEP16, { redFlags: { severe_headaches: true } });
    const view = await coachOpens();
    const briefing = briefingOf(view);
    expect(briefing.safety).not.toBeNull();
    expect(briefing.safety!.signalNames).toEqual(expect.arrayContaining(['Headaches', 'Bloating after eating']));
    expect(briefing.cards).toHaveLength(0);
    const html = renderToStaticMarkup(createElement(RootNoticedPanel, { state: { allowed: true, view } }));
    const safetyAt = html.indexOf('A safety response needs attention first');
    expect(safetyAt).toBeGreaterThan(-1);
    expect(safetyAt).toBeLessThan(html.indexOf('Coach briefing'));
  });

  it('no review action can dismiss the safety block, and it draws outside the folded section', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always' }), SEP16, { redFlags: { severe_headaches: true } });
    // A coach cannot act on a safety card, because none is built. Even a
    // review row naming its target changes nothing about the block.
    await recordBriefingReview(db.asClient(), {
      coachId: COACH_ID,
      memberId: MEMBER_ID,
      targetKey: groupKeyFor('headaches', REAL_LIBRARY.names),
      action: 'not_relevant',
      evidenceState: EMPTY_EVIDENCE_STATE,
      actedAt: '2026-09-16T20:00:00.000Z',
    });
    const view = await coachOpens();
    expect(briefingOf(view).safety).not.toBeNull();
    const { RootNoticedSafety } = await import('@/app/coach/clients/[id]/RootBriefing');
    const folded = renderToStaticMarkup(createElement(RootNoticedSafety, { safety: view.briefing!.safety }));
    expect(folded).toContain('A safety response needs attention first');
    // With the page drawing it above, the section does not draw it twice.
    const inside = renderToStaticMarkup(
      createElement(RootNoticedPanel, { state: { allowed: true, view }, safetyShownAbove: true })
    );
    expect(inside).not.toContain('A safety response needs attention first');
    const page = fs.readFileSync(path.resolve(__dirname, '../app/coach/clients/[id]/detail/page.tsx'), 'utf8');
    const safetyAt = page.indexOf('<RootNoticedSafety');
    const sectionAt = page.indexOf('id="detail-section-root-noticed"');
    expect(safetyAt).toBeGreaterThan(-1);
    expect(safetyAt).toBeLessThan(sectionAt);
  });

  it('a withheld complaint finding also reaches the safety block, exactly as the existing override withholds it', async () => {
    await complete('s1', answers({ N4: 'often' }), SEP16, { redFlags: { severe_headaches: true } });
    await ingestComplaint({
      memberId: MEMBER_ID,
      surfaceKey: 'daily_checkin_notes',
      rawText: 'I have had headaches again this week.',
      reportedAt: SEP17,
      authorRole: 'member',
      client: db.asClient(),
      now: SEP17,
    });
    const view = await coachOpens();
    const withheldNames = view.findings.filter((entry) => entry.suppressed).flatMap((entry) => entry.suppressedSignalNames);
    for (const name of withheldNames) expect(briefingOf(view).safety!.signalNames).toContain(name);
    expect(briefingOf(view).cards.some((entry) => entry.anchorSlug === 'headaches')).toBe(false);
  });

  it('a flagged row withholds its card even when other cards are open', async () => {
    await complete('s1', answers({ N4: 'often' }), SEP16);
    const inputs = await inputsFor();
    const headacheRow = inputs.records.find((record) => record.signalSlug === 'headaches' && record.valueKind === 'scale')!;
    const briefing = buildRootBriefing({ ...inputs, flaggedSignals: new Set([headacheRow.id]) });
    expect(briefing.cards.some((entry) => entry.anchorSlug === 'headaches')).toBe(false);
    expect(briefing.safety!.signalNames).toContain('Headaches');
  });
});

// ---------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------

describe('scores', () => {
  it('no card and no rank note carries a score or a percentage, and section results sit in View evidence as context only', async () => {
    await complete('s1', answers({ N4: 'almost_always', N1: 'almost_always', N2: 'almost_always', N3: 'often', D1: 'often' }), SEP16);
    const view = await coachOpens();
    for (const entry of briefingOf(view).cards) {
      const surface = [entry.headline, entry.whyReviewTogether ?? '', entry.reportedSummary, entry.sharedSource ?? '', ...entry.exploreNext, entry.rankReason, ...entry.reported.map((line) => `${line.valueLabel} ${line.reportedLine} ${line.change.line}`), ...entry.related.map((line) => `${line.valueLabel} ${line.reportedLine}`)].join(' ');
      expect(surface).not.toMatch(/%|percent|\bscore|\bpoints?\b/i);
      // The only number in a rank note is a count of her own signals.
      expect(entry.rankReason.replace(/\d+ supporting signals?/, '').replace(/from \d+ sources/, '')).not.toMatch(/\d/);
    }
    const headaches = card(briefingOf(view), 'headaches');
    expect(headaches.evidence.assessmentContext.length).toBeGreaterThan(0);
    const context = headaches.evidence.assessmentContext[0]!;
    expect(context.sectionName).toBe(SURVEY_CONTENT.sections.find((section) => section.sectionKey === 'brain')!.displayName);
    expect(JSON.stringify(headaches.evidence.assessmentContext)).not.toMatch(/%|percent/i);
    // Still never a related finding.
    const bandSlugs = new Set(db.rows('cross_system_signals').filter((row) => row.value_kind === 'band').map((row) => row.signal_slug));
    for (const line of headaches.evidence.allRelated) expect(bandSlugs.has(line.signalSlug)).toBe(false);
  });
});

describe('every generated line passes the cautious language check', () => {
  const directions = [...new Set(Object.values(DIRECTION_BY_SIGNAL))];

  it('every headline for every shipped canonical signal, with every direction', () => {
    const offenders: string[] = [];
    for (const name of REAL_NAMES) {
      const lines = [
        briefingHeadline(name.displayName, []),
        ...directions.map((direction) => briefingHeadline(name.displayName, [direction])),
        briefingHeadline(name.displayName, directions.slice(0, 2)),
        whyReviewTogetherLine({ anchorName: name.displayName, relatedCount: 1, groupedCount: 0 })!,
        whyReviewTogetherLine({ anchorName: name.displayName, relatedCount: 0, groupedCount: 1 })!,
        explorePairQuestion(name.displayName.toLowerCase(), 'headaches'),
        exploreChangeQuestion('Often', 'Sometimes', name.displayName.toLowerCase()),
      ];
      for (const line of lines) {
        if (findBannedLanguage(line).length > 0 || line.includes('—')) offenders.push(line);
      }
    }
    expect(offenders, offenders.join('\n')).toHaveLength(0);
    for (const question of Object.values(PAIR_QUESTIONS)) expect(findBannedLanguage(question)).toHaveLength(0);
  });

  it('a line built from stored words that fails the check is replaced, and a direction never names a cause', () => {
    const bad = briefingHeadline('Pain that the diet causes', ['night waking']);
    expect(cautious(bad, BRIEFING_HEADLINE_FALLBACK)).toBe(BRIEFING_HEADLINE_FALLBACK);
    expect(cautious('Headaches — sleep', BRIEFING_HEADLINE_FALLBACK)).toBe(BRIEFING_HEADLINE_FALLBACK);
    expect(cautious('Headaches: explore meal timing', BRIEFING_HEADLINE_FALLBACK)).toBe('Headaches: explore meal timing');
    for (const direction of directions) expect(direction).not.toMatch(/cause|because|due to|from/i);
  });

  it('the built briefing uses only the symptom, or the symptom and an exploration direction, in its headlines', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always', N5: 'often', K7: 'often', HB7: 'often', B5: 'often' }), SEP16);
    for (const entry of briefingOf(await coachOpens()).cards) {
      expect(entry.headline === entry.anchorName || entry.headline.startsWith(`${entry.anchorName}: explore `)).toBe(true);
      expect(findBannedLanguage(entry.headline)).toHaveLength(0);
      expect(findBannedLanguage(entry.whyReviewTogether ?? '')).toHaveLength(0);
      for (const question of entry.exploreNext) expect(findBannedLanguage(question)).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------
// The compact card
// ---------------------------------------------------------------------

/** Every category name in the shipped library, as whole words ("Kidney/Bladder" is "Kidney" and "Bladder"). */
const CATEGORY_WORDS = [...new Set(
  [...REAL_LIBRARY.categories.values()]
    .flatMap((category) => [category.displayName, ...category.displayName.split('/')])
    .map((word) => word.trim())
    .filter((word) => word.length > 0 && word.toLowerCase() !== 'other')
)];
const MAP_ENTRY_NAMES = [...new Set(REAL_SUMMARIES.map((summary) => summary.current.patternName))];

/** What a headline says beyond her own symptom's name. */
function beyondAnchor(headline: string, anchorName: string): string {
  return headline.startsWith(anchorName) ? headline.slice(anchorName.length) : headline;
}

function namesACategoryOrMapEntry(text: string): string | null {
  for (const word of CATEGORY_WORDS) {
    if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) return word;
  }
  for (const name of MAP_ENTRY_NAMES) if (text.includes(name)) return name;
  if (/\bsignals?\b/i.test(text)) return 'signals';
  if (/association map/i.test(text)) return 'Association Map';
  return null;
}

describe('plain headlines: no map entry name and no category name', () => {
  it('the guard is not vacuous: it catches the wording the last build shipped', () => {
    expect(CATEGORY_WORDS.length).toBeGreaterThan(10);
    expect(MAP_ENTRY_NAMES.length).toBeGreaterThan(10);
    expect(namesACategoryOrMapEntry(': explore clearance signals and stress')).not.toBeNull();
    expect(namesACategoryOrMapEntry(': explore nervous system signals')).not.toBeNull();
    expect(namesACategoryOrMapEntry(': explore Kidney/Bladder')).not.toBeNull();
    expect(namesACategoryOrMapEntry(`: ${MAP_ENTRY_NAMES[0]}`)).not.toBeNull();
  });

  it('every shipped signal, with every direction, the symptom alone, and the language check fallback', () => {
    const offenders: string[] = [];
    for (const name of REAL_NAMES) {
      const headlines = [
        briefingHeadline(name.displayName, []),
        ...directions().map((direction) => briefingHeadline(name.displayName, [direction])),
        briefingHeadline(name.displayName, directions().slice(0, 2)),
      ];
      for (const headline of headlines) {
        const hit = namesACategoryOrMapEntry(beyondAnchor(headline, name.displayName));
        if (hit) offenders.push(`${headline} (${hit})`);
      }
    }
    expect(offenders, offenders.join('\n')).toHaveLength(0);
    // The fallback a failed check leaves behind names nothing either.
    expect(namesACategoryOrMapEntry(BRIEFING_HEADLINE_FALLBACK)).toBeNull();
    expect(cautious(briefingHeadline('Pain the diet causes', []), BRIEFING_HEADLINE_FALLBACK)).toBe(BRIEFING_HEADLINE_FALLBACK);
    // With nothing displayed to support a direction, the symptom alone.
    expect(briefingHeadline('Headaches', [])).toBe('Headaches');
  });

  function directions(): string[] {
    return [...new Set(Object.values(DIRECTION_BY_SIGNAL))];
  }

  it('the built cards: headlines and card sentences carry no map or category name; the map entry names stay in View evidence', async () => {
    // Puffiness is filed under Kidney/Bladder and headaches under
    // Neurological, which is what once put "fluid balance" and
    // "nervous system signals" into headlines.
    await complete('s1', answers({ N4: 'often', D1: 'almost_always', N5: 'often', K7: 'often', HB7: 'often', B5: 'often', T2: 'often' }), SEP16);
    const briefing = briefingOf(await coachOpens());
    expect(briefing.cards.length).toBeGreaterThan(3);
    let viaNames = 0;
    for (const entry of briefing.cards) {
      expect(namesACategoryOrMapEntry(beyondAnchor(entry.headline, entry.anchorName)), entry.headline).toBeNull();
      // A sentence may name her own signals ("lighter or broken sleep"), so
      // it is held to the map words only.
      for (const sentence of [entry.whyReviewTogether ?? '', ...entry.exploreNext]) {
        expect(MAP_ENTRY_NAMES.some((name) => sentence.includes(name)), sentence).toBe(false);
        expect(sentence, sentence).not.toMatch(/\bsignals\b|association map/i);
      }
      for (const line of entry.evidence.allRelated) viaNames += line.viaPatternNames.length;
      // A direction only from a signal the card displays.
      const displayed = new Set([...entry.reported.map((line) => line.signalSlug), ...entry.related.map((line) => line.signalSlug)]);
      const supported = [...displayed].map((slug) => DIRECTION_BY_SIGNAL[slug]).filter(Boolean);
      const direction = /: explore (.+)$/.exec(entry.headline)?.[1];
      if (direction) for (const part of direction.split(' and ')) expect(supported).toContain(part);
    }
    expect(viaNames, 'the map entry names are still carried into View evidence').toBeGreaterThan(0);
    // Her grouped "when not eaten" answer and her broken sleep, both on the card.
    expect(card(briefing, 'headaches').headline).toBe('Headaches: explore meal timing and night waking');
  });
});

describe('why review together is about coaching, not software', () => {
  it('pins the neutral fallback', () => {
    expect(WHY_REVIEW_FALLBACK).toBe('These findings are reported together. Explore whether their timing overlaps.');
  });

  it('a card with related findings uses the neutral fallback, never map wording or a mechanism', async () => {
    await complete('s1', answers({ N4: 'often', HB7: 'often' }), SEP16);
    const headaches = card(briefingOf(await coachOpens()), 'headaches');
    expect(headaches.related.length).toBeGreaterThan(0);
    expect(headaches.whyReviewTogether).toBe(WHY_REVIEW_FALLBACK);
    expect(headaches.whyReviewTogether).not.toMatch(/map|links|lists|entry|because|driv|affect/i);
  });

  it('a card that only groups her own answers says so, and a single finding draws no sentence', async () => {
    await complete('s1', answers({ N4: 'often', B5: 'often', K7: 'often' }), SEP16);
    const briefing = briefingOf(await coachOpens());
    const grouped = card(briefing, 'headaches');
    if (grouped.related.length === 0) {
      expect(grouped.whyReviewTogether).toBe('She describes headaches in more than one way, so these answers are read as one.');
    } else {
      expect(grouped.whyReviewTogether).toBe(WHY_REVIEW_FALLBACK);
    }
    expect(whyReviewTogetherLine({ anchorName: 'headaches', relatedCount: 0, groupedCount: 1 })).toBe(
      'She describes headaches in more than one way, so these answers are read as one.'
    );
    expect(whyReviewTogetherLine({ anchorName: 'headaches', relatedCount: 0, groupedCount: 0 })).toBeNull();
    db = new FakeDb();
    await complete('s1', answers({ K7: 'often' }), SEP16);
    const alone = card(briefingOf(await coachOpens()), 'under-eye-puffiness');
    expect(alone.related).toHaveLength(0);
    expect(alone.whyReviewTogether).toBeNull();
  });

  it('the copy file no longer carries the software sentences', () => {
    const copy = fs.readFileSync(path.resolve(__dirname, '../lib/cross-system-root/copy.ts'), 'utf8');
    expect(copy).not.toContain('Your Association Map links');
    expect(copy).not.toContain('lists areas to check beside it');
    expect(copy).not.toContain('DIRECTION_BY_CATEGORY');
  });
});

describe('the shared source, once per card', () => {
  it('names the assessment, its date and its window once, and no line under it repeats them', async () => {
    await complete('s1', answers({ N4: 'often', B5: 'often', HB7: 'often' }), SEP16);
    const view = await coachOpens();
    const headaches = card(briefingOf(view), 'headaches');
    expect(headaches.sharedSource).toBe('Rooted Reset Body Systems Survey, Sep 16 (covers past 3 months)');
    // Every line shares it, so none carries a label.
    for (const line of [...headaches.reported, ...headaches.related]) expect(line.inlineSource).toBeNull();
    expect(headaches.reportedSummary).toBe('Headaches, Often; Headaches when not eaten, Often.');

    const html = renderToStaticMarkup(createElement(RootNoticedPanel, { state: { allowed: true, view } }));
    const cardHtml = html.split('data-briefing-card=').slice(1);
    expect(cardHtml.length).toBeGreaterThan(0);
    for (const chunk of cardHtml) {
      // Drawn once, and the window is said once.
      expect(chunk.match(/data-briefing-source/g) ?? []).toHaveLength(1);
      expect(chunk.split('covers past 3 months').length - 1).toBe(1);
      expect(chunk).not.toContain('Reported Sep 16 (covers past 3 months)');
    }
  });

  it('a finding from a different assessment carries the short inline label, and only that finding', async () => {
    await complete('s1', answers({ N4: 'often', HB7: 'often' }), SEP16);
    const inputs = await inputsFor();
    // Her broken sleep, as a Breathing Check-In answer from Sep 12 instead.
    const records = inputs.records.map((record) =>
      record.signalSlug === 'lighter-or-broken-sleep' && record.valueKind === 'scale'
        ? {
            ...record,
            sourceKey: 'breathing_pattern_check_in',
            sourceLabel: 'Breathing Pattern Check-In',
            sourceSessionId: null,
            sourceQuestionRef: null,
            capturedOn: '2026-09-12',
            capturedAt: '2026-09-12T14:00:00.000Z',
          }
        : record
    );
    const briefing = buildRootBriefing({ ...inputs, records });
    const headaches = briefing.cards.find((entry) => entry.anchorSlug === 'headaches')!;
    expect(headaches.sharedSource).toBe('Rooted Reset Body Systems Survey, Sep 16 (covers past 3 months)');
    const sleep = headaches.related.find((line) => line.signalSlug === 'lighter-or-broken-sleep');
    expect(sleep, 'the sleep finding is still related').toBeDefined();
    expect(sleep!.inlineSource).toBe('(Breathing Check-In, Sep 12)');
    expect(SHORT_SOURCE_LABELS.breathing_pattern_check_in).toBe('Breathing Check-In');
    for (const line of headaches.related.filter((entry) => entry !== sleep)) expect(line.inlineSource).toBeNull();
    // Full source details stay in View evidence.
    const full = headaches.evidence.allRelated.find((line) => line.signalSlug === 'lighter-or-broken-sleep')!;
    expect(full.sourceLabel).toBe('Breathing Pattern Check-In');
    expect(full.reportedLine).toBe('Reported Sep 12');

    const html = renderToStaticMarkup(
      createElement(RootNoticedPanel, {
        state: { allowed: true, view: { ...(await coachOpens()), briefing } },
      })
    );
    expect(html).toContain('(Breathing Check-In, Sep 12)');
  });

  it('a reported answer from a second source is labelled inside the one Reported line', async () => {
    await complete('s1', answers({ N4: 'often' }), SEP16);
    await ingestComplaint({
      memberId: MEMBER_ID,
      surfaceKey: 'daily_checkin_notes',
      rawText: 'I have had headaches again this week.',
      reportedAt: SEP17,
      authorRole: 'member',
      client: db.asClient(),
      now: SEP17,
    });
    const headaches = card(briefingOf(await coachOpens()), 'headaches');
    expect(headaches.reported).toHaveLength(2);
    const [first, second] = headaches.reported;
    expect(first!.inlineSource).toBeNull();
    expect(second!.inlineSource).toMatch(/^\(.+, Sep 1[67]\)$/);
    expect(headaches.reportedSummary).toContain(second!.inlineSource!);
    expect(headaches.reportedSummary.split('covers past 3 months')).toHaveLength(1);
  });
});

describe('the change wording: an answer changed, not a symptom', () => {
  it('reads "Answer changed" with the movement and both dates, and asks which of the two it was', async () => {
    await complete('s1', answers({ N4: 'sometimes', B5: 'sometimes', D1: 'almost_always' }), '2026-09-11T14:00:00.000Z');
    await complete('s2', answers({ N4: 'often', B5: 'often', D1: 'almost_always' }), SEP16);
    const briefing = briefingOf(await coachOpens());
    const headaches = card(briefing, 'headaches');
    expect(headaches.changeMarker).toBe('Answer changed');
    expect(headaches.reportedSummary).toBe(
      'Headaches, Often; Headaches when not eaten, Often. Answer changed: Often (Sep 16) from Sometimes (Sep 11).'
    );
    expect(headaches.exploreNext[0]).toBe(
      'You selected Often this time and Sometimes previously. Does that reflect a change in your symptoms or in how you understood the question?'
    );
    // The second question is only a pinned pair question that adds something.
    expect(headaches.exploreNext).toEqual([headaches.exploreNext[0], PAIR_QUESTIONS['headaches+headaches-when-not-eaten']]);
    const words = JSON.stringify(briefing);
    expect(words).not.toContain('Changed since last time');
    expect(words).not.toContain('What changed for you in between');
    expect(words).not.toMatch(/more often than before/);
    expect(headaches.rankReason).toMatch(/^Answer changed \(a higher frequency selected\)/);
  });

  it('names the symptom when the answers on one card moved differently', async () => {
    await complete('s1', answers({ N4: 'sometimes', B5: 'often' }), '2026-09-11T14:00:00.000Z');
    await complete('s2', answers({ N4: 'often', B5: 'often' }), SEP16);
    const headaches = card(briefingOf(await coachOpens()), 'headaches');
    expect(headaches.reportedSummary).toContain('Answer changed for headaches: Often (Sep 16) from Sometimes (Sep 11).');
    expect(headaches.exploreNext[0]).toBe(
      'For headaches, you selected Often this time and Sometimes previously. Does that reflect a change in your symptoms or in how you understood the question?'
    );
  });

  it('a card with no change carries one question by default', async () => {
    await complete('s1', answers({ N4: 'often', HB7: 'often', K7: 'often', D1: 'often' }), SEP16);
    for (const entry of briefingOf(await coachOpens()).cards) {
      const pinned = Object.values(PAIR_QUESTIONS);
      if (!entry.exploreNext.some((question) => question.startsWith('You selected') || question.startsWith('For '))) {
        expect(entry.exploreNext.length).toBeLessThanOrEqual(1);
      } else if (entry.exploreNext.length === 2) {
        expect(pinned).toContain(entry.exploreNext[1]);
      }
    }
  });

  it('the return marker speaks of her answers, not her symptoms', () => {
    expect(BRIEFING_MARKERS.changedSinceReview).toBe('Answers changed since your review');
    expect(BRIEFING_MARKERS.changedSinceReview).not.toMatch(/symptom/i);
  });
});

describe('counts say what they count, and reconcile', () => {
  it('Root checked N connections, never "to review"', () => {
    expect(rootNoticedDigest({ findings: 17, suppressed: 0, complaints: 0, mapEntries: 40, questionnaireRead: true }).text).toBe(
      'Root checked 17 connections'
    );
    expect(rootNoticedDigest({ findings: 1, suppressed: 0, complaints: 1, mapEntries: 40 }).text).toBe('Root checked 1 connection');
    expect(rootNoticedDigest({ findings: 17, suppressed: 1, complaints: 0, mapEntries: 40 }).text).toBe(
      'Root checked 17 connections, 1 report held back for safety'
    );
    expect(signalsDigest({ signals: 12, entries: 30 }).text).toBe('12 distinct signals, 30 dated entries');
  });

  it('priority findings, the view all remainder and the dismissed count add up to every card, and nothing dismissed waits for review', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always', N5: 'often', K7: 'often', HB7: 'often', T2: 'often' }), SEP16);
    const start = briefingOf(await coachOpens());
    const total = start.cards.length;
    expect(total).toBeGreaterThanOrEqual(6);
    for (const target of start.cards.slice(-2)) {
      await recordBriefingReview(db.asClient(), {
        coachId: COACH_ID,
        memberId: MEMBER_ID,
        targetKey: target.targetKey,
        action: 'reviewed',
        evidenceState: target.evidenceState,
        actedAt: '2026-09-16T20:00:00.000Z',
      });
    }
    const view = await coachOpens();
    const briefing = briefingOf(view);
    expect(briefing.dismissed).toHaveLength(2);
    const html = renderToStaticMarkup(createElement(RootNoticedPanel, { state: { allowed: true, view, clientId: MEMBER_ID } }));
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const priority = Number(/(\d+) priority findings?/.exec(text)?.[1]);
    const more = Number(/View all findings \((\d+) more\)/.exec(text)?.[1] ?? 0);
    const dismissed = Number(/Reviewed or not relevant \((\d+)\)/.exec(text)?.[1]);
    expect(priority).toBe(3);
    expect(html.match(/data-briefing-card=/g)).toHaveLength(priority);
    expect(dismissed).toBe(2);
    expect(priority + more + dismissed).toBe(total);
    expect(text).not.toMatch(/to review|awaiting|waiting for review/i);
  });
});

describe('restore', () => {
  async function record(targetKey: string, action: 'reviewed' | 'not_relevant' | 'discuss_next_session' | 'restored', at: string) {
    const briefing = briefingOf(await coachOpens());
    const target = findBriefingCard(briefing, targetKey) ?? findDismissedBriefingCard(briefing, targetKey);
    expect(target, `a card ${targetKey} to act on`).not.toBeNull();
    await recordBriefingReview(db.asClient(), {
      coachId: COACH_ID,
      memberId: MEMBER_ID,
      targetKey,
      action,
      evidenceState: target!.evidenceState,
      actedAt: at,
    });
  }

  it('returns a card to the briefing where the rules rank it, keeps the review and appends the restore', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always', N5: 'often', K7: 'often' }), SEP16);
    const start = briefingOf(await coachOpens());
    const order = start.cards.map((entry) => entry.targetKey);
    const target = start.cards[0]!;

    await record(target.targetKey, 'not_relevant', '2026-09-16T20:00:00.000Z');
    const folded = briefingOf(await coachOpens());
    expect(folded.cards.some((entry) => entry.targetKey === target.targetKey)).toBe(false);
    expect(findDismissedBriefingCard(folded, target.targetKey)?.targetKey).toBe(target.targetKey);

    await record(target.targetKey, BRIEFING_RESTORE_ACTION, '2026-09-16T21:00:00.000Z');
    const restoredView = await coachOpens();
    const restored = briefingOf(restoredView);
    // Back, in the order the rules give, and out of the fold.
    expect(restored.cards.map((entry) => entry.targetKey)).toEqual(order);
    expect(restored.dismissed).toHaveLength(0);
    const back = restored.cards[0]!;
    expect(back.reviewStatus).toBe('open');
    expect(back.changedSinceReview).toBe(false);
    expect(back.lastAction).toBe('restored');
    // History keeps both, oldest first.
    expect(back.history.map((entry) => entry.action)).toEqual(['not_relevant', 'restored']);
    expect(back.history.map((entry) => entry.label)).toEqual(['Not relevant', 'Restored to the briefing']);
    // Appended: two rows, the first untouched.
    const rows = db.rows('cross_system_root_briefing_reviews');
    expect(rows.map((row) => row.action)).toEqual(['not_relevant', 'restored']);
    expect(rows.every((row) => row.coach_id === COACH_ID && row.member_id === MEMBER_ID && row.target_key === target.targetKey)).toBe(true);
    // The evidence behind it is exactly what it was.
    expect(back.evidence).toEqual(target.evidence);
    expect(back.reported).toEqual(target.reported);
  });

  it('only a dismissed card can be restored, and the server action is held to that lookup', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always' }), SEP16);
    const briefing = briefingOf(await coachOpens());
    expect(findDismissedBriefingCard(briefing, briefing.cards[0]!.targetKey)).toBeNull();
    expect(findDismissedBriefingCard(null, 'group:head:pain')).toBeNull();
    const action = fs.readFileSync(path.resolve(__dirname, '../app/actions/crossSystemRootFindings.ts'), 'utf8');
    const restore = action.slice(action.indexOf('export async function restoreRootBriefingCardAction'));
    expect(restore).toContain('findDismissedBriefingCard(view.briefing, targetKey)');
    expect(restore).toContain('action: BRIEFING_RESTORE_ACTION');
    expect(restore.slice(0, restore.indexOf('\n}\n'))).not.toMatch(/\.delete\(|\.update\(/);
  });

  it('restore is not a review action button, and a restored card can be reviewed again and returns on material change', async () => {
    await complete('s1', answers({ N4: 'often' }), SEP16);
    const headaches = card(briefingOf(await coachOpens()), 'headaches');
    await record(headaches.targetKey, 'reviewed', '2026-09-16T20:00:00.000Z');
    await record(headaches.targetKey, 'restored', '2026-09-16T21:00:00.000Z');
    await record(headaches.targetKey, 'reviewed', '2026-09-16T22:00:00.000Z');
    const again = briefingOf(await coachOpens());
    expect(again.dismissed.map((entry) => entry.targetKey)).toEqual([headaches.targetKey]);
    expect(again.dismissed[0]!.card.history.map((entry) => entry.action)).toEqual(['reviewed', 'restored', 'reviewed']);
    // Material change still returns it, marked, exactly as before.
    await complete('s2', answers({ N4: 'almost_always' }), SEP17);
    const returned = card(briefingOf(await coachOpens()), 'headaches');
    expect(returned.reviewStatus).toBe('open');
    expect(returned.changedSinceReview).toBe(true);
    expect(reviewStatusOf({ action: 'restored', state: EMPTY_EVIDENCE_STATE }, EMPTY_EVIDENCE_STATE)).toEqual({
      status: 'open',
      changedSinceReview: false,
    });
  });

  it('a pinned card is unchanged by restore: the pin stays until Reviewed or Not relevant', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always' }), SEP16);
    const headaches = card(briefingOf(await coachOpens()), 'headaches');
    await record(headaches.targetKey, 'discuss_next_session', '2026-09-16T20:00:00.000Z');
    const pinned = briefingOf(await coachOpens());
    expect(pinned.pinned.map((entry) => entry.targetKey)).toEqual([headaches.targetKey]);
    expect(findDismissedBriefingCard(pinned, headaches.targetKey)).toBeNull();
  });

  it('the dismissed fold offers Restore, and the fold line says how a card comes back', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always' }), SEP16);
    const headaches = card(briefingOf(await coachOpens()), 'headaches');
    await record(headaches.targetKey, 'reviewed', '2026-09-16T20:00:00.000Z');
    const briefing = briefingOf(await coachOpens());
    expect(briefing.dismissed[0]!.line).toBe(
      'Reviewed on Sep 16, 2026. It returns to the briefing if her answers change, or when you restore it.'
    );
    const source = fs.readFileSync(path.resolve(__dirname, '../app/coach/clients/[id]/RootBriefing.tsx'), 'utf8');
    expect(source).toContain('data-briefing-action={BRIEFING_RESTORE_ACTION}');
    expect(source).toContain('restoreRootBriefingCardAction(clientId, card.targetKey)');
  });
});

// ---------------------------------------------------------------------
// Nothing about the member or the engine moved
// ---------------------------------------------------------------------

describe('scope', () => {
  it('no briefing file calls out to a model, reads a clock or writes a Root, map, survey or signal table', () => {
    const ROOT = path.resolve(__dirname, '..');
    for (const file of [
      'lib/cross-system-root/briefing.ts',
      'lib/cross-system-root/briefingRules.ts',
      'lib/cross-system-root/briefingData.ts',
    ]) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(source, file).not.toMatch(/anthropic|openai|fetch\(|new Date\(|Date\.now\(/);
      for (const match of source.matchAll(/\.from\('([a-z_]+)'\)([\s\S]{0,120})/g)) {
        // Its own two review tables are the only thing it may write.
        if (match[1]!.startsWith('cross_system_root_briefing_')) continue;
        expect(match[2], `${file} writes ${match[1]}`).not.toMatch(/^\s*\.(insert|upsert|update|delete)\(/);
      }
    }
  });

  it('no member surface imports the briefing', () => {
    const ROOT = path.resolve(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['coach', 'admin', 'node_modules', 'api', 'actions'].includes(entry.name)) continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          const source = fs.readFileSync(full, 'utf8');
          if (/cross-system-root\/briefing|RootBriefing/.test(source)) offenders.push(path.relative(ROOT, full));
        }
      }
    };
    walk(path.join(ROOT, 'app'));
    walk(path.join(ROOT, 'components'));
    expect(offenders).toEqual([]);
  });

  it('the survey content the briefing reads is the content the survey ships', () => {
    expect(SURVEY_CONTENT.scale.map((option) => option.label)).toEqual(
      expect.arrayContaining(['Never', 'Rarely', 'Sometimes', 'Often', 'Almost always'])
    );
  });
});
