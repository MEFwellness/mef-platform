/**
 * Where the program card sits on Home, and what it displaces.
 *
 * The polish pass promoted it out of the "Today" zone and made it the
 * screen's hero. Three things about that are worth holding still, because
 * each of them is a decision somebody could undo by accident while editing
 * a 700 line page:
 *
 *   1. It leads. Above Quick Actions, above the Today zone, and above the
 *      invite cards, which use the same deep green treatment and would
 *      otherwise sit on top of the hero.
 *   2. It is not ALSO in the Today zone. Two copies of her program on one
 *      screen is worse than the flat card this replaced.
 *   3. Promoting it changed where it sits, not who sees it. It is gated on
 *      the same fact the welcome-card branch is, so a member with no
 *      check-in history sees exactly what she saw before.
 *
 * Plus the rule that makes it a hero at all: when a program exists, the
 * Movement Assessment panel gives up the deep green treatment, because two
 * of them on one screen is two heroes and therefore none.
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

describe('the program hero leads the home screen', () => {
  it('renders above the invite cards, which share its treatment', () => {
    const hero = PAGE.indexOf('{hasRealHistory && programHero &&');
    const invites = PAGE.indexOf('F.homeInviteCards');
    expect(hero, 'the hero is not rendered at all').toBeGreaterThan(-1);
    expect(invites).toBeGreaterThan(-1);
    expect(hero).toBeLessThan(invites);
  });

  it('renders above Quick Actions and above the Today zone', () => {
    const hero = PAGE.indexOf('{hasRealHistory && programHero &&');
    expect(hero).toBeLessThan(PAGE.indexOf('F.homeQuickActionCase'));
    expect(hero).toBeLessThan(PAGE.indexOf('TODAY_CARD_NODES[key]'));
  });

  it('is gated on the same history the welcome-card branch is, so it changed place and not audience', () => {
    expect(PAGE).toContain('const hasRealHistory = hasCheckins || hasActiveExperiment;');
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
