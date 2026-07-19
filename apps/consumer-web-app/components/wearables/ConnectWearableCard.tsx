'use client';

/**
 * The premium "connect a wearable" pitch, shown in two places until a
 * member has at least one connected device: as its own standalone card
 * near the top of the Dashboard (`variant="dashboard"`), and embedded
 * inside the existing Today's Coaching Brief card (`variant="today"`, no
 * card chrome of its own so it doesn't nest card-in-card). Same
 * component so the pitch, the provider logos, and the "why this matters"
 * explanation never drift out of sync between the two surfaces.
 *
 * "Learn More" expands inline rather than linking anywhere — there's no
 * dedicated marketing page for this, and a modal or new route would be
 * more ceremony than a two-sentence explanation deserves.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Sparkles, ChevronDown } from 'lucide-react';
import { ProviderLogos } from './ProviderLogos';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const LEARN_MORE_COPY =
  'Right now, Root coaches from what you tell it in a check-in. A connected wearable adds what you can’t easily self-report: overnight recovery, real sleep stages and duration, resting heart rate, and daily activity. Root folds all of it into the same daily coaching decision, so recommendations adjust to how your body actually did, not just how you remembered feeling.';

export function ConnectWearableCard({ variant }: { variant: 'dashboard' | 'today' }) {
  const [expanded, setExpanded] = useState(false);

  if (variant === 'today') {
    return (
      <div>
        <p className="text-sm leading-relaxed text-[#1B3A2D]">
          Root coaches from what it can see. Connect a wearable and your recovery, sleep, and stress
          data shape what Root recommends each day, not just what you log by hand.
        </p>
        <ProviderLogos className="mt-3" />
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Link
            href="/connections"
            className="rounded-full bg-[#1B3A2D] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
          >
            Connect Device
          </Link>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-medium text-[#1B3A2D]/70 underline underline-offset-2 hover:text-[#1B3A2D]"
          >
            {expanded ? 'Less' : 'Learn more'}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
        </div>
        {expanded && (
          <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">{LEARN_MORE_COPY}</p>
        )}
      </div>
    );
  }

  return (
    <section className={`${CARD} mef-animate-in relative overflow-hidden p-7`}>
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[#F5B700]/10"
        aria-hidden="true"
      />
      <div className="relative flex items-center gap-2 text-[#6B7A72]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Unlock Smarter Coaching</p>
      </div>
      <p className="relative mt-3 max-w-lg text-[15px] leading-relaxed text-[#1B3A2D]">
        Connect your wearable so Root can personalize your sleep, recovery, stress, activity, and
        daily coaching.
      </p>
      <ProviderLogos className="relative mt-4" />
      <div className="relative mt-5 flex flex-wrap items-center gap-3">
        <Link
          href="/connections"
          className="rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
        >
          Connect Device
        </Link>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-[#1B3A2D]/10 px-5 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.06]"
        >
          Learn More
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
      </div>
      {expanded && (
        <p className="relative mt-4 max-w-lg text-sm leading-relaxed text-[#6B7A72]">
          {LEARN_MORE_COPY}
        </p>
      )}
    </section>
  );
}
