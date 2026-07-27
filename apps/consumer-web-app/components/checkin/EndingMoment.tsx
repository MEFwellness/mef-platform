'use client';

/**
 * "The colors accumulated across her answers resolve into a single
 * image of the day before she is returned to Today." Built strictly
 * from the real hero-scale values she just answered in this session —
 * no decorative flourish unconnected to what she entered, and if none
 * of those values exist yet (shouldn't happen once the six protected
 * core questions are answered, but defensively handled), it says so
 * honestly instead of filling the space with something invented.
 *
 * Rendered as a brief overlay inside the wizard itself right after the
 * real submit fires — not a new route, not a fake "insight": just a
 * visual composition of literal answers, then it hands off to whatever
 * the flow already navigates to next (the forecast/calibration result
 * screen for morning, the dashboard for evening), both completely
 * untouched.
 */

import { useEffect, useState } from 'react';
import { blendEndingColors, type RGB } from '@/lib/checkin-color-ramps';

export type EndingMomentValue = { ramp: { from: RGB; to: RGB }; value: number; max: number };

export function EndingMoment({
  values,
  onContinue,
  continuing,
}: {
  values: EndingMomentValue[];
  onContinue: () => void;
  continuing: boolean;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const blendedRgb = blendEndingColors(values);
  const blended = blendedRgb ? `rgb(${blendedRgb[0]}, ${blendedRgb[1]}, ${blendedRgb[2]})` : null;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      {blended ? (
        <>
          {/*
           * The color stays fully opaque out to 45% of the circle's radius
           * (previously it started fading immediately from the center and
           * was fully transparent by 75%, which — combined with a blend
           * that was already close to washed-out — made the reveal nearly
           * imperceptible against the page background). It still fades out
           * completely by the edge, so this stays a soft glow, not a hard
           * disc.
           */}
          <div
            className={`h-40 w-40 rounded-full transition-all duration-[1400ms] ease-out ${visible ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
            style={{
              background: `radial-gradient(circle, ${blended} 0%, ${blended} 45%, rgba(250,246,236,0) 90%)`,
            }}
            aria-hidden="true"
          />
          <p className="mt-8 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-snug text-[#1B3A2D]">
            Today, in one color.
          </p>
          <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-[#6B7A72]">
            Built from how you actually answered — nothing added.
          </p>
        </>
      ) : (
        <p className="max-w-xs text-[13px] leading-relaxed text-[#6B7A72]">
          Nothing real to show yet today — that&apos;s alright.
        </p>
      )}
      <button
        type="button"
        onClick={onContinue}
        disabled={continuing}
        className="mef-press mt-10 flex items-center justify-center rounded-full bg-[#1B3A2D] px-8 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {continuing ? 'Continuing…' : 'Continue'}
      </button>
    </div>
  );
}
