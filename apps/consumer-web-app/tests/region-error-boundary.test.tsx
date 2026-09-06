// @vitest-environment jsdom
/**
 * ONE CARD FAILING IS NOT THE WHOLE SCREEN FAILING.
 *
 * Home and Today stream in Suspense boundaries. Once the shell has been
 * flushed there is nothing between a region that throws and
 * `app/error.tsx`, which is the whole route: one card whose read timed out
 * used to replace her greeting, her priority and her navigation with
 * "Something went wrong". components/RegionErrorBoundary.tsx is what stops
 * that, and this file drives it rather than describing it.
 *
 * FOUR CLAIMS:
 *   - a healthy region renders exactly what it was given, and adds no DOM
 *     of its own (one of these wraps a chip inside a flex row);
 *   - a region that throws shows the calm line it was given and a Try
 *     again, and NOTHING of the error itself;
 *   - a `silent` region renders nothing at all;
 *   - Try again asks the router for the route again, because these children
 *     are already-rendered server output and remounting them would replay
 *     the same failure with no new request; and the card stays put, saying
 *     it is trying, until new children actually arrive.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const refreshCalls: string[] = [];
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: () => refreshCalls.push('refresh'),
    push: () => {},
  }),
}));

const { RegionErrorBoundary } = await import('@/components/RegionErrorBoundary');

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;
let consoleErrors: unknown[][];
let originalConsoleError: typeof console.error;

function Boom(): JSX.Element {
  throw new Error('the database refused this read: relation "member_secrets" does not exist');
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  refreshCalls.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // React logs a caught render error itself; the boundary logs one too.
  // Both are swallowed here so a passing run is not a wall of red, and so
  // the test can assert what was logged.
  consoleErrors = [];
  originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args);
  };
});

afterEach(() => {
  console.error = originalConsoleError;
  act(() => root.unmount());
  container.remove();
});

describe('a healthy region', () => {
  it('renders what it was given', () => {
    act(() => {
      root.render(
        <RegionErrorBoundary message="Today's focus didn't load.">
          <p>Your priority today</p>
        </RegionErrorBoundary>
      );
    });
    expect(container.textContent).toContain('Your priority today');
  });

  it('adds no element of its own, so a chip inside a flex row stays inside that row', () => {
    act(() => {
      root.render(
        <RegionErrorBoundary silent>
          <span data-chip="yes">Encourage</span>
        </RegionErrorBoundary>
      );
    });
    // The chip is the container's own first child: nothing was wrapped
    // around it. A wrapper div here would take the chip out of the flex row
    // it is supposed to sit in beside the heading.
    expect(container.firstElementChild?.tagName).toBe('SPAN');
    expect(container.firstElementChild?.getAttribute('data-chip')).toBe('yes');
  });
});

describe('a region that throws', () => {
  beforeEach(() => {
    act(() => {
      root.render(
        <RegionErrorBoundary message="Today's focus didn't load.">
          <Boom />
        </RegionErrorBoundary>
      );
    });
  });

  it('shows the calm line it was given', () => {
    expect(container.textContent).toContain("Today's focus didn't load.");
  });

  it('shows a Try again', () => {
    const button = [...container.querySelectorAll('button')].find((b) =>
      /try again/i.test(b.textContent ?? '')
    );
    expect(button).toBeTruthy();
  });

  it('shows nothing of the error itself', () => {
    const text = container.textContent ?? '';
    expect(text).not.toContain('member_secrets');
    expect(text).not.toContain('relation');
    expect(text).not.toContain('Error');
  });

  it('puts the real error where we can read it, and only there', () => {
    const logged = consoleErrors.map((args) => args.map(String).join(' ')).join('\n');
    expect(logged).toContain('Region failed to render');
    expect(logged).toContain('member_secrets');
  });

  it('does not take the rest of the screen with it', () => {
    act(() => {
      root.render(
        <div>
          <p>Good afternoon</p>
          <RegionErrorBoundary message="Today's focus didn't load.">
            <Boom />
          </RegionErrorBoundary>
          <p>Your programs</p>
        </div>
      );
    });
    expect(container.textContent).toContain('Good afternoon');
    expect(container.textContent).toContain('Your programs');
    expect(container.textContent).toContain("Today's focus didn't load.");
  });
});

describe('a silent region that throws', () => {
  it('renders nothing at all', () => {
    act(() => {
      root.render(
        <RegionErrorBoundary silent>
          <Boom />
        </RegionErrorBoundary>
      );
    });
    expect(container.textContent).toBe('');
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('Try again', () => {
  it('asks the router for the route again, and says it is trying until new children arrive', () => {
    act(() => {
      root.render(
        <RegionErrorBoundary message="Today's focus didn't load.">
          <Boom />
        </RegionErrorBoundary>
      );
    });

    const button = [...container.querySelectorAll('button')].find((b) =>
      /try again/i.test(b.textContent ?? '')
    )!;
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // A refresh is the only thing that re-runs a server component's read.
    expect(refreshCalls).toEqual(['refresh']);
    // And the card stays, saying so, rather than flickering back to a
    // subtree that would throw again on the same payload.
    expect(container.textContent).toContain('Trying');
    expect(container.querySelector('button')?.hasAttribute('disabled')).toBe(true);
  });

  it('clears once genuinely new children arrive', () => {
    act(() => {
      root.render(
        <RegionErrorBoundary message="Today's focus didn't load.">
          <Boom />
        </RegionErrorBoundary>
      );
    });
    expect(container.textContent).toContain("Today's focus didn't load.");

    act(() => {
      root.render(
        <RegionErrorBoundary message="Today's focus didn't load.">
          <p>Your priority today</p>
        </RegionErrorBoundary>
      );
    });

    expect(container.textContent).toContain('Your priority today');
    expect(container.textContent).not.toContain("Today's focus didn't load.");
  });
});
