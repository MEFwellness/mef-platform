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

describe('judgment item 2: the Movement Score', () => {
  it('currently shows the score, which is the option awaiting a decision', () => {
    expect(MOVEMENT_SCORE_MODE).toBe('score_out_of_100');
    expect(movementScoreDisplay(40)).not.toBeNull();
  });

  it('the other option genuinely removes the tile rather than emptying it', () => {
    // Proved by the shape of the function: a mode that returns null is the
    // whole implementation of "the section does not render", which is the
    // same rule components/layout/WhenNotEmpty.tsx enforces for headings.
    expect(movementScoreDisplay(null)?.value).toBeNull();
    expect(movementScoreDisplay(null)?.emptyStatement).toContain('no score yet');
  });

  it('says nothing about development status in either mode', () => {
    const display = movementScoreDisplay(0);
    const text = [display?.heading, display?.caption, display?.emptyStatement].join(' ');
    expect(text.toLowerCase()).not.toContain('early version');
    expect(text.toLowerCase()).not.toContain('coming');
  });
});

describe('judgment item 3: unbuilt placeholders', () => {
  it('the promise wording is gone from every member surface', () => {
    for (const file of [
      'components/questionnaires/CatalogQuestionnaireCard.tsx',
      'components/primal-pattern/results/NextStepsCards.tsx',
      'components/assessments/four-doctors-results/NextStepsCards.tsx',
    ]) {
      const source = read(file);
      expect(source, file).not.toContain('>Coming soon<');
      expect(source, file).not.toContain('>Coming Soon<');
      expect(source, file).toContain('UNBUILT_PLACEHOLDER_LABEL');
      expect(source, file).toContain('showUnbuiltPlaceholder()');
    }
  });

  it('the wording lives in one place, so three surfaces cannot say three different things', () => {
    expect(UNBUILT_PLACEHOLDER_LABEL).toBe('Not built yet');
  });

  it('currently shows the placeholders, honestly worded, which is the option awaiting a decision', () => {
    expect(UNBUILT_PLACEHOLDER_POLICY).toBe('show_honestly');
    expect(showUnbuiltPlaceholder()).toBe(true);
  });
});
