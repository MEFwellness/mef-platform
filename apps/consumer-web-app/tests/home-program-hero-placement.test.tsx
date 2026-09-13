/**
 * Where the program card sits on Home, and what it displaces.
 *
 * The polish pass promoted it out of the "Today" zone and made it a
 * feature card. Three things about that are worth holding still, because
 * each of them is a decision somebody could undo by accident while editing
 * a 1,600 line page:
 *
 *   1. It is above the invite cards, which use the same deep green
 *      treatment and would otherwise sit on top of it.
 *   2. It is not ALSO in the Today zone. Two copies of her program on one
 *      screen is worse than the flat card this replaced.
 *   3. Promoting it changed where it sits, not who sees it. It is gated on
 *      the same fact the welcome-card branch is, so a member with no
 *      check-in history sees exactly what she saw before.
 *
 * Plus the rule that makes it a feature at all: when a program exists, the
 * Movement Assessment panel gives up the deep green treatment, because two
 * of them on one screen is two heroes and therefore none.
 *
 * WHAT THE EDITORIAL PASS (2026-09-13) CHANGED, AND WHY THE ASSERTION HAD
 * TO CHANGE WITH IT. This file used to assert "it leads", by reading the
 * program block's index in the source against `F.homeQuickActionCase` and
 * `TODAY_CARD_NODES`. Quick Actions is now its own streamed region ABOVE
 * the program in the rendered page, and its function happens to be
 * DEFINED further down the same file, so that comparison keeps passing
 * while checking the opposite of the truth. A source-index comparison is
 * only a statement about order when both things are in the same block of
 * JSX, so what is asserted below is exactly that: the order of the four
 * blocks inside the day frame's own return, and the order of the regions
 * inside <main>. That is where the real ordering lives.
 *
 * A source scan, deliberately. What is being asserted is the ORDER and the
 * GATING of blocks on a server component that fetches a dozen things, and
 * rendering it in a test would prove less than reading it does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MovementAssessmentCard } from '../components/MovementAssessmentCard';

const PAGE = readFileSync(path.resolve(__dirname, '../app/dashboard/page.tsx'), 'utf8');

/** The deep green shell both the hero and the image-backed assessment panel use. */
const DEEP_GREEN = 'from-[#0F241C]';

/** The body of `DashboardPage` itself: the only place region order is decided. */
function shellBody(): string {
  const start = PAGE.indexOf('export default async function DashboardPage');
  expect(start).toBeGreaterThan(-1);
  return PAGE.slice(start, PAGE.indexOf('\n}\n', PAGE.indexOf('return (', start)));
}

/** The body of `DayFrameRegion`'s own return: the only place its blocks' order is decided. */
function dayFrameBody(): string {
  const start = PAGE.indexOf('async function DayFrameRegion()');
  expect(start).toBeGreaterThan(-1);
  return PAGE.slice(start, PAGE.indexOf('\n}\n', PAGE.indexOf('return (', start)));
}

describe('the program card sits where the page puts it', () => {
  it('renders above the invite cards, which share its treatment', () => {
    const body = dayFrameBody();
    const hero = body.indexOf('{hasRealHistory && programHero &&');
    const invites = body.indexOf('F.homeInviteCards');
    expect(hero, 'the card is not rendered at all').toBeGreaterThan(-1);
    expect(invites).toBeGreaterThan(-1);
    expect(hero).toBeLessThan(invites);
  });

  it('renders above the Today zone', () => {
    const body = dayFrameBody();
    expect(body.indexOf('{hasRealHistory && programHero &&')).toBeLessThan(
      body.indexOf('<TodayZone />'),
    );
  });

  it('renders below what is assigned to her, because those go stale and this does not', () => {
    const body = dayFrameBody();
    const assigned = body.indexOf('{assignedToHer && (');
    const hero = body.indexOf('{hasRealHistory && programHero &&');
    expect(assigned).toBeGreaterThan(-1);
    expect(assigned).toBeLessThan(hero);
  });

  it('renders below Quick Actions, which is its own region earlier in <main>', () => {
    // The comparison that matters is between the two REGIONS in the shell,
    // not between two functions' positions in the file.
    const body = shellBody();
    const quick = body.indexOf('<QuickActionsRegion />');
    const dayFrame = body.indexOf('<DayFrameRegion />');
    expect(quick).toBeGreaterThan(-1);
    expect(quick).toBeLessThan(dayFrame);
  });

  it('is gated on the same history the welcome-card branch is, so it changed place and not audience', () => {
    // Home speed build (2026-08-28): the same condition, stated once as
    // memberHasRealHistory() so the day frame and the stream below it read
    // the identical answer rather than each recomputing it.
    expect(PAGE).toContain(
      "return recentCheckins.length > 0 || lifestyleExperiments.some((e) => e.status === 'active');",
    );
    expect(PAGE).toContain('memberHasRealHistory()');
    expect(PAGE).toContain('{hasRealHistory && programHero &&');
    expect(PAGE).toContain('{!hasRealHistory ? (');
  });

  it('appears exactly once on the page', () => {
    expect(PAGE.match(/<AssignedProgramsCard/g)).toHaveLength(1);
    expect(PAGE.match(/programHero &&/g)).toHaveLength(1);
  });

  it('is no longer one of the Today zone’s blocks', () => {
    expect(PAGE).not.toContain('assigned_programs:');
    expect(PAGE).not.toContain('assignedProgramsNode');
  });

  it('carries the mark through, rather than deciding newness on the screen', () => {
    expect(PAGE).toContain('isNew={currentProgram.isNew}');
  });
});

describe('one hero, not two', () => {
  it('the Movement Assessment panel drops its deep green treatment when a program exists', () => {
    expect(PAGE).toContain("variant={programHero ? 'card' : 'imageBacked'}");
  });

  it('the two variants really are different treatments, so that switch means something', () => {
    const imageBacked = renderToStaticMarkup(
      <MovementAssessmentCard assessments={[]} variant="imageBacked" />
    );
    const plain = renderToStaticMarkup(<MovementAssessmentCard assessments={[]} variant="card" />);

    expect(imageBacked).toContain(DEEP_GREEN);
    expect(plain).not.toContain(DEEP_GREEN);
    // And the plain one still says everything the panel is for.
    expect(plain).toContain('Guided Posture');
    expect(plain).toContain('Start Assessment');
  });
});
