/**
 * THE CLIENT DETAIL PAGE FOLDS UP (2026-09-06).
 *
 * Roughly thirty panels in one flat column had become about two minutes of
 * continuous scrolling. They are now filed into six sections that open on
 * a tap. This is a presentation change and nothing else, so the things
 * worth proving are the things a presentation change can quietly break:
 *
 *   1. NOTHING FELL OUT. Every panel that was on this page before is still
 *      rendered, and is rendered INSIDE a section rather than orphaned
 *      above or below them. A panel outside every section would still be
 *      on the page and would still be two minutes down it.
 *   2. NO SEARCH RESULT POINTS AT NOTHING. Every card id the search index
 *      knows is really rendered as an id on the page, and every rendered
 *      card id is in the index. Either half drifting makes a result land
 *      on nothing, silently, because scrollIntoView on a missing element
 *      is a no-op that reports no error.
 *   3. THE HEADERS READ THE SAME VALUES THE CARDS DO. A digest that
 *      counted its own way would eventually contradict the card under it,
 *      and a header that contradicts its contents is worse than no header.
 *   4. THE TWO DEEP LINKS STILL RESOLVE. `#member-visibility` from the
 *      coach brief and `#case-view` from the entries page now point inside
 *      folded sections, so each has to resolve to a section that can be
 *      opened.
 *   5. A FOLDED SECTION RENDERS ITS HEADER AND NOT ITS CONTENTS, which is
 *      the whole reason the page opens on one screen.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { DetailSection } from '@/app/coach/clients/[id]/detail/DetailSection';
import {
  DETAIL_SECTIONS,
  ASSIGN_CARD_ID,
  ASSIGN_SECTION_ID,
  searchDetailPage,
  sectionIdForAnchor,
} from '@/lib/coach-detail/sections';
import {
  appControlsDigest,
  assessmentsDigest,
  coachToolsDigest,
  intelligenceDigest,
  progressDigest,
  weeklyReflectionDigest,
} from '@/lib/coach-detail/digests';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const PAGE = source('app/coach/clients/[id]/detail/page.tsx');

/**
 * The character ranges the six sections occupy in the page source.
 *
 * Sections are never nested, so a flat scan for the open and close tags is
 * enough, and the count assertion below is what makes that claim testable
 * rather than assumed.
 */
function sectionRanges(): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let cursor = 0;
  for (;;) {
    const start = PAGE.indexOf('<DetailSection', cursor);
    if (start === -1) break;
    const end = PAGE.indexOf('</DetailSection>', start);
    expect(end, 'every opened DetailSection is closed').toBeGreaterThan(start);
    ranges.push({ start, end });
    cursor = end + 1;
  }
  return ranges;
}

const RANGES = sectionRanges();

function insideASection(index: number): boolean {
  return RANGES.some((range) => index > range.start && index < range.end);
}

/** The JSX tag, not the bare word, so `IntelligencePanel` cannot match `MemberIntelligencePanel`. */
function tagIndex(componentName: string): number {
  const match = new RegExp(`<${componentName}[\\s/>]`).exec(PAGE);
  return match ? match.index : -1;
}

describe('nothing fell out, and everything landed inside a section', () => {
  it('opens and closes exactly six sections', () => {
    expect(RANGES).toHaveLength(6);
    expect(DETAIL_SECTIONS).toHaveLength(6);
  });

  /**
   * The list this build inherited from the 2026-08-17 split (see
   * tests/coach-dashboard.test.tsx), plus the five panels that have been
   * added to the page since. Every one of them has to be inside a section
   * now, which is a strictly stronger claim than the old "is on the page".
   */
  const PANELS = [
    'WellnessIndexCard',
    'HydrationTrackingToggle',
    'MemberVisibilityPanel',
    'EnergyTrendChart',
    'BrainPanel',
    'CoachingEscalationsPanel',
    'IntelligencePanel',
    'MemberIntelligencePanel',
    'RootCauseSignalsPanel',
    'RootMapPanel',
    'CaseViewPanel',
    'RecommendationsPanel',
    'LongitudinalIntelligencePanel',
    'CoachWorkspacePanel',
    'IntelligenceCorePanel',
    'ConversationPanel',
    'BodyAssessmentPanel',
    'WbsaPanel',
    'CoreValuesSnapshotPanel',
    'LifeSignalCheckPanel',
    'ReadinessPulsePanel',
    'PersonalResetPlanPanel',
    'WeeklyReflectionPanel',
    'StressLoadPanel',
    'OwningYourValuePanel',
    'WhereYourJoyLivesPanel',
    'MovementProfilePanel',
    'ClientProgramsSummaryCard',
    'AssessmentAssignmentPanel',
    'NarrativePanel',
    'FeedPanel',
    'BaselineAssessmentView',
    'AssessmentComparisonView',
    'AssessmentHistoryList',
    'CheckinHistoryChart',
    'CoachNotesPanel',
  ];

  it.each(PANELS)('%s is still rendered, and is inside a section', (panel) => {
    const index = tagIndex(panel);
    expect(index, `${panel} is no longer rendered by the detail page`).toBeGreaterThan(-1);
    expect(insideASection(index), `${panel} renders outside every section`).toBe(true);
  });

  it('the identity block stays above the sections, ungrouped', () => {
    for (const marker of ['data-member-entries-link="true"', '<TestAccountChip', '<DetailPageSearch']) {
      const index = PAGE.indexOf(marker);
      expect(index, marker).toBeGreaterThan(-1);
      expect(insideASection(index), `${marker} was swallowed by a section`).toBe(false);
    }
  });

  it('the pinned search sits above the first section', () => {
    expect(PAGE.indexOf('<DetailPageSearch')).toBeLessThan(RANGES[0]!.start);
  });
});

