'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { CVS_CARD, CVS_DISPLAY_FONT, CVS_FOREST } from './theme';
import { GapVisual } from './GapVisual';
import {
  buildGapVisualCopy,
  buildKeyInsightCopy,
  buildS1Observation,
  buildWhatRootLearned,
  CVS_RESOURCE_AUDIO_SRC,
  CVS_RESOURCE_FULL_PIECE,
  CVS_RESOURCE_SUMMARY,
} from '@/lib/core-values-snapshot/copy';
import type { CvsScoring } from '@/lib/core-values-snapshot/types';

/** Beat 3 (What Root Learned) + Beat 4 (Gap Visual + Key Insight + conditional S1) — the gap visual renders immediately after the learned text, before any new copy, per the brief. */
export function WhatRootLearnedSection({ scoring }: { scoring: CvsScoring }) {
  const learned = buildWhatRootLearned(scoring);
  const gapCopy = buildGapVisualCopy(scoring);
  const keyInsight = buildKeyInsightCopy(scoring);

  return (
    <div className={`${CVS_CARD} mef-animate-in p-7`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Here&apos;s what Root learned</p>
      <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{learned}</p>

      <GapVisual
        matteringFraction={scoring.importance[scoring.topValue] / 8}
        attentionOutOf5={scoring.attention[scoring.topValue]}
        copy={gapCopy}
      />

      <div className="mt-6 rounded-2xl bg-[#F5F0E4] p-5">
        <p className={`${CVS_DISPLAY_FONT} text-lg text-[#1B3A2D]`}>{keyInsight.topLine}</p>
        <p className="mt-1 text-sm text-[#1B3A2D]">{keyInsight.attentionLine}</p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{keyInsight.footer}</p>
      </div>

      {scoring.s1Fires && (
        <p className="mt-5 rounded-2xl border border-[#C4A050]/30 bg-[#FDF9EF] p-5 text-[15px] leading-relaxed text-[#1B3A2D]">
          {buildS1Observation(scoring)}
        </p>
      )}
    </div>
  );
}

export function ResourceSection({ audioAvailable }: { audioAvailable: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);

  return (
    <div className={`${CVS_CARD} mef-animate-in p-7`}>
      <h2 className={`${CVS_DISPLAY_FONT} text-2xl leading-snug text-[#1B3A2D]`}>{CVS_RESOURCE_SUMMARY.title}</h2>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{CVS_RESOURCE_SUMMARY.label}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{CVS_RESOURCE_SUMMARY.body}</p>

      {expanded && (
        <p className="mef-animate-in mt-5 whitespace-pre-line text-[15px] leading-relaxed text-[#1B3A2D]">
          {CVS_RESOURCE_FULL_PIECE}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mef-focus-ring rounded-2xl border border-[#1B3A2D]/15 px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
          >
            {CVS_RESOURCE_SUMMARY.readButtonLabel}
          </button>
        )}
        {audioAvailable && (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="mef-focus-ring rounded-2xl border border-[#1B3A2D]/15 px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
          >
            {playing ? 'Pause' : CVS_RESOURCE_SUMMARY.listenButtonLabel}
          </button>
        )}
      </div>

      {audioAvailable && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          src={CVS_RESOURCE_AUDIO_SRC}
          className="mt-4 w-full"
          controls={playing}
          autoPlay={playing}
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  );
}

export function ReturnToDashboardButton() {
  return (
    <Link
      href={'/dashboard' as Route}
      className="mef-focus-ring mt-2 block rounded-2xl px-6 py-4 text-center text-sm font-semibold transition hover:bg-[#F5F0E4]"
      style={{ color: CVS_FOREST }}
    >
      Return to Dashboard
    </Link>
  );
}
