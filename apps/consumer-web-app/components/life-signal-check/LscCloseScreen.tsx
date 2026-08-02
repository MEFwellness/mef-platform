'use client';

/**
 * Life Signal Check's closing screen, redesigned as "the premium payoff"
 * (2026-08-01) — a luxury editorial moment, not a form confirmation.
 * Replaces the old CloseSection (a plain reinforcement paragraph, a static
 * checklist, and a raw title/summary list dump) with:
 *  - a filling journey line (item 15) that also carries the first-
 *    completion celebration (item 10: a checkmark that draws itself, the
 *    conversation count animating up, one soft gold sweep) instead of a
 *    separate celebration widget — one visual telling one story, per the
 *    governing design principle, rather than two adjacent effects.
 *  - "What Root Knows So Far" as structured insight cards (item 11):
 *    label + finding, and a real visual instead of a sentence with digits
 *    wherever the underlying data actually supports one — the loudness
 *    bars (already built for "What Root Learned") for the body-response
 *    entry, and a small vertical diagram (item 12) for Body-Value Echo.
 *  - unknowns reading as the next chapter, not a blank (item 13) — applied
 *    at render time by matching a narrative item's own title, so a row
 *    written before this copy existed still reads the intentional way,
 *    not the old empty one.
 *  - a Root Observation card (item 14) using the same typewriter treatment
 *    as every intro screen (components/IntroReveal.tsx), so it reads like
 *    Root thinking out loud, not another static paragraph.
 *  - depth/elevation (item 16): CVS_CARD_ELEVATED for the one card that
 *    should read as the main event, CVS_CARD for the rest, a gold divider
 *    where sections meet.
 *  - emotional, honestly-disabled Readiness Pulse copy (item 17).
 *  - the whole screen revealing in stages on first view only, quickly on
 *    a revisit (item 18) — same "seen once, then instant" localStorage
 *    idiom IntroReveal.tsx established, scoped per session id here since
 *    this screen is reached once per completed Life Signal Check.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  CVS_CARD,
  CVS_CARD_ELEVATED,
  CVS_DISPLAY_FONT,
  CVS_FOREST,
  CVS_GOLD,
  CVS_GOLD_DIVIDER,
} from '@/components/core-values-snapshot/theme';
import { IntroReveal } from '@/components/IntroReveal';
import { LoudnessVisual } from './LoudnessVisual';
import {
  buildLoudnessVisualRows,
  buildLscClosingReinforcement,
  buildLscEchoDiagram,
  buildLscRootObservation,
  LSC_HANDOFF,
  LSC_PROGRESS_CARD,
} from '@/lib/life-signal-check/copy';
import type { LscScoring } from '@/lib/life-signal-check/types';

type NarrativeCard = { id: string; title: string; summary: string };

type Props = {
  sessionId: string;
  scoring: LscScoring;
  didStartExperiment: boolean;
  narrativeItems: NarrativeCard[];
  onLater: () => void;
};

/** True only the very first time this exact session reaches the close screen — every later visit (member navigates back through the taker for an already-completed session) renders instantly, no staged reveal, no celebration replay. Reduced motion always renders instantly regardless of history. Pure client state (this whole taker is already a Client Component), so there is no SSR/hydration concern to guard against here. */
function useCloseScreenReveal(sessionId: string): boolean {
  const [play, setPlay] = useState(false);
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;
    const key = `mef-lsc-close-seen:${sessionId}`;
    try {
      const already = window.localStorage.getItem(key) === '1';
      if (!already) {
        window.localStorage.setItem(key, '1');
        setPlay(true);
      }
    } catch {
      setPlay(true);
    }
  }, [sessionId]);
  return play;
}

