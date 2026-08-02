'use client';

/**
 * Readiness Pulse's closing screen — "the end of an act," per the build
 * brief's own exact six-beat order: reinforcement, synthesis (the three
 * cards of the complete picture), the pattern-anchored setup line, the
 * held "You don't wait for ready, you build it" line alone, THEN the
 * filling progress line, then the membership door. This deliberately
 * differs from Life Signal Check's and Core Values Snapshot's own closing
 * screens (components/life-signal-check/LscCloseScreen.tsx,
 * components/core-values-snapshot/CvsCloseScreen.tsx), which both open
 * with the progress line — this is the free arc's own terminal screen, so
 * the build brief places the celebration beat near the end, right before
 * the door, once the complete picture has already landed. Still built
 * entirely from the same shared primitives
 * (components/closing-screen/ClosingScreenPrimitives.tsx) as those two
 * screens, just staged in this different order — reuse, not a rebuild.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { IntroReveal } from '@/components/IntroReveal';
import { CVS_DISPLAY_FONT, CVS_GOLD_DIVIDER } from '@/components/core-values-snapshot/theme';
import { JourneyProgressLine, RevealCard, useCloseScreenReveal, useDelayedReveal } from '@/components/closing-screen/ClosingScreenPrimitives';
import {
  buildEvidenceEchoLine,
  buildRplClosingReinforcement,
  buildRplDivergenceLine,
  buildRplLoudestLabel,
  buildRplMembershipDoor,
  buildRplProtectingLabel,
  buildRplSetupLine,
  RPL_BUILD_LINE,
  RPL_PROGRESS_CARD,
  type EvidenceEchoContext,
} from '@/lib/readiness-pulse/copy';
import { READINESS_PATTERN_LABEL } from '@/lib/readiness-pulse/constants';
import type { RplScoring } from '@/lib/readiness-pulse/types';
import type { ValueArea } from '@/lib/core-values-snapshot/constants';

type Props = {
  sessionId: string;
  scoring: RplScoring;
  didStartExperiment: boolean;
  topValue: ValueArea | null;
  evidenceEcho: EvidenceEchoContext | null;
  onLater: () => void;
};

function SynthesisCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#1B3A2D]/10 bg-[#F3F6F4] px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7A72]">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#1B3A2D]">{value}</p>
    </div>
  );
}

const STEP_MS = 260;
const REINFORCEMENT_DELAY_MS = 400;
const SYNTHESIS_DELAY_MS = REINFORCEMENT_DELAY_MS + STEP_MS;
const SETUP_DELAY_MS = SYNTHESIS_DELAY_MS + STEP_MS;
const BUILD_LINE_DELAY_MS = SETUP_DELAY_MS + STEP_MS;
const PROGRESS_DELAY_MS = BUILD_LINE_DELAY_MS + STEP_MS;
const DOOR_DELAY_MS = PROGRESS_DELAY_MS + STEP_MS;

export function RplCloseScreen({ sessionId, scoring, didStartExperiment, topValue, evidenceEcho, onLater }: Props) {
  const play = useCloseScreenReveal(`rpl:${sessionId}`);
  const buildLineRevealed = useDelayedReveal(play, BUILD_LINE_DELAY_MS);
  const progressPlay = useDelayedReveal(play, PROGRESS_DELAY_MS);
  const door = buildRplMembershipDoor(scoring.finalPattern);
  const divergence = buildRplDivergenceLine(scoring);

  return (
    <div className="space-y-4">
      {/* Beat 1: honest reinforcement, matched to her pattern and Q2 history framing. */}
      <RevealCard play={play} delayMs={REINFORCEMENT_DELAY_MS} elevated>
        <p className="text-[15px] leading-relaxed text-[#1B3A2D]">{buildRplClosingReinforcement(scoring, didStartExperiment)}</p>
      </RevealCard>

      {/* Beat 2: the synthesis, three cards of the complete picture. Evidence comes first within the readiness card. */}
      <RevealCard play={play} delayMs={SYNTHESIS_DELAY_MS}>
        <p className={`${CVS_DISPLAY_FONT} text-xl text-[#1B3A2D]`}>The complete picture</p>
        <div className={`${CVS_GOLD_DIVIDER} my-4`} />
        <div className="space-y-3">
          <SynthesisCard label="What you are protecting" value={buildRplProtectingLabel(topValue)} />
          <SynthesisCard label="What is loudest right now" value={buildRplLoudestLabel(scoring)} />
          <div className="rounded-2xl border px-5 py-4" style={{ borderColor: '#C4A05055', backgroundColor: '#FDF9EF' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7A72]">How ready you are</p>
            {evidenceEcho && <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]">{buildEvidenceEchoLine(evidenceEcho)}</p>}
            <p className="mt-2 text-base font-semibold text-[#1B3A2D]">{READINESS_PATTERN_LABEL[scoring.finalPattern]}</p>
            {divergence && <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{divergence}</p>}
          </div>
        </div>
      </RevealCard>

      {/* Beat 3: the pattern-anchored setup line. */}
      <RevealCard play={play} delayMs={SETUP_DELAY_MS}>
        <p className="text-[15px] leading-relaxed text-[#1B3A2D]">{buildRplSetupLine(scoring.finalPattern)}</p>
      </RevealCard>

      {/* Beat 4: alone, typed slowly, held. */}
      <div className="rounded-[28px] bg-[#1B3A2D] p-8 text-center">
        <div className="min-h-[2.5em]">
          {buildLineRevealed && (
            <IntroReveal title={RPL_BUILD_LINE} lines={[]} titleClassName={`${CVS_DISPLAY_FONT} text-2xl leading-snug text-white`} storageKey={`rpl-build-line:${sessionId}`} />
          )}
        </div>
      </div>

      {/* Beat 5: the filling progress line, landing after the complete picture, not before it. */}
      <div className={progressPlay ? 'mef-fade-in' : undefined}>
        <JourneyProgressLine play={progressPlay} items={RPL_PROGRESS_CARD.items} />
      </div>

      {/* Beat 6: the membership door, framed per pattern. */}
      <RevealCard play={play} delayMs={DOOR_DELAY_MS} elevated>
        <p className={`${CVS_DISPLAY_FONT} text-xl leading-snug text-[#1B3A2D]`}>{door.heading}</p>
        <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{door.body}</p>
        <div className="mt-5 space-y-3">
          {door.primaryButton && (
            <Link
              href={'/membership' as Route}
              className="mef-focus-ring block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
            >
              {door.primaryButton}
            </Link>
          )}
          <button
            type="button"
            onClick={onLater}
            className="mef-focus-ring block w-full rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
          >
            {door.secondaryButton}
          </button>
        </div>
      </RevealCard>
    </div>
  );
}
