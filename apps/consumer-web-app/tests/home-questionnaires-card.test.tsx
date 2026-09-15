/**
 * THE QUESTIONNAIRES CARD: where it sits, what it counts, and what its
 * quiet line is allowed to name.
 *
 * Presentation and placement pass, 2026-09-14. Three decisions here are
 * each one accidental edit away from being undone on a 1,900 line page:
 *
 *   1. It sits directly under Your Week with Root, and it is NOT also in
 *      the Your Path zone at the bottom. Two copies of one card on one
 *      screen is worse than the flat row this replaced.
 *   2. Its two numbers are the catalog's own `completedCount` and
 *      `totalCount`, handed straight through. The moment anything on Home
 *      does arithmetic on them, Home and the Questionnaires screen can
 *      print two different answers to one question.
 *   3. Its quiet line never names a questionnaire that Assigned to You is
 *      already drawing a full deep-green card for, and it opens whatever
 *      door the catalog page's own card for that item opens.
 *
 * The placement half is a source scan, deliberately, exactly as
 * home-program-hero-placement.test.tsx is: what is asserted is the ORDER
 * of blocks inside one server component's return, and rendering a
 * component that awaits twenty things would prove less than reading it.
 * The selector and the card itself are exercised for real.
 */

// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuestionnairesHomeCard } from '../components/questionnaires/QuestionnairesHomeCard';
import { pickHomeNextQuestionnaire } from '../lib/questionnaires/homeNextQuestionnaire';
import { catalogCardPrimaryAction } from '../lib/questionnaires/catalogCardAction';
import type { CatalogCard, QuestionnaireCatalog } from '../app/actions/questionnaireCatalog';

const PAGE = readFileSync(path.resolve(__dirname, '../app/dashboard/page.tsx'), 'utf8');
const CARD = readFileSync(
  path.resolve(__dirname, '../components/questionnaires/QuestionnairesHomeCard.tsx'),
  'utf8',
);

/** The body of `DayFrameRegion`'s own return: the only place its blocks' order is decided. */
function dayFrameBody(): string {
  const start = PAGE.indexOf('async function DayFrameRegion()');
  expect(start).toBeGreaterThan(-1);
  return PAGE.slice(start, PAGE.indexOf('\n}\n', PAGE.indexOf('return (', start)));
}

function yourPathBody(): string {
  const start = PAGE.indexOf('async function YourPathZone()');
  expect(start).toBeGreaterThan(-1);
  return PAGE.slice(start, PAGE.indexOf('\n}\n', PAGE.indexOf('return (', start)));
}

function card(over: Partial<CatalogCard> & Pick<CatalogCard, 'key'>): CatalogCard {
  return {
    title: `Title ${over.key}`,
    description: '',
    estimatedMinutes: 5,
    category: 'wellness',
    section: 'available',
    draftProgress: null,
    latestCompletedAt: null,
    primaryHref: `/questionnaires/${over.key}`,
    resultHref: null,
    coachAssignmentReason: null,
    assignmentId: null,
    ...over,
    flags: {
      locked: false,
      lockMessage: null,
      lockReasonKind: null,
      lockRequiredLevel: null,
      lockNote: null,
      comingSoon: false,
      inProgress: false,
      retakeInProgress: false,
      reassessmentDueAt: null,
      scheduledAt: null,
      retakeAvailable: false,
      ...(over.flags ?? {}),
    },
  } as CatalogCard;
}

function catalog(over: Partial<QuestionnaireCatalog> = {}): QuestionnaireCatalog {
  return {
    assigned: [],
    completed: [],
    premium: [],
    available: [],
    totalCount: 13,
    completedCount: 8,
    ...over,
  };
}