describe('no search result points at nothing', () => {
  const indexedCardIds = DETAIL_SECTIONS.flatMap((section) => section.cards.map((card) => card.id));

  it.each(indexedCardIds)('%s is really rendered as an id on the page', (cardId) => {
    expect(PAGE).toContain(`id="${cardId}"`);
  });

  it.each(DETAIL_SECTIONS.map((s) => s.id))('%s is really rendered as a section id', (sectionId) => {
    expect(PAGE).toContain(`id="${sectionId}"`);
  });

  it('every card id rendered on the page is in the index, so nothing is unfindable', () => {
    const rendered = [...PAGE.matchAll(/id="(detail-card-[a-z0-9-]+)"/g)].map((m) => m[1]!);
    expect(rendered.length).toBeGreaterThan(20);
    for (const id of rendered) {
      expect(indexedCardIds, `${id} is rendered but the search has never heard of it`).toContain(id);
    }
  });

  it('card ids are unique across the whole page', () => {
    expect(new Set(indexedCardIds).size).toBe(indexedCardIds.length);
  });
});

describe('the search finds sections and cards, the way the assign field already matched', () => {
  it('a section word finds the section', () => {
    const results = searchDetailPage('progress');
    expect(results.some((r) => r.kind === 'section' && r.sectionId === 'detail-section-progress')).toBe(
      true
    );
  });

  it('a card word finds the card and names the section it is in', () => {
    const results = searchDetailPage('check-in history');
    const hit = results.find((r) => r.anchorId === 'detail-card-checkin-history');
    expect(hit).toBeDefined();
    expect(hit!.sectionId).toBe('detail-section-progress');
    expect(hit!.sectionTitle).toBe('Progress and History');
  });

  it('matching is case insensitive and partial, exactly as the assign field is', () => {
    expect(searchDetailPage('COACH NOT').map((r) => r.anchorId)).toContain('detail-card-coach-notes');
  });

  it('an empty query offers nothing, because a list of every card is the page itself', () => {
    expect(searchDetailPage('')).toEqual([]);
    expect(searchDetailPage('   ')).toEqual([]);
  });

  it('a query nothing answers returns nothing, so the field can say so honestly', () => {
    expect(searchDetailPage('zzzznothinghere')).toEqual([]);
  });

  it('the Assign card the questionnaire results jump to is in the section they open', () => {
    expect(sectionIdForAnchor(ASSIGN_CARD_ID)).toBe(ASSIGN_SECTION_ID);
    expect(PAGE).toContain(`id="${ASSIGN_CARD_ID}"`);
  });
});

describe('the two deep links into this page still resolve', () => {
  it('#member-visibility resolves to App Controls, which is a real section', () => {
    expect(sectionIdForAnchor('member-visibility')).toBe('detail-section-app-controls');
    expect(source('app/coach/clients/[id]/page.tsx')).toContain('/detail#member-visibility');
  });

  it('#case-view resolves to Progress and History', () => {
    expect(sectionIdForAnchor('case-view')).toBe('detail-section-progress');
    expect(source('app/coach/clients/[id]/entries/page.tsx')).toContain('#case-view');
  });

  it('an anchor nobody renders resolves to nothing rather than to a guess', () => {
    expect(sectionIdForAnchor('not-a-real-anchor')).toBeNull();
  });

  it('the page mounts the resolver', () => {
    expect(PAGE).toContain('<DetailDeepLink />');
  });
});

