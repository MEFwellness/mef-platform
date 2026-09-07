/**
 * The client detail page, described once as a table of contents.
 *
 * WHY THIS EXISTS. That page had grown to roughly two minutes of
 * continuous scrolling: every panel the coach's member view has ever
 * produced, in one flat column, all at the same visual weight. This build
 * folds them into titled sections that open on a tap. Nothing was deleted
 * and nothing was rewritten, so the only new thing the page needed was a
 * NAME for each group and for each card inside it.
 *
 * It is a plain module rather than a constant inside the page for three
 * reasons, all of them things that would otherwise drift apart:
 *
 *   the pinned search matches against these titles, and the search is a
 *     client component while the page is a server component, so the list
 *     has to live somewhere both can import;
 *   the anchor a search result scrolls to and the anchor the card renders
 *     are the same string, taken from here, so a result can never point at
 *     an id nothing renders;
 *   a guard test walks this list against the page source, so a card added
 *     to the page and forgotten here fails the suite rather than quietly
 *     becoming unfindable.
 *
 * NOTHING HERE IS DATA. No count, no status, no member content. It is the
 * shape of the page, which is identical for every client.
 */

import { textMatchesSearch } from '../assignments/assignableCatalog';

/** One card inside a section, as the search knows it. `id` is its real DOM anchor. */
export type DetailCardEntry = {
  id: string;
  title: string;
};

/** One collapsible group. `id` is the section's own DOM anchor. */
export type DetailSectionEntry = {
  id: string;
  title: string;
  cards: DetailCardEntry[];
};

/**
 * THE SIX SECTIONS, and every card filed under one of them.
 *
 * The order inside each section is the order the page renders them, and
 * the order of the sections is the order a coach reads them: what the app
 * concluded, what it asked her, what has happened over time, what she
 * wrote, what the coach does, and finally the switches.
 *
 * Two placements are worth saying out loud, because a reader would
 * otherwise assume they were accidents:
 *
 *   the reassessment request lives inside Longitudinal Intelligence, which
 *     is an Intelligence card, so it is filed there rather than under
 *     Assessments. A panel is never split across two sections: a card is
 *     one component and it renders in one place.
 *   the Daily Wellness Index sits with the two controls that change what
 *     the member's own screens show, because all three answer "what is
 *     switched on for her", not "what happened to her".
 */
export const DETAIL_SECTIONS: DetailSectionEntry[] = [
  {
    id: 'detail-section-intelligence',
    title: 'Intelligence and Signals',
    cards: [
      { id: 'detail-card-coaching-insights', title: 'Coaching Insights' },
      { id: 'detail-card-coaching-brain', title: 'Coaching Brain' },
      { id: 'detail-card-root-flagged', title: 'Root Has Flagged' },
      { id: 'detail-card-wellness-intelligence', title: 'Personal Wellness Intelligence' },
      { id: 'detail-card-intelligence-engine', title: 'MEF Intelligence Engine' },
      { id: 'detail-card-root-cause-signals', title: 'Root Cause Signals' },
      { id: 'detail-card-root-map', title: 'Root Map' },
      { id: 'detail-card-recommendations', title: 'Recommendations and Experiments' },
      { id: 'detail-card-longitudinal', title: 'Longitudinal Intelligence and Reassessment Request' },
    ],
  },
  {
    id: 'detail-section-assessments',
    title: 'Assessments and Findings',
    cards: [
      { id: 'detail-card-intelligence-core', title: 'Wellness Identity and Profile' },
      { id: 'detail-card-body-assessment', title: 'Body Assessment Findings' },
      { id: 'detail-card-wbsa', title: 'Whole-Body Systems Assessment' },
      { id: 'detail-card-core-values', title: 'Core Values Snapshot' },
      { id: 'detail-card-life-signal', title: 'Life Signal Check' },
      { id: 'detail-card-readiness-pulse', title: 'Readiness Pulse' },
      { id: 'detail-card-stress-load', title: 'Stress and Load Deep-Dive' },
      { id: 'detail-card-owning-your-value', title: 'Owning Your Value' },
      { id: 'detail-card-where-your-joy-lives', title: 'Where Your Joy Lives' },
      { id: 'detail-card-the-giving-ledger', title: 'The Giving Ledger' },
      { id: 'detail-card-the-weight-of-yes', title: 'The Weight of Yes' },
      { id: 'detail-card-assign-assessment', title: 'Assign an Assessment' },
    ],
  },
  {
    id: 'detail-section-progress',
    title: 'Progress and History',
    cards: [
      { id: 'detail-card-today-numbers', title: "Today's Numbers" },
      { id: 'detail-card-energy-trend', title: 'Energy Trend' },
      { id: 'case-view', title: 'Your Progress and Still Building Your Case' },
      { id: 'detail-card-reset-plan', title: 'Personal Reset Plan' },
      { id: 'detail-card-habits', title: 'Habit Completion Today' },
      { id: 'detail-card-baseline', title: 'Baseline Assessment' },
      { id: 'detail-card-progress-comparison', title: 'Progress and Reassessments' },
      { id: 'detail-card-checkin-history', title: 'Check-in History' },
    ],
  },
  {
    id: 'detail-section-weekly-reflection',
    title: 'Weekly Reflection',
    cards: [{ id: 'detail-card-weekly-reflection', title: 'Weekly Reflection' }],
  },
  {
    id: 'detail-section-coach-tools',
    title: 'Coach Tools',
    cards: [
      { id: 'detail-card-coach-workspace', title: 'Coach Workspace' },
      { id: 'detail-card-conversation', title: 'Coaching Conversation' },
      { id: 'detail-card-movement-profile', title: 'Movement Profile and Attention Gaps' },
      { id: 'detail-card-programs', title: 'Assigned Programs' },
      { id: 'detail-card-narrative', title: 'Member Narrative' },
      { id: 'detail-card-feed', title: 'Daily Coaching Feed' },
      { id: 'detail-card-coach-notes', title: 'Coach Notes' },
    ],
  },
  {
    id: 'detail-section-app-controls',
    title: 'App Controls',
    cards: [
      { id: 'detail-card-wellness-index', title: 'Daily Wellness Index' },
      { id: 'detail-card-hydration', title: 'Water Tracking' },
      { id: 'member-visibility', title: 'What Her App Contains' },
    ],
  },
];

