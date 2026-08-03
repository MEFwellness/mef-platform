'use client';

/**
 * Core Values Snapshot's closing screen, the same "premium payoff"
 * treatment as Life Signal Check's own (see LscCloseScreen.tsx's header
 * comment for the full rationale) — both conversations should end at the
 * same quality bar. Shares every piece of timing/celebration mechanics
 * with Life Signal Check via components/closing-screen/
 * ClosingScreenPrimitives.tsx; only the copy, scoring, and per-card
 * matching below are Core Values Snapshot's own.
 *
 * One real difference from Life Signal Check's version: the next
 * conversation (Life Signal Check) actually exists, so the handoff
 * button here is real and enabled, not an honestly-disabled "Coming
 * soon" — the emotional copy invites the member into a real next step
 * instead of framing an absence.
 */

import { CVS_DISPLAY_FONT, CVS_GOLD_DIVIDER } from './theme';
import { IntroReveal } from '@/components/IntroReveal';
import { ConversationFlow } from '@/components/reveal/ConversationFlow';
import { splitIntoSentences } from '@/lib/reveal/text';
import {
  JourneyProgressLine,
  RevealCard,
  useCloseScreenReveal,
  useDelayedReveal,
} from '@/components/closing-screen/ClosingScreenPrimitives';
import { GapVisual } from './GapVisual';
import {
  buildCvsClosingReinforcement,
  buildCvsRootObservation,
  buildGapVisualCopy,
  CVS_HANDOFF,
  CVS_PROGRESS_CARD,
} from '@/lib/core-values-snapshot/copy';
import type { CvsScoring } from '@/lib/core-values-snapshot/types';

type NarrativeCard = { id: string; title: string; summary: string };

type Props = {
  sessionId: string;
  scoring: CvsScoring;
  didStartExperiment: boolean;
  narrativeItems: NarrativeCard[];
  onStartLifeSignalCheck: () => void;
  onLater: () => void;
};

/** One "What Root Knows" card — label + finding, and a real visual instead of a sentence with digits wherever the underlying scoring actually supports one. Matches by the narrative item's own stable title (set once, in lib/core-values-snapshot/narrative.ts) rather than any stored flag, so this also fixes the framing for a row written before this redesign existed. */
function InsightCard({ item, scoring }: { item: NarrativeCard; scoring: CvsScoring }) {
  if (item.title.startsWith('Attention gap on')) {
    const gapCopy = buildGapVisualCopy(scoring);
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{item.title}</p>
        <GapVisual matteringFraction={scoring.importance[scoring.topValue] / 8} attentionOutOf5={scoring.attention[scoring.topValue]} copy={gapCopy} />
      </>
    );
  }

  if (item.title.startsWith("What's pressing on") || item.title.startsWith("What's behind")) {
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

// Roughly 2.5s total on first view, instant on a revisit — same pacing as Life Signal Check's own closing screen.
const STEP_MS = 260;
const REINFORCEMENT_DELAY_MS = 400;
const OBSERVATION_DELAY_MS = REINFORCEMENT_DELAY_MS + STEP_MS;
const KNOWS_DELAY_MS = OBSERVATION_DELAY_MS + STEP_MS;
const HANDOFF_DELAY_MS = KNOWS_DELAY_MS + STEP_MS;

export function CvsCloseScreen({ sessionId, scoring, didStartExperiment, narrativeItems, onStartLifeSignalCheck, onLater }: Props) {
  const play = useCloseScreenReveal(`cvs:${sessionId}`);
  const observation = buildCvsRootObservation(scoring);
  const observationCardRevealed = useDelayedReveal(play, OBSERVATION_DELAY_MS);

  return (
    <div className="space-y-4">
      <div className={play ? 'mef-fade-in' : undefined}>
        <JourneyProgressLine play={play} items={CVS_PROGRESS_CARD.items} />
      </div>

      <RevealCard play={play} delayMs={REINFORCEMENT_DELAY_MS} elevated>
        <ConversationFlow
          messages={
            play
              ? ['Looking back at what you shared...', ...splitIntoSentences(buildCvsClosingReinforcement(didStartExperiment))]
              : splitIntoSentences(buildCvsClosingReinforcement(didStartExperiment))
          }
          initialSkip={!play}
        />
      </RevealCard>

      <RevealCard play={play} delayMs={OBSERVATION_DELAY_MS}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Root&apos;s noticing</p>
        <div className="mt-2 min-h-[1.5em]">
          {observationCardRevealed && observation && (
            <IntroReveal title={observation} lines={[]} titleClassName="text-[15px] leading-relaxed text-[#1B3A2D]" storageKey={`cvs-close-observation:${sessionId}`} />
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
        <p className={`${CVS_DISPLAY_FONT} text-xl leading-snug text-[#1B3A2D]`}>{CVS_HANDOFF.readyPrompt}</p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{CVS_HANDOFF.readySupport}</p>
        <div className={`${CVS_GOLD_DIVIDER} my-5`} />
        <ConversationFlow messages={splitIntoSentences(CVS_HANDOFF.body)} initialSkip={!play} />
        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={onStartLifeSignalCheck}
            className="mef-focus-ring block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
          >
            {CVS_HANDOFF.primaryButton}
          </button>
          <button
            type="button"
            onClick={onLater}
            className="mef-focus-ring block w-full rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
          >
            {CVS_HANDOFF.secondaryButton}
          </button>
        </div>
      </RevealCard>
    </div>
  );
}
