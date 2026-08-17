/**
 * Unfinished states, and the ones that are now decisions rather than
 * accidents.
 *
 * Three separate audit findings meet here:
 *
 *   3.8  "Still putting today's lesson together" on Today. Not true: nothing
 *        was being put together, no background job produces a lesson later
 *        in the day, and a member returning an hour later read the same
 *        sentence again. Deleted outright. The section does not render.
 *   3.9  "Early version, more depth coming" under the Movement Score.
 *        Development status on a member's screen. Deleted. Whether the score
 *        itself should render at all is judgment item 2.
 *   3.11 "Coming soon" on three member surfaces. Judgment item 3, with the
 *        promise wording gone from every surface either way.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MOVEMENT_SCORE_MODE, movementScoreDisplay } from '../lib/movement/scoreDisplay';
import {
  UNBUILT_PLACEHOLDER_LABEL,
  UNBUILT_PLACEHOLDER_POLICY,
  showUnbuiltPlaceholder,
} from '../lib/naming/unbuiltPlaceholders';

const ROOT = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

describe("today's lesson placeholder never renders", () => {
  const today = read('app/today/page.tsx');

  it('the sentence is gone from the page entirely', () => {
    expect(today).not.toContain("Still putting today's lesson together");
    expect(today).not.toContain('Still putting today&apos;s lesson together');
    expect(today).not.toContain("I don't have it ready quite yet");
    expect(today).not.toContain('I don&apos;t have it ready quite yet');
  });

  it('the whole app is clean of it, not just that one file', () => {
    const dirs = ['app', 'components', 'lib'];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
      }
    };
    for (const dir of dirs) walk(path.join(ROOT, dir));

    const offenders = files.filter((f) => {
      const contents = fs.readFileSync(f, 'utf8');
      return contents.includes('Still putting today') || contents.includes('ready quite yet');
    });
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('the lesson section still renders normally when there IS a lesson', () => {
    // The branch that renders a real lesson is untouched: it still reads
    // decision.feedItem and decision.content and still renders the card.
    expect(today).toContain('decision.feedItem');
    expect(today).toContain('What Today Is About');
  });

  it('records why there is no placeholder, so nobody adds one back', () => {
    expect(today).toContain('NO PLACEHOLDER HERE, DELIBERATELY');
  });
});

describe('development-status copy is off the member Movement screen', () => {
  const grid = read('components/movement/MovementStatsGrid.tsx');

  it('the "early version" caveat is gone', () => {
    expect(grid).not.toContain('Early version');
    expect(grid).not.toContain('more depth coming');
  });

  it('the tile is decided in one place, so the judgment item is a one-line change', () => {
    expect(grid).toContain('movementScoreDisplay(movementScore)');
  });
});

describe('decided: the Movement Score does not render', () => {
  it('the tile is gone, whatever the score would have been', () => {
    expect(MOVEMENT_SCORE_MODE).toBe('sessions_this_week');
    for (const score of [null, 0, 25, 40, 100]) {
      expect(movementScoreDisplay(score), `score ${score}`).toBeNull();
    }
  });

  it('the tile is REMOVED rather than emptied, which is the same rule as an empty heading', () => {
    // Returning null is what the grid checks, so there is no card, no
    // heading, and no dash where a number used to be.
    expect(movementScoreDisplay(40)).toBeNull();
  });

  it('the underlying computation is deliberately kept, not deleted', () => {
    // The number was a real calculation over real history. What was wrong
    // was presenting a completion ratio as a score out of 100, and that is
    // a presentation decision this build reversed; the calculation is what
    // a better version would be built on.
    const score = read('lib/movement/score.ts');
    expect(score).toContain('export function computeMovementScore');
  });
});

describe('decided: unbuilt placeholders do not render', () => {
  it('the policy is to hide them', () => {
    expect(UNBUILT_PLACEHOLDER_POLICY).toBe('hide');
    expect(showUnbuiltPlaceholder()).toBe(false);
  });

  it('they are dropped from the questionnaire catalogue itself, so the counts are right too', () => {
    // Skipped where the card is built rather than hidden where it renders,
    // which is what makes "1 of 2 complete" count the library she actually
    // has instead of one padded with things she cannot open.
    const action = read('app/actions/questionnaireCatalog.ts');
    expect(action).toContain('if (!showUnbuiltPlaceholder()) continue;');
  });

  it('the two results screens drop the cards, and the whole section when nothing is left', () => {
    for (const file of [
      'components/primal-pattern/results/NextStepsCards.tsx',
      'components/assessments/four-doctors-results/NextStepsCards.tsx',
    ]) {
      const source = read(file);
      expect(source, file).toContain("card.status !== 'coming_soon' || showUnbuiltPlaceholder()");
      expect(source, file).toContain('if (visibleCards.length === 0) return null;');
    }
  });

  it('the promise wording is gone from every member surface', () => {
    for (const file of [
      'components/questionnaires/CatalogQuestionnaireCard.tsx',
      'components/primal-pattern/results/NextStepsCards.tsx',
      'components/assessments/four-doctors-results/NextStepsCards.tsx',
    ]) {
      const source = read(file);
      expect(source, file).not.toContain('>Coming soon<');
      expect(source, file).not.toContain('>Coming Soon<');
    }
  });

  it('the wording survives the decision, in one place, in case a preview is ever wanted again', () => {
    expect(UNBUILT_PLACEHOLDER_LABEL).toBe('Not built yet');
  });
});