function RevealCard({
  play,
  delayMs,
  elevated,
  className = '',
  children,
}: {
  play: boolean;
  delayMs: number;
  elevated?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const base = elevated ? CVS_CARD_ELEVATED : CVS_CARD;
  return (
    <div
      className={`${base} ${play ? 'mef-fade-in' : ''} p-7 ${className}`}
      style={play ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/** The filling line between the three conversations, doubling as the first-completion celebration for whichever node just finished — a checkmark that draws itself, one soft gold sweep, and the "Conversation 2 of 3" count landing a beat after the line finishes filling. Static (final, fully-settled state, no animation) on a revisit. */
function JourneyProgressLine({ play }: { play: boolean }) {
  const [count, setCount] = useState(play ? 1 : 2);

  useEffect(() => {
    if (!play) return;
    const countTimer = setTimeout(() => setCount(2), 900);
    return () => clearTimeout(countTimer);
  }, [play]);

  return (
    <div>
      <div className="flex items-center" aria-hidden="true">
        <ProgressNode done />
        <ProgressConnector filled animated={play} />
        <ProgressNode done drawAnimate={play} sweepAnimate={play} />
        <ProgressConnector filled={false} animated={false} />
        <ProgressNode done={false} label="3" />
      </div>
      <p className="mt-3 text-center text-xs font-semibold uppercase tracking-wider text-[#6B7A72]" aria-hidden="true">
        Conversation {count} of 3: complete
      </p>
      {/* The same journey, in words, for assistive tech — the line/dots above are purely decorative. */}
      <ul className="sr-only">
        {LSC_PROGRESS_CARD.items.map((item) => (
          <li key={item.label}>
            {item.done ? 'Done: ' : 'Next: '}
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** `animated` means "start empty and fill in on mount" (the newly-completed segment); a connector that's already settled (either genuinely empty, or a revisit's already-final state) renders directly at its target width, no transition. */
function ProgressConnector({ filled, animated }: { filled: boolean; animated: boolean }) {
  const [width, setWidth] = useState(animated ? '0%' : filled ? '100%' : '0%');
  useEffect(() => {
    if (!animated) return;
    const t = setTimeout(() => setWidth(filled ? '100%' : '0%'), 60);
    return () => clearTimeout(t);
  }, [animated, filled]);
  return (
    <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#1B3A2D]/10">
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{ width, backgroundColor: CVS_FOREST }}
      />
    </div>
  );
}

function ProgressNode({
  done,
  label = '✓',
  drawAnimate,
  sweepAnimate,
}: {
  done: boolean;
  label?: string;
  drawAnimate?: boolean;
  sweepAnimate?: boolean;
}) {
  if (!done) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1B3A2D]/15 text-[11px] font-semibold text-[#1B3A2D]/40">
        {label}
      </div>
    );
  }
  return (
    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ backgroundColor: CVS_FOREST }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        {drawAnimate ? (
          <path d="M3 8.5L6.5 12L13 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mef-close-check-draw" />
        ) : (
          <path d="M3 8.5L6.5 12L13 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      {sweepAnimate && (
        <div
          aria-hidden="true"
          className="mef-close-gold-sweep pointer-events-none absolute inset-y-0 left-0 w-full"
          style={{ background: `linear-gradient(100deg, transparent, ${CVS_GOLD}, transparent)` }}
        />
      )}
    </div>
  );
}

/** One "What Root Knows" card — label + finding, and a real visual instead of a sentence with digits wherever the underlying scoring actually supports one. Matches by the narrative item's own stable title (set once, in lib/life-signal-check/narrative.ts / lib/core-values-snapshot/narrative.ts) rather than any stored flag, so this also fixes the framing for a row written before this redesign existed. */
function InsightCard({ item, scoring }: { item: NarrativeCard; scoring: LscScoring }) {
  if (item.title === 'How your body is responding') {
    const rows = buildLoudnessVisualRows(scoring);
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{item.title}</p>
        <LoudnessVisual rows={rows} />
      </>
    );
  }

  if (item.title === 'Values and body pointing the same way') {
    const diagram = buildLscEchoDiagram(scoring);
    if (diagram) {
      return (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{item.title}</p>
          <div className="mt-4 flex flex-col items-center">
            <EchoDiagramNode label="What matters most" value={diagram.topValueLabel} />
            <EchoDiagramConnector />
            <EchoDiagramNode label="Right now" value={diagram.pressureLabel} />
            <EchoDiagramConnector />
            <EchoDiagramNode label="Loudest signal" value={diagram.loudestSignalLabel} gold />
          </div>
        </>
      );
    }
  }

  if (item.title.startsWith("What's behind") || item.title.startsWith("What's pressing on")) {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{item.title}</p>
        <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">
          That&apos;s exactly what our next conversation finds out.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{item.title}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{item.summary}</p>
    </>
  );
}

function EchoDiagramNode({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div
      className="w-full max-w-xs rounded-2xl border px-4 py-3 text-center"
      style={{
        borderColor: gold ? `${CVS_GOLD}66` : '#1B3A2D1A',
        backgroundColor: gold ? '#FDF9EF' : '#F3F6F4',
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7A72]">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${gold ? '' : 'text-[#1B3A2D]'}`} style={gold ? { color: '#854D0E' } : undefined}>
        {value}
      </p>
    </div>
  );
}

function EchoDiagramConnector() {
  return <div className="my-1 h-4 w-px" style={{ backgroundColor: '#1B3A2D33' }} aria-hidden="true" />;
}

/** True once `delayMs` has elapsed (or immediately, when `play` is false) — used to gate *mounting* a child that runs its own JS-driven animation (IntroReveal's typewriter), not just hiding it with CSS. Without this, a typewriter mounted immediately but merely opacity-hidden by its parent's own fade-in would finish typing invisibly before the card ever becomes visible. */
function useDelayedReveal(play: boolean, delayMs: number): boolean {
  const [revealed, setRevealed] = useState(!play);
  useEffect(() => {
    if (!play) return;
    const t = setTimeout(() => setRevealed(true), delayMs);
    return () => clearTimeout(t);
  }, [play, delayMs]);
  return revealed;
}

// Roughly 2.5s total on first view (item 18), instant on a revisit.
const STEP_MS = 260;
const REINFORCEMENT_DELAY_MS = 400;
const OBSERVATION_DELAY_MS = REINFORCEMENT_DELAY_MS + STEP_MS;
const KNOWS_DELAY_MS = OBSERVATION_DELAY_MS + STEP_MS;
const HANDOFF_DELAY_MS = KNOWS_DELAY_MS + STEP_MS;

export function LscCloseScreen({ sessionId, scoring, didStartExperiment, narrativeItems, onLater }: Props) {
  const play = useCloseScreenReveal(sessionId);
  const observation = buildLscRootObservation(scoring);
  const observationCardRevealed = useDelayedReveal(play, OBSERVATION_DELAY_MS);

  return (
    <div className="space-y-4">
      <div className={play ? 'mef-fade-in' : undefined}>
        <JourneyProgressLine play={play} />
      </div>

      <RevealCard play={play} delayMs={REINFORCEMENT_DELAY_MS} elevated>
        <p className="text-[15px] leading-relaxed text-[#1B3A2D]">{buildLscClosingReinforcement(didStartExperiment)}</p>
      </RevealCard>

      <RevealCard play={play} delayMs={OBSERVATION_DELAY_MS}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Root&apos;s noticing</p>
        <div className="mt-2 min-h-[1.5em]">
          {observationCardRevealed && (
            <IntroReveal title={observation} lines={[]} titleClassName="text-[15px] leading-relaxed text-[#1B3A2D]" storageKey={`lsc-close-observation:${sessionId}`} />
          )}
        </div>
      </RevealCard>

      {narrativeItems.length > 0 && (
        <RevealCard play={play} delayMs={KNOWS_DELAY_MS}>
          <p className={`${CVS_DISPLAY_FONT} text-xl text-[#1B3A2D]`}>What Root knows so far</p>
          <div className={`${CVS_GOLD_DIVIDER} my-4`} />
          <div className="space-y-6">
            {narrativeItems.map((item, i) => (
              <div key={item.id}>
                {i > 0 && <div className={`${CVS_GOLD_DIVIDER} mb-6`} />}
                <InsightCard item={item} scoring={scoring} />
              </div>
            ))}
          </div>
        </RevealCard>
      )}

      <RevealCard play={play} delayMs={HANDOFF_DELAY_MS} elevated>
        <p className={`${CVS_DISPLAY_FONT} text-xl leading-snug text-[#1B3A2D]`}>{LSC_HANDOFF.readyPrompt}</p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{LSC_HANDOFF.readySupport}</p>
        <div className={`${CVS_GOLD_DIVIDER} my-5`} />
        <p className="text-[15px] leading-relaxed text-[#1B3A2D]">{LSC_HANDOFF.body}</p>
        <div className="mt-5 space-y-3">
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Coming soon"
            className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl border px-6 py-4 text-center text-sm font-semibold"
            style={{ borderColor: `${CVS_GOLD}55`, color: '#8A7A4E', backgroundColor: '#FDF9EF' }}
          >
            <CheckCircle2 className="h-4 w-4 opacity-60" strokeWidth={1.75} aria-hidden="true" />
            {LSC_HANDOFF.primaryButton} · Coming soon
          </button>
          <button
            type="button"
            onClick={onLater}
            className="mef-focus-ring block w-full rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
          >
            {LSC_HANDOFF.secondaryButton}
          </button>
        </div>
      </RevealCard>
    </div>
  );
}
