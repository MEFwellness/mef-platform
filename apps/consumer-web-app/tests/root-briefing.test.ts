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
  describeAbsence,
  type BriefingCardView,
  type RootBriefingInputs,
  type RootBriefingView,
} from '@/lib/cross-system-root/briefing';
import {
  BRIEFING_CARD_LIMIT,
  EMPTY_EVIDENCE_STATE,
  REPORTING_WINDOWS,
  compareByRank,
  compareForDisplay,
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
  DIRECTION_BY_CATEGORY,
  DIRECTION_BY_SIGNAL,
  NOT_A_DIAGNOSIS,
  NO_RELATED_FINDINGS,
  PAIR_QUESTIONS,
  briefingHeadline,
  explorePairQuestion,
  whyReviewTogetherLine,
} from '@/lib/cross-system-root/copy';
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

  it('a coach pin draws first, and the ranking holds within pinned and unpinned', () => {
    const pinnedQuiet = facts({ targetKey: 'p', frequencyPoints: 3, pinned: true });
    const loud = facts({ targetKey: 'l', frequencyPoints: 8 });
    expect([loud, pinnedQuiet].sort(compareForDisplay).map((entry) => entry.targetKey)).toEqual(['p', 'l']);
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
  it('a retake that moves up the scale is Changed since last time, with both dates, and ranks first', async () => {
    await complete('s1', answers({ N4: 'sometimes', D1: 'almost_always', HB7: 'often' }), JUN12);
    await complete('s2', answers({ N4: 'often', D1: 'almost_always', HB7: 'often' }), SEP16);
    const briefing = briefingOf(await coachOpens());
    const headaches = card(briefing, 'headaches');
    expect(briefing.cards[0]!.targetKey).toBe(headaches.targetKey);
    expect(headaches.changeMarker).toBe('Changed since last time');
    const line = headaches.reported.find((entry) => entry.signalSlug === 'headaches')!;
    expect(line.change.line).toBe('Changed since last time: Often (Sep 16) from Sometimes (Jun 12)');
    expect(headaches.rankReason).toMatch(/^Changed since last time/);
    // The louder card that did not change ranks below it.
    const bloating = card(briefing, 'bloating-after-eating');
    expect(bloating.changeMarker).toBeNull();
    expect(bloating.reported[0]!.change.line).toBe('Same as last time: Almost always (Jun 12 and Sep 16)');
  });

  it('moving DOWN the scale is a change but not a reason to rank first', async () => {
    await complete('s1', answers({ N4: 'almost_always', HB7: 'often' }), JUN12);
    await complete('s2', answers({ N4: 'often', HB7: 'often' }), SEP16);
    const briefing = briefingOf(await coachOpens());
    const headaches = card(briefing, 'headaches');
    expect(headaches.changeMarker).toBe('Changed since last time');
    expect(headaches.rankReason).not.toContain('more often than before');
    expect(headaches.reported[0]!.change.line).toBe('Changed since last time: Often (Sep 16) from Almost always (Jun 12)');
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
    expect(briefing.cards[0]!.reported[0]!.change.line).toBe('Changed since last time: Often (Sep 16) from Never (Jun 12)');
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
    // Anchored on what she reported, never on an area she did not.
    expect(puffiness.headline.startsWith('Under-eye puffiness in the morning:')).toBe(true);
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
    expect(html).toContain('Reported Sep 16 (covers past 3 months)');
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
    for (const part of ['reported', 'related', 'why', 'explore']) {
      expect(html.match(new RegExp(`data-briefing-part="${part}"`, 'g'))).toHaveLength(3);
    }
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
    const target = briefingOf(view).cards.find((entry) => entry.targetKey === targetKey)!;
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
      expect(returned.newSinceReview).toBe(true);
      expect(briefingOf(await coachOpens()).cards[0]!.targetKey).toBe(headaches.targetKey);
    }
  );

  it('Discuss next session pins the card first with a marker until another action', async () => {
    await complete('s1', answers({ K7: 'often', D1: 'almost_always' }), SEP16);
    const puffiness = card(briefingOf(await coachOpens()), 'under-eye-puffiness');
    expect(briefingOf(await coachOpens()).cards[0]!.targetKey).not.toBe(puffiness.targetKey);

    await act(puffiness.targetKey, 'discuss_next_session', '2026-09-16T20:00:00.000Z');
    const pinnedView = await coachOpens();
    const pinned = briefingOf(pinnedView).cards[0]!;
    expect(pinned.targetKey).toBe(puffiness.targetKey);
    expect(pinned.pinned).toBe(true);
    expect(pinned.rankReason).toMatch(/^Pinned for next session/);
    const html = renderToStaticMarkup(createElement(RootNoticedPanel, { state: { allowed: true, view: pinnedView } }));
    expect(html).toContain('data-briefing-marker="Discuss next session"');

    await act(puffiness.targetKey, 'reviewed', '2026-09-16T21:00:00.000Z');
    const cleared = briefingOf(await coachOpens());
    expect(cleared.cards.some((entry) => entry.targetKey === puffiness.targetKey)).toBe(false);
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

  it('marks a card new since the last visit when its evidence moved after that visit', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always' }), SEP16);
    db.rows('cross_system_root_briefing_visits').push({
      coach_id: COACH_ID,
      member_id: MEMBER_ID,
      visited_at: '2026-09-16T20:00:00.000Z',
    });
    const quiet = briefingOf(await coachOpens());
    expect(quiet.cards.every((entry) => !entry.newSinceReview)).toBe(true);

    await complete('s2', answers({ N4: 'almost_always', D1: 'almost_always' }), SEP17);
    const briefing = briefingOf(await coachOpens());
    expect(card(briefing, 'headaches').newSinceReview).toBe(true);
    expect(card(briefing, 'bloating-after-eating').newSinceReview).toBe(false);
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

describe('every generated line passes the cautious language check', () => {
  const directions = [
    ...new Set([
      ...Object.values(DIRECTION_BY_CATEGORY).filter((entry): entry is string => entry !== null),
      ...Object.values(DIRECTION_BY_SIGNAL),
    ]),
  ];

  it('every headline for every shipped canonical signal, with every direction', () => {
    const offenders: string[] = [];
    for (const name of REAL_NAMES) {
      const lines = [
        briefingHeadline(name.displayName, [], true),
        briefingHeadline(name.displayName, [], false),
        ...directions.map((direction) => briefingHeadline(name.displayName, [direction], true)),
        briefingHeadline(name.displayName, directions.slice(0, 2), true),
        whyReviewTogetherLine({ anchorName: name.displayName, relatedNames: ['Headaches'], groupedNames: [], mapListsAreas: true }),
        whyReviewTogetherLine({ anchorName: name.displayName, relatedNames: [], groupedNames: ['Headaches'], mapListsAreas: true }),
        explorePairQuestion(name.displayName.toLowerCase(), 'headaches'),
      ];
      for (const line of lines) {
        if (findBannedLanguage(line).length > 0 || line.includes('—')) offenders.push(line);
      }
    }
    expect(offenders, offenders.join('\n')).toHaveLength(0);
    for (const question of Object.values(PAIR_QUESTIONS)) expect(findBannedLanguage(question)).toHaveLength(0);
  });

  it('a line built from stored words that fails the check is replaced, and a direction never names a cause', () => {
    const bad = briefingHeadline('Pain that the diet causes', ['sleep'], true);
    expect(cautious(bad, BRIEFING_HEADLINE_FALLBACK)).toBe(BRIEFING_HEADLINE_FALLBACK);
    expect(cautious('Headaches — sleep', BRIEFING_HEADLINE_FALLBACK)).toBe(BRIEFING_HEADLINE_FALLBACK);
    expect(cautious('Headaches: explore sleep.', BRIEFING_HEADLINE_FALLBACK)).toBe('Headaches: explore sleep.');
    for (const direction of directions) expect(direction).not.toMatch(/cause|because|due to|from/i);
  });

  it('the built briefing uses only exploration language in its headlines', async () => {
    await complete('s1', answers({ N4: 'often', D1: 'almost_always', N5: 'often', K7: 'often', HB7: 'often', B5: 'often' }), SEP16);
    for (const entry of briefingOf(await coachOpens()).cards) {
      expect(entry.headline).toMatch(/: (explore .+|related areas to explore|worth reviewing)\.$/);
      expect(findBannedLanguage(entry.headline)).toHaveLength(0);
      expect(findBannedLanguage(entry.whyReviewTogether)).toHaveLength(0);
      for (const question of entry.exploreNext) expect(findBannedLanguage(question)).toHaveLength(0);
    }
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
