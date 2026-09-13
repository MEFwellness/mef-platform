// @vitest-environment jsdom
/**
 * THE X IN A SESSION LEAVES THE SESSION.
 *
 * Reported from the live app: "tapping the X next to Sessions does not
 * exit, it returns me to the same session detail page." It was right. The
 * X mid-session called `setPhase('overview')`, which is the session's own
 * detail screen, one step earlier in the same page. A close control that
 * lands you back inside the thing you closed is not a close control.
 *
 * DRIVEN, NOT GREPPED. The player is rendered, Begin is pressed, the X is
 * pressed, and what is asserted is that the caller's own leave handler ran
 * and that the player did NOT fall back to its overview. A source check
 * would pass on a prop that was wired to nothing.
 *
 * BOTH SESSION TYPES ARE COVERED BY THE SAME TWO CASES, because there is
 * only one player: Root Movement passes its own way out, and a
 * coach-assigned workout passes none and therefore leaves the way its
 * `onExit` already meant (back to the full list).
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GuidedSessionPlayer } from '../components/movement-sessions/GuidedSessionPlayer';

const EXERCISES = [
  { key: 'a', externalId: 'ex-a', name: 'Cat Cow', primaryMuscle: null, category: null, posterUrl: null, cues: [], prescription: '30 seconds', prescriptionSummary: '30 seconds', rest: null },
  { key: 'b', externalId: 'ex-b', name: 'Hip Hinge', primaryMuscle: null, category: null, posterUrl: null, cues: [], prescription: '8 reps', prescriptionSummary: '8 reps', rest: null },
];

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

function render(node: React.ReactElement): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

function click(label: string): void {
  const button = Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === label || b.getAttribute('aria-label') === label
  );
  if (!button) throw new Error(`no control named "${label}" on screen`);
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('the close control inside a session', () => {
  it('leaves the flow rather than returning to the session overview', () => {
    const left: string[] = [];
    render(
      <GuidedSessionPlayer
        exercises={EXERCISES}
        kicker={null}
        title="Morning Mobility"
        meta={null}
        exitLabel="Sessions"
        onExit={() => left.push('exit')}
        onLeaveSession={() => left.push('leaveSession')}
        renderDoneActions={() => null}
      />
    );

    click('Begin');
    expect(container.textContent).toContain('1 of 2');

    click('Leave this session');
    expect(left).toEqual(['leaveSession']);
    // The overview is what it used to fall back to. It must not be what is
    // on screen now: that was the whole bug.
    expect(container.textContent).not.toContain('Sessions');
  });

  it('falls back to the caller\'s one way out when it has only one', () => {
    const left: string[] = [];
    render(
      <GuidedSessionPlayer
        exercises={EXERCISES}
        kicker={null}
        title="From your coach"
        meta={null}
        exitLabel="Back to the full list"
        onExit={() => left.push('exit')}
        renderDoneActions={() => null}
      />
    );

    click('Begin');
    click('Leave this session');
    expect(left).toEqual(['exit']);
  });

  it('still offers the labelled way out from the overview itself', () => {
    const left: string[] = [];
    render(
      <GuidedSessionPlayer
        exercises={EXERCISES}
        kicker={null}
        title="Morning Mobility"
        meta={null}
        exitLabel="Sessions"
        onExit={() => left.push('exit')}
        onLeaveSession={() => left.push('leaveSession')}
        renderDoneActions={() => null}
      />
    );

    click('Sessions');
    expect(left).toEqual(['exit']);
  });
});