describe('a folded section shows its header and not its contents', () => {
  const html = renderToStaticMarkup(
    <DetailSection
      id="detail-section-progress"
      title="Progress and History"
      digest={{ text: 'Checked in on 5 of the last 7 days', dot: 'gold' }}
    >
      <p>the contents nobody asked for yet</p>
    </DetailSection>
  );

  it('prints the title and the digest line', () => {
    expect(html).toContain('Progress and History');
    expect(html).toContain('Checked in on 5 of the last 7 days');
  });

  it('does not render the children, which is why the page opens on one screen', () => {
    expect(html).not.toContain('the contents nobody asked for yet');
  });

  it('reports itself collapsed to a screen reader', () => {
    expect(html).toContain('aria-expanded="false"');
  });

  it('carries the dot as a labelled image, never as colour alone', () => {
    expect(html).toContain('Something here is worth a look');
  });

  it('gives the header a real tap target on a phone', () => {
    expect(html).toContain('min-h-[72px]');
  });
});

describe('the digests count the same things the cards under them count', () => {
  it('the header reads the open alerts array the alerts card is handed', () => {
    expect(PAGE).toContain('openAlerts: coachAlerts.length');
  });

  it('the header reads the escalation array the Root Has Flagged card is handed', () => {
    expect(PAGE).toContain('escalations: coachingEscalations.length');
  });

  it("the movement review count uses the panel's own pending filter, not a second one", () => {
    const panel = source('app/coach/clients/[id]/MovementProfilePanel.tsx');
    expect(panel).toContain("reviewItems.filter((i) => i.status === 'pending')");
    expect(PAGE).toContain("movementProfileReviewItems.filter((i) => i.status === 'pending')");
  });

  it('the overdue count is the same test that draws the Overdue chip', () => {
    const panel = source('app/coach/clients/[id]/AssessmentAssignmentPanel.tsx');
    expect(panel).toContain('assignment.progress.due.isOverdue');
    expect(PAGE).toContain("a.status === 'pending' && a.progress.due.isOverdue");
  });

  it('today being missing is read from the same list that prints the chips beside her name', () => {
    expect(PAGE).toContain('summary.attentionReasons.includes(NO_CHECKIN_TODAY_REASON)');
    expect(PAGE).toContain('summary.attentionReasons.map((reason)');
  });

  it('every window a digest counts over is named in the line it prints', () => {
    const digest = progressDigest({
      loggedDays: 5,
      windowDays: 7,
      totalCheckins: 12,
      flaggedNoCheckinToday: false,
    });
    expect(digest.text).toBe('Checked in on 5 of the last 7 days');
  });
});

