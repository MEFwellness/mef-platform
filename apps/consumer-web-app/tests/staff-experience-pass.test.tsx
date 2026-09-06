// @vitest-environment jsdom
/**
 * THE COACH SIDE EXPERIENCE PASS, DRIVEN RATHER THAN DESCRIBED (2026-09-06).
 *
 * The pass was a presentation change across the staff side: the two
 * section homes were reordered, the question bank got a pinned search and
 * folded driver groups, the entries page's check-in days fold, and one
 * header component replaced three.
 *
 * A presentation change is exactly the kind that a source-text assertion
 * pretends to cover and does not. So the folding components are MOUNTED
 * and CLICKED here, and the two claims that actually matter about a fold
 * are asserted directly:
 *
 *   1. A FOLDED GROUP RENDERS NO CHILDREN. Not hidden children, none. That
 *      is the whole reason the pass moved height at all; a version that
 *      animated a height would pass a "is it visible" check and leave the
 *      25,231px question bank exactly as heavy as it was.
 *   2. A SEARCH OPENS WHAT IT FINDS. A field that filters a list of shut
 *      doors is worse than no field, because it reports matches the coach
 *      cannot read.
 *
 * The source-level assertions at the bottom are the ones that genuinely
 * are about source: that no destination was dropped from either hub while
 * the cards were being rearranged into tiles, which is the one way a
 * declutter can quietly become a deletion.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, back: () => {} }),
}));

const { StaffCollapsible } = await import('@/components/staff/StaffCollapsible');
const { StaffToolGrid } = await import('@/components/staff/StaffToolGrid');
const { CheckinDayFold } = await import('@/app/coach/clients/[id]/entries/CheckinDayFold');

const ROOT = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf-8');

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function click(el: Element | null) {
  if (!el) throw new Error('Nothing to click');
  act(() => {
    (el as HTMLElement).click();
  });
}

/** The native setter, because React listens for the event and not the property. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('StaffCollapsible: a folded group is not a hidden group', () => {
  it('renders none of its children until it is opened, and folds again', () => {
    act(() => {
      root.render(
        <StaffCollapsible title="Recent client activity" digest="The last 5 check-ins.">
          <p data-testid="inside">Ebony checked in 14 hours ago</p>
        </StaffCollapsible>
      );
    });

    // Folded: the header and its digest are readable, the contents are not
    // merely invisible, they are absent from the document.
    expect(container.textContent).toContain('Recent client activity');
    expect(container.textContent).toContain('The last 5 check-ins.');
    expect(container.querySelector('[data-testid="inside"]')).toBeNull();

    const header = container.querySelector('button[aria-expanded]');
    expect(header?.getAttribute('aria-expanded')).toBe('false');

    click(header);
    expect(container.querySelector('[data-testid="inside"]')).not.toBeNull();
    expect(
      container.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')
    ).toBe('true');

    click(container.querySelector('button[aria-expanded]'));
    expect(container.querySelector('[data-testid="inside"]')).toBeNull();
  });

  it('opens on mount only when it is explicitly asked to', () => {
    act(() => {
      root.render(
        <StaffCollapsible title="Her check-ins" digest="12 days." defaultOpen>
          <p data-testid="inside">Sat, Sep 6</p>
        </StaffCollapsible>
      );
    });
    expect(container.querySelector('[data-testid="inside"]')).not.toBeNull();
  });
});

describe('CheckinDayFold: a day is a row, and its header says what is inside', () => {
  const DAY = {
    dateLabel: 'Sat, Sep 6',
    answerCount: 18,
    editedAfterwards: false,
    flaggedConcern: false,
    hasNote: false,
  };

  it('counts every answer it holds and keeps the answers out of the document until opened', () => {
    act(() => {
      root.render(
        <CheckinDayFold {...DAY}>
          <p data-testid="answers">How are you feeling emotionally this morning?</p>
        </CheckinDayFold>
      );
    });
    expect(container.textContent).toContain('Sat, Sep 6');
    expect(container.textContent).toContain('18 answers.');
    expect(container.querySelector('[data-testid="answers"]')).toBeNull();

    click(container.querySelector('button[aria-expanded]'));
    expect(container.querySelector('[data-testid="answers"]')).not.toBeNull();
  });

  it('says a note exists and that a day was edited, because those are scanned across days', () => {
    act(() => {
      root.render(
        <CheckinDayFold {...DAY} answerCount={1} hasNote editedAfterwards>
          <p>x</p>
        </CheckinDayFold>
      );
    });
    // Singular, because "1 answers" is the pluraliser bug this codebase
    // has already shipped once.
    expect(container.textContent).toContain('1 answer, a note in her own words, edited afterwards.');
  });

  it('keeps a flagged concern visible while the day is folded', () => {
    act(() => {
      root.render(
        <CheckinDayFold {...DAY} flaggedConcern>
          <p data-testid="answers">hidden</p>
        </CheckinDayFold>
      );
    });
    // The flag is the thing a coach scrolls this list looking for, so it
    // may never be the thing the fold hides.
    expect(container.textContent).toContain('Something new or getting worse');
    expect(container.querySelector('[data-testid="answers"]')).toBeNull();
  });
});

describe('StaffToolGrid: every destination survives the move from card to tile', () => {
  it('renders one link per tool, to the href it was given, and badges only what is waiting', () => {
    const Icon = (() => null) as never;
    act(() => {
      root.render(
        <StaffToolGrid
          label="Coach tools"
          tools={[
            {
              label: 'Safety Review Queue',
              href: '/coach/review-queue',
              Icon,
              badge: '3 open',
              tone: 'waiting',
            },
            { label: 'Program Library', href: '/coach/programs', Icon },
          ]}
        />
      );
    });

    const links = Array.from(container.querySelectorAll('a'));
    expect(links).toHaveLength(2);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/coach/review-queue',
      '/coach/programs',
    ]);
    expect(container.textContent).toContain('3 open');
    // The quiet tile carries no pill at all, so a screen where nothing is
    // waiting has nothing glowing on it.
    expect(links[1]?.textContent).toBe('Program Library');
  });
});

describe('the question bank search opens the groups it finds', () => {
  it('filters to the matching question and forces its driver group open', async () => {
    const { QuestionBankPanel } = await import('@/components/coach-questions/QuestionBankPanel');

    const drivers = [
      { id: 'D1', label: 'Sleep', domainKey: 'body', sortOrder: 1 },
      { id: 'D2', label: 'Caffeine', domainKey: 'body', sortOrder: 2 },
    ] as never[];
    const domains = [{ key: 'body', label: 'Body', sortOrder: 1 }] as never[];
    const questions = [
      {
        questionKey: 'sleep.window',
        driverId: 'D1',
        prompt: 'What time did you get into bed?',
        responseType: 'single_select',
        options: [],
        storage: 'probe_answer',
        dailyCheckinsColumn: null,
        wearableMetricCode: null,
        requires: [],
        excludes: [],
        priority: 0,
        active: true,
        screen: 'morning',
        displayStyle: null,
        askedCount: 4,
        answeredCount: 4,
      },
      {
        questionKey: 'caffeine.last',
        driverId: 'D2',
        prompt: 'When did you have your last coffee?',
        responseType: 'single_select',
        options: [],
        storage: 'probe_answer',
        dailyCheckinsColumn: null,
        wearableMetricCode: null,
        requires: [],
        excludes: [],
        priority: 0,
        active: true,
        screen: 'morning',
        displayStyle: null,
        askedCount: 2,
        answeredCount: 2,
      },
    ] as never[];

    act(() => {
      root.render(
        <QuestionBankPanel initialQuestions={questions} drivers={drivers} domains={domains} />
      );
    });

    // Folded to begin with: both driver headers are readable and neither
    // question's words are in the document.
    expect(container.textContent).toContain('D1: Sleep');
    expect(container.textContent).toContain('D2: Caffeine');
    expect(container.textContent).not.toContain('What time did you get into bed?');
    expect(container.textContent).toContain('2 active questions.');

    const field = container.querySelector<HTMLInputElement>('[data-question-search]');
    expect(field).not.toBeNull();

    type(field!, 'coffee');

    // The match is now readable WITHOUT a second tap, and the group that
    // does not hold it is gone rather than sitting there empty.
    expect(container.textContent).toContain('When did you have your last coffee?');
    expect(container.textContent).toContain('D2: Caffeine');
    expect(container.textContent).not.toContain('D1: Sleep');
    expect(container.textContent).toContain('1 of 2 active questions match "coffee".');

    // Clearing the field restores the full list, folded again, with no
    // separate reset path.
    type(field!, '');
    expect(container.textContent).toContain('D1: Sleep');
    expect(container.textContent).not.toContain('When did you have your last coffee?');
  });

  it('finds a question by its key and by its driver name, not only by its words', async () => {
    const { QuestionBankPanel } = await import('@/components/coach-questions/QuestionBankPanel');
    const drivers = [{ id: 'D1', label: 'Hydration', domainKey: 'body', sortOrder: 1 }] as never[];
    const domains = [{ key: 'body', label: 'Body', sortOrder: 1 }] as never[];
    const questions = [
      {
        questionKey: 'water.intake',
        driverId: 'D1',
        prompt: 'How much did you drink yesterday?',
        responseType: 'single_select',
        options: [],
        storage: 'probe_answer',
        dailyCheckinsColumn: null,
        wearableMetricCode: null,
        requires: [],
        excludes: [],
        priority: 0,
        active: true,
        screen: 'morning',
        displayStyle: null,
        askedCount: 1,
        answeredCount: 1,
      },
    ] as never[];

    act(() => {
      root.render(
        <QuestionBankPanel initialQuestions={questions} drivers={drivers} domains={domains} />
      );
    });
    const field = container.querySelector<HTMLInputElement>('[data-question-search]')!;

    type(field, 'water.intake');
    expect(container.textContent).toContain('How much did you drink yesterday?');

    type(field, 'hydration');
    expect(container.textContent).toContain('How much did you drink yesterday?');

    type(field, 'nothing matches this');
    expect(container.textContent).toContain('0 of 1 active questions match');
    expect(container.textContent).not.toContain('How much did you drink yesterday?');
  });
});

describe('nothing was dropped while the hubs were rearranged', () => {
  /*
   * The one real risk of a declutter. Both section homes turned a column
   * of cards into a grid of tiles, and a destination that simply failed to
   * be copied across would look like a tidier page rather than like a
   * missing feature.
   */
  it('the coach home still reaches all eight of its tools', () => {
    const coach = read('app/coach/page.tsx');
    for (const href of [
      '/coach/assign',
      '/coach/programs',
      '/coach/corrective-programs',
      '/coach/generate',
      '/coach/questions',
      '/exercises',
      '/movement/profile',
      '/coach/review-queue',
      '/coach/protein-review',
    ]) {
      expect(coach, `coach home lost ${href}`).toContain(`'${href}'`);
    }
  });

  it('the admin home still reaches all nine of its destinations', () => {
    const admin = read('app/admin/page.tsx');
    for (const href of [
      '/admin/access',
      '/admin/analytics',
      '/admin/blueprints',
      '/admin/acquisition',
      '/admin/cvs-test-tools',
      '/admin/reset-plan-test-tools',
      '/admin/push-test-tools',
      '/exercises',
      '/movement/profile',
    ]) {
      expect(admin, `admin home lost ${href}`).toContain(`'${href}'`);
    }
  });

  it('the coach home puts the clients above the tools', () => {
    // The whole point of the reorder. If a later edit moves the tool grid
    // back above the caseload this fails, which is the only way to keep a
    // layout decision from quietly reverting.
    const coach = read('app/coach/page.tsx');
    const attention = coach.indexOf('Needs Attention</p>');
    const clients = coach.indexOf('Your Clients');
    const tools = coach.indexOf('<StaffToolGrid');
    expect(attention).toBeGreaterThan(-1);
    expect(clients).toBeGreaterThan(attention);
    expect(tools).toBeGreaterThan(clients);
  });

  it('the test account toggle and its two counts are untouched on the admin home', () => {
    // Explicitly out of scope for a presentation pass, and the one thing
    // on this screen that a careless rearrangement could silently break.
    const admin = read('app/admin/page.tsx');
    expect(admin).toContain("searchParams?.includeTest === '1'");
    expect(admin).toContain('hiddenUserCount={userList.hiddenTestCount}');
    expect(admin).toContain('hiddenAssignmentCount={assignmentList.hiddenTestCount}');
  });

  it('the analytics chrome now offers a way back to Admin, and forces it', () => {
    const chrome = read('components/admin/analytics/AnalyticsChrome.tsx');
    expect(chrome).toContain('backLabel="Admin"');
    // Smart back from Drop-off would land on Funnel, which is sideways.
    expect(chrome).toContain('forceBack');
  });
});
