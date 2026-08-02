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

import { CVS_DISPLAY_FONT, CVS_GOLD, CVS_GOLD_DIVIDER } from '@/components/core-values-snapshot/theme';
import { IntroReveal } from '@/components/IntroReveal';
import { ConversationFlow } from '@/components/reveal/ConversationFlow';
import { splitIntoSentences } from '@/lib/reveal/text';
import {
  JourneyProgressLine,
  RevealCard,
  useCloseScreenReveal,
  useDelayedReveal,
} from '@/components/closing-screen/ClosingScreenPrimitives';
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
  onStartReadinessPulse: () => void;
  onLater: () => void;
};

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

// Roughly 2.5s total on first view (item 18), instant on a revisit.
const STEP_MS = 260;
const REINFORCEMENT_DELAY_MS = 400;
const OBSERVATION_DELAY_MS = REINFORCEMENT_DELAY_MS + STEP_MS;
const KNOWS_DELAY_MS = OBSERVATION_DELAY_MS + STEP_MS;
const HANDOFF_DELAY_MS = KNOWS_DELAY_MS + STEP_MS;

export function LscCloseScreen({ sessionId, scoring, didStartExperiment, narrativeItems, onStartReadinessPulse, onLater }: Props) {
  const play = useCloseScreenReveal(`lsc:${sessionId}`);
  const observation = buildLscRootObservation(scoring);
  const observationCardRevealed = useDelayedReveal(play, OBSERVATION_DELAY_MS);

  return (
    <div className="space-y-4">
      <div className={play ? 'mef-fade-in' : undefined}>
        <JourneyProgressLine play={play} items={LSC_PROGRESS_CARD.items} />
      </div>

      <RevealCard play={play} delayMs={REINFORCEMENT_DELAY_MS} elevated>
        <ConversationFlow messages={splitIntoSentences(buildLscClosingReinforcement(didStartExperiment))} initialSkip={!play} />
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
            onClick={onStartReadinessPulse}
            className="mef-focus-ring block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
          >
            {LSC_HANDOFF.primaryButton}
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