/** Every section id, in page order. */
export const DETAIL_SECTION_IDS = DETAIL_SECTIONS.map((section) => section.id);

/**
 * Which section holds a given anchor, section anchors included.
 *
 * This is what keeps the two existing deep links into this page working
 * now that their targets start folded away: `#member-visibility` from the
 * coach brief and `#case-view` from the entries page both land on an
 * anchor that is inside a collapsed section, and a browser cannot scroll
 * to something that is not rendered. The page opens the owning section
 * first and then scrolls, and this is how it knows which one to open.
 */
export function sectionIdForAnchor(anchorId: string): string | null {
  for (const section of DETAIL_SECTIONS) {
    if (section.id === anchorId) return section.id;
    if (section.cards.some((card) => card.id === anchorId)) return section.id;
  }
  return null;
}

/** One row of the pinned search's "On this page" group. */
export type DetailPageSearchResult = {
  /** The section to open. */
  sectionId: string;
  /** What to scroll to once it is open. The section's own anchor for a section hit, the card's for a card hit. */
  anchorId: string;
  /** What the row prints. */
  label: string;
  /** The section it belongs to, printed under the label when the hit was a card. */
  sectionTitle: string;
  kind: 'section' | 'card';
};

/**
 * Sections and cards whose titles answer what the coach typed.
 *
 * Same matching as the Assign panel's own field, because it is literally
 * that field's function (textMatchesSearch). A section that matches is
 * offered once as a section, and its cards are still offered separately
 * when they match on their own, so typing "check-in" finds the card and
 * typing "progress" finds the section that holds it.
 *
 * An empty query returns nothing rather than everything: this dropdown
 * only exists while a coach is typing, and a list of every card on the
 * page is the page itself.
 */
export function searchDetailPage(query: string): DetailPageSearchResult[] {
  if (query.trim().length === 0) return [];
  const results: DetailPageSearchResult[] = [];
  for (const section of DETAIL_SECTIONS) {
    if (textMatchesSearch(section.title, query)) {
      results.push({
        sectionId: section.id,
        anchorId: section.id,
        label: section.title,
        sectionTitle: section.title,
        kind: 'section',
      });
    }
    for (const card of section.cards) {
      if (!textMatchesSearch(card.title, query)) continue;
      results.push({
        sectionId: section.id,
        anchorId: card.id,
        label: card.title,
        sectionTitle: section.title,
        kind: 'card',
      });
    }
  }
  return results;
}

/** The section holding Assign an Assessment, named once so the search and the page agree. */
export const ASSIGN_SECTION_ID = 'detail-section-assessments';
/** The Assign an Assessment card's own anchor, named once for the same reason. */
export const ASSIGN_CARD_ID = 'detail-card-assign-assessment';