describe('where the Questionnaires card sits', () => {
  it('renders directly under Your Week with Root', () => {
    const body = dayFrameBody();
    const weekly = body.indexOf('<WeeklyReviewEntry');
    const questionnaires = body.indexOf('<QuestionnairesHomeCard');
    expect(weekly, 'the weekly panel is not rendered at all').toBeGreaterThan(-1);
    expect(questionnaires, 'the questionnaires card is not rendered at all').toBeGreaterThan(-1);
    expect(weekly).toBeLessThan(questionnaires);

    // Nothing between them: the very next JSX block after the weekly
    // panel closes is this card's own gate.
    const between = body.slice(weekly, questionnaires);
    expect(between).not.toContain('<FreeArcInviteCards');
    expect(between).not.toContain('<TodayZone');
    expect(between).not.toContain('<AssignedInviteCards');
  });

  it('stays above everything that used to follow the weekly panel', () => {
    const body = dayFrameBody();
    const questionnaires = body.indexOf('<QuestionnairesHomeCard');
    expect(questionnaires).toBeLessThan(body.indexOf('<FreeArcInviteCards'));
    expect(questionnaires).toBeLessThan(body.indexOf('<TodayZone />'));
  });

  it('leaves the sections above it exactly where they were', () => {
    const body = dayFrameBody();
    const order = [
      '<NewlyRevealedNotice',
      '{assignedToHer && (',
      '{hasRealHistory && programHero &&',
      '<WeeklyReviewEntry',
      '<QuestionnairesHomeCard',
      '<FreeArcInviteCards',
      '<TodayZone />',
    ].map((marker) => {
      const at = body.indexOf(marker);
      expect(at, `${marker} is missing`).toBeGreaterThan(-1);
      return at;
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('appears exactly once on the page, and not in the Your Path zone', () => {
    expect(PAGE.match(/<QuestionnairesHomeCard/g)).toHaveLength(1);
    expect(yourPathBody()).not.toContain('QuestionnairesHomeCard');
  });

  it('keeps the visibility key it has always been gated on', () => {
    expect(dayFrameBody()).toContain('{shows(F.homeQuestionnairesCard) && (');
  });

  it('reads the catalog the day frame already awaits, rather than asking again', () => {
    // One call site for the memoized catalog in the whole page now: the
    // day frame's own Promise.all. The Your Path zone used to make a
    // second one for the card that has moved.
    expect(PAGE.match(/homeQuestionnaireCatalog\(\)/g)).toHaveLength(1);
  });
});

describe('the numbers on the card', () => {
  it('are handed through from the catalog with no arithmetic on Home', () => {
    expect(dayFrameBody()).toContain('completedCount={catalog.completedCount}');
    expect(dayFrameBody()).toContain('totalCount={catalog.totalCount}');
  });

  it('are printed in the same sentence the Questionnaires screen prints', () => {
    const destination = readFileSync(
      path.resolve(__dirname, '../app/questionnaires/page.tsx'),
      'utf8',
    );
    expect(destination).toContain('{catalog.completedCount} of {catalog.totalCount} complete');

    const html = renderToStaticMarkup(
      <QuestionnairesHomeCard completedCount={8} totalCount={13} />,
    );
    expect(html.replace(/<!-- -->/g, '')).toContain('8 of 13 complete');
  });

  it('draws nothing at all when there is no catalog to count', () => {
    expect(renderToStaticMarkup(<QuestionnairesHomeCard completedCount={0} totalCount={0} />)).toBe(
      '',
    );
  });

  it('stops inviting her to continue once there is nothing left to continue', () => {
    const html = renderToStaticMarkup(
      <QuestionnairesHomeCard completedCount={13} totalCount={13} />,
    );
    expect(html).not.toContain('Continue your assessments');
    expect(html).toContain('Your assessments are complete');
    expect(html.replace(/<!-- -->/g, '')).toContain('13 of 13 complete');
  });
});

describe('the card itself', () => {
  const html = renderToStaticMarkup(<QuestionnairesHomeCard completedCount={8} totalCount={13} />);

  it('carries the eyebrow, the title, the supporting line and the CTA', () => {
    expect(html).toContain('Questionnaires');
    expect(html).toContain('Continue your assessments');
    expect(html).toContain('Each one you finish deepens what Root understands about you.');
    expect(html).toContain('View questionnaires');
  });

  it('opens the destination it has always opened, and no new one', () => {
    expect(html).toContain('href="/questionnaires"');
    expect(CARD.match(/href=\{'\/questionnaires' as Route\}/g)).toHaveLength(1);
  });

  it('draws the progress as a thin gold line on a soft track, not a dashboard bar', () => {
    expect(html).toContain('h-[3px]');
    expect(html).toContain('bg-[#C4A050]');
    // The width is the real fraction, rounded: 8/13 is 61.5 percent.
    expect(html).toContain('width:62%');
  });

  it('compresses on tap and respects reduced motion, through the shared class', () => {
    expect(CARD).toContain('mef-press');
    const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8');
    const at = css.indexOf('.mef-questionnaires-bar {');
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, at + 900)).toContain('prefers-reduced-motion');
  });

  it('carries no em dash, because a member reads every word of it', () => {
    const copy = CARD.slice(CARD.indexOf('export function QuestionnairesHomeCard'));
    expect(copy).not.toContain('—');
  });
});

describe('the quiet line, and what it is allowed to name', () => {
  it('prefers the questionnaire she has already started', () => {
    const next = pickHomeNextQuestionnaire(
      catalog({
        available: [
          card({ key: 'four-doctors' }),
          card({ key: 'short-haq', flags: { inProgress: true } as CatalogCard['flags'] }),
        ],
      }),
    );
    expect(next?.key).toBe('short-haq');
    expect(next?.inProgress).toBe(true);
  });

  it('falls back to a coach assignment she has not opened', () => {
    const next = pickHomeNextQuestionnaire(
      catalog({
        assigned: [card({ key: 'wbsa', section: 'assigned', assignmentId: 'a1' })],
        available: [card({ key: 'four-doctors' })],
      }),
    );
    expect(next?.key).toBe('wbsa');
    expect(next?.inProgress).toBe(false);
  });

  it('says nothing at all when the only open thing is an untouched free item', () => {
    // An offer nobody is waiting on is what the library screen is for.
    expect(pickHomeNextQuestionnaire(catalog({ available: [card({ key: 'four-doctors' })] }))).toBeNull();
  });

  it('never names what Assigned to You is already drawing a card for', () => {
    const assigned = card({ key: 'wbsa', section: 'assigned', assignmentId: 'a1' });
    const next = pickHomeNextQuestionnaire(
      catalog({ assigned: [assigned] }),
      new Set([assigned.key]),
    );
    expect(next).toBeNull();
  });

  it('refuses a locked card and a coming-soon card', () => {
    expect(
      pickHomeNextQuestionnaire(
        catalog({
          premium: [
            card({
              key: 'short-haq',
              section: 'premium',
              flags: { locked: true, inProgress: true } as CatalogCard['flags'],
            }),
          ],
        }),
      ),
    ).toBeNull();
    expect(
      pickHomeNextQuestionnaire(
        catalog({
          available: [
            card({
              key: 'readiness-to-change',
              section: 'assigned',
              flags: { comingSoon: true } as CatalogCard['flags'],
            }),
          ],
        }),
      ),
    ).toBeNull();
  });

  it('opens the exact door the catalog page opens for the same card', () => {
    const started = card({
      key: 'core-values-snapshot',
      section: 'assigned',
      assignmentId: 'a1',
      primaryHref: '/health-intake',
      resumeHref: '/health-intake',
      flags: { inProgress: true } as CatalogCard['flags'],
    });
    const next = pickHomeNextQuestionnaire(catalog({ assigned: [started] }));
    expect(next?.href).toBe(catalogCardPrimaryAction(started)?.href);
    expect(next?.href).toBe('/health-intake');
  });

  it('is decided in one place, which both screens read', () => {
    const catalogCard = readFileSync(
      path.resolve(__dirname, '../components/questionnaires/CatalogQuestionnaireCard.tsx'),
      'utf8',
    );
    expect(catalogCard).toContain(
      "import { catalogCardPrimaryAction } from '@/lib/questionnaires/catalogCardAction';",
    );
    // The old private copy is gone rather than left beside the shared one.
    expect(catalogCard).not.toContain('function primaryAction(');
  });

  it('renders under the CTA as a line, never as a second button', () => {
    const withNext = renderToStaticMarkup(
      <QuestionnairesHomeCard
        completedCount={8}
        totalCount={13}
        nextItem={{ key: 'k', title: 'Health & Lifestyle Intake', href: '/health-intake', inProgress: true }}
      />,
    );
    expect(withNext).toContain('Pick up where you left off');
    expect(withNext).toContain('Health &amp; Lifestyle Intake');
    expect(withNext).toContain('href="/health-intake"');
    expect(withNext.indexOf('View questionnaires')).toBeLessThan(
      withNext.indexOf('Pick up where you left off'),
    );
    // No filled forest button anywhere on this card: that treatment
    // belongs to the assigned cards and the Priority Card above it.
    expect(withNext).not.toContain('bg-[#1B3A2D] ');
  });
});