describe('the dot is gold only when something is asking for something', () => {
  it('gold for an open alert, even with nothing else surfaced', () => {
    expect(
      intelligenceDigest({
        findings: 0,
        correlations: 0,
        openAlerts: 1,
        escalations: 0,
        suggestedReassessments: 0,
      }).dot
    ).toBe('gold');
  });

  it('gold for an unanswered reassessment suggestion, and the line says so', () => {
    const digest = intelligenceDigest({
      findings: 2,
      correlations: 0,
      openAlerts: 0,
      escalations: 0,
      suggestedReassessments: 1,
    });
    expect(digest.dot).toBe('gold');
    expect(digest.text).toBe('2 findings, 1 reassessment suggested');
  });

  /**
   * Watched live on 2026-09-06: this header showed a gold dot over the
   * words "Nothing surfaced yet", because a suggested reassessment was the
   * only thing flagged and the line did not name it. A header arguing with
   * its own dot is worse than no header.
   */
  it('never shows gold over the words that say there is nothing', () => {
    const digest = intelligenceDigest({
      findings: 0,
      correlations: 0,
      openAlerts: 0,
      escalations: 0,
      suggestedReassessments: 1,
    });
    expect(digest.dot).toBe('gold');
    expect(digest.text).not.toBe('Nothing surfaced yet');
    expect(digest.text).toBe('1 reassessment suggested');
  });

  it('green when there is real content and nothing is flagged', () => {
    const digest = intelligenceDigest({
      findings: 3,
      correlations: 2,
      openAlerts: 0,
      escalations: 0,
      suggestedReassessments: 0,
    });
    expect(digest.dot).toBe('green');
    expect(digest.text).toBe('3 findings, 2 correlations');
  });

  it('grey when the section is empty', () => {
    const digest = intelligenceDigest({
      findings: 0,
      correlations: 0,
      openAlerts: 0,
      escalations: 0,
      suggestedReassessments: 0,
    });
    expect(digest.dot).toBe('grey');
    expect(digest.text).toBe('Nothing surfaced yet');
  });

  it('an overdue assignment is gold, a sent one that is not late is green', () => {
    expect(assessmentsDigest({ pending: 1, completed: 0, overdue: 1, sittings: 0 }).dot).toBe('gold');
    expect(assessmentsDigest({ pending: 1, completed: 2, overdue: 0, sittings: 0 }).dot).toBe('green');
    expect(assessmentsDigest({ pending: 1, completed: 2, overdue: 0, sittings: 0 }).text).toBe(
      '1 pending, 2 completed'
    );
    // Live on 2026-09-06 this read "5 sitting on files".
    expect(assessmentsDigest({ pending: 0, completed: 1, overdue: 0, sittings: 5 }).text).toBe(
      '1 completed, 5 sittings on file'
    );
    expect(assessmentsDigest({ pending: 0, completed: 0, overdue: 0, sittings: 1 }).text).toBe(
      '1 sitting on file'
    );
    expect(assessmentsDigest({ pending: 0, completed: 0, overdue: 0, sittings: 0 })).toEqual({
      text: 'Nothing sent yet',
      dot: 'grey',
    });
  });

  it('a client with no check-ins at all reads as empty, not as behind', () => {
    expect(
      progressDigest({
        loggedDays: 0,
        windowDays: 7,
        totalCheckins: 0,
        flaggedNoCheckinToday: true,
      })
    ).toEqual({ text: 'No check-ins recorded yet', dot: 'grey' });
  });

  it('a missing check-in today is gold, a logged one is green', () => {
    const base = { loggedDays: 3, windowDays: 7, totalCheckins: 9 };
    expect(progressDigest({ ...base, flaggedNoCheckinToday: true }).dot).toBe('gold');
    expect(progressDigest({ ...base, flaggedNoCheckinToday: false }).dot).toBe('green');
  });

  it('a reflection waiting on her is gold, a finished one is green', () => {
    expect(weeklyReflectionDigest({ reflections: 2, statusKind: 'delivered' }).dot).toBe('gold');
    expect(weeklyReflectionDigest({ reflections: 2, statusKind: 'not_delivered' }).dot).toBe('gold');
    expect(weeklyReflectionDigest({ reflections: 2, statusKind: 'completed' }).dot).toBe('green');
  });

  it('a week that could not be read is grey, because a failed read is not evidence', () => {
    expect(weeklyReflectionDigest({ reflections: 0, statusKind: 'unreadable' }).dot).toBe('grey');
  });

  it('a pending movement review is gold, and its count is in the line', () => {
    const digest = coachToolsDigest({
      notes: 1,
      feedItems: 0,
      pendingReviewItems: 2,
      pendingHandoffs: 0,
    });
    expect(digest.dot).toBe('gold');
    expect(digest.text).toBe('1 note, feed empty, 2 movement reviews');
  });

  it('a pending conversation handoff is gold too', () => {
    expect(
      coachToolsDigest({ notes: 0, feedItems: 0, pendingReviewItems: 0, pendingHandoffs: 1 }).dot
    ).toBe('gold');
  });

  it('App Controls is always grey, because switches are decisions already made', () => {
    expect(
      appControlsDigest({ waterTracked: true, hiddenFeatures: 3, totalFeatures: 24 })
    ).toEqual({ text: 'Water tracking on, 3 of 24 features hidden', dot: 'grey' });
    expect(
      appControlsDigest({ waterTracked: false, hiddenFeatures: 0, totalFeatures: 24 })
    ).toEqual({ text: 'Water tracking off, all 24 features shown', dot: 'grey' });
  });

  it('never prints a plural for one of something', () => {
    expect(
      intelligenceDigest({
        findings: 1,
        correlations: 1,
        openAlerts: 0,
        escalations: 0,
        suggestedReassessments: 0,
      }).text
    ).toBe('1 finding, 1 correlation');
    expect(
      coachToolsDigest({ notes: 1, feedItems: 1, pendingReviewItems: 0, pendingHandoffs: 0 }).text
    ).toBe('1 note, 1 feed item');
  });
});

describe('this build wrote nothing and queried nothing new', () => {
  it('the page issues no insert, upsert or update while rendering', () => {
    expect(PAGE).not.toMatch(/\.(insert|upsert|update|delete)\(/);
  });

  it('every digest input is a value the page had already fetched', () => {
    // The digest block reads only names bound above it. If a digest ever
    // needed its own read, this is where it would show up as an await.
    const block = PAGE.slice(PAGE.indexOf('const sectionDigests'), PAGE.indexOf('return ('));
    expect(block).not.toContain('await ');
  });
});
