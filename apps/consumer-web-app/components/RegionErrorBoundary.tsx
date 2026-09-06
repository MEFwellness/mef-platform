'use client';

/**
 * ONE CARD FAILING IS NOT THE WHOLE SCREEN FAILING.
 *
 * WHY IT EXISTS (performance and stability audit, 2026-09-06). Home and
 * Today are drawn in Suspense boundaries so the first paint does not wait on
 * the slowest read. That is what makes them fast, and it had a cost nobody
 * had covered: once the shell has been flushed, a region that throws has no
 * boundary of its own to land in, so it climbs to `app/error.tsx`, which is
 * the WHOLE ROUTE. One card whose read timed out therefore replaced her
 * greeting, her priority, her programs and her navigation with "Something
 * went wrong". A screen built out of independent pieces has to fail in
 * independent pieces too.
 *
 * WHAT SHE SEES INSTEAD: the calm line this boundary is given, in the shape
 * of a card, with a Try again. Never a stack trace, never a message from a
 * database — `message` is written for her by the caller, and the real error
 * goes to the console for us.
 *
 * A REGION THAT FAILS QUIETLY GETS `silent`. Some of what streams into these
 * screens has no business announcing itself: a pop-up that did not resolve,
 * a floating launcher, a chip beside a heading. Those render nothing at all
 * rather than putting a retry card on screen for something she never asked
 * for.
 *
 * =====================================================================
 * TRY AGAIN IS A REAL RETRY, AND THAT IS WHY IT ASKS THE ROUTER
 * =====================================================================
 *
 * The obvious implementation — bump a key and remount the subtree — does
 * nothing here. These children are server components: by the time this
 * boundary holds them they are already-rendered payload handed down as a
 * prop, so remounting replays the same failure with no new request. The
 * only thing that re-runs the read that failed is asking the server for the
 * route again, which is `router.refresh()`.
 *
 * So the button starts a refresh and the card stays put, saying it is
 * trying, until NEW children actually arrive. Arriving children are the
 * evidence the retry worked; nothing else is. If the read fails a second
 * time the region throws again and lands back here, which is the honest
 * outcome rather than a card that flickers between broken and broken.
 *
 * IT ADDS NO DOM. The success path renders `children` exactly as it
 * received them: one of these boundaries wraps a chip inside a flex row,
 * and a wrapper element there would break the row it sits in.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

type BoundaryProps = {
  children: ReactNode;
  message?: string | undefined;
  silent?: boolean | undefined;
  onRetry: () => void;
};

type State = { failed: boolean; retrying: boolean };

class Boundary extends Component<BoundaryProps, State> {
  override state: State = { failed: false, retrying: false };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // The real error goes here, and only here. Nothing about it reaches the
    // screen: a member cannot act on a stack trace, and some of what a
    // failed read carries is her own data.
    console.error('Region failed to render', error, info.componentStack);
  }

  override componentDidUpdate(previous: BoundaryProps) {
    // New children mean the router came back with a fresh render of this
    // region, so whatever failed has been replaced. This is the only thing
    // that clears the failed state.
    if (this.state.failed && previous.children !== this.props.children) {
      this.setState({ failed: false, retrying: false });
    }
  }

  private retry = () => {
    this.setState({ retrying: true });
    this.props.onRetry();
  };

  override render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.silent) return null;

    return (
      <div role="status" className="mef-card mt-6">
        <p className="text-[15px] leading-relaxed text-[#1B3A2D]">
          {this.props.message ?? "This part didn't load."}
        </p>
        <button
          type="button"
          onClick={this.retry}
          disabled={this.state.retrying}
          className="mef-press mef-focus-ring mt-4 inline-flex items-center justify-center rounded-full border border-[#1B3A2D]/15 bg-white px-5 py-2.5 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#EFF6F1] disabled:opacity-60"
        >
          {this.state.retrying ? 'Trying…' : 'Try again'}
        </button>
      </div>
    );
  }
}

export function RegionErrorBoundary({
  children,
  message,
  silent,
}: {
  children: ReactNode;
  /** One plain sentence, written for her. Ignored when `silent`. */
  message?: string;
  /** Render nothing at all instead of a retry card. For regions she never asked for. */
  silent?: boolean;
}) {
  const router = useRouter();
  return (
    <Boundary message={message} silent={silent} onRetry={() => router.refresh()}>
      {children}
    </Boundary>
  );
}
