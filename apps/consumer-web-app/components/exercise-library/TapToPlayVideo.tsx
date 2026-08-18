'use client';

import { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { CuesPlaceholder } from './MediaBadge';
import { VideoPosterPlaceholder } from './VideoPosterPlaceholder';

/**
 * The one place in this app allowed to trigger a Your Move video fetch —
 * strictly on tap, never on mount. Shows the extracted poster with a play
 * button until tapped; only then calls /api/exercises/[id]/video-url
 * (which itself only hits Your Move's metered endpoint on a cache miss)
 * and swaps in a real <video> with the fresh, short-lived URL.
 *
 * A fetch failure here (network error, an exercise the current API key
 * does not cover, anything) falls back to rendering this exercise's
 * generated cues in place of the player, never a broken player or a bare
 * error message. Once a full-access key replaces a limited one, fetches
 * for those exercises simply start succeeding, with no code change.
 *
 * This lived inside ExerciseDetailView until Root Movement Level 1 needed
 * the identical behaviour inside a session player. It was extracted here
 * rather than reimplemented, so there is still exactly one component in
 * the product that can spend Your Move quota, and one place where the
 * poster/cues fallback behaviour is defined.
 *
 * `heightClassName` is the only thing the call sites disagree about: the
 * detail screen renders a fixed 224px media band, a guided player gives
 * the video a taller, aspect-driven stage. Everything else, the fetch, the
 * cache behaviour, the fallbacks, is shared verbatim.
 *
 * THERE IS NO AUTOPLAY AND NO RESET PROP. A guided player moving to the
 * next exercise mounts a fresh copy of this component with a new React
 * key, which starts idle and showing a poster. That is a stronger
 * guarantee than a reset prop was: there is no code path in this file that
 * can begin a fetch other than a member's tap on the play button.
 */
export function TapToPlayVideo({
  externalId,
  name,
  primaryMuscle,
  category,
  posterUrl,
  cues,
  heightClassName = 'h-56',
}: {
  externalId: string;
  name: string;
  primaryMuscle: string | null;
  category: string | null;
  posterUrl: string | null;
  cues: string[];
  /** Tailwind height for the pre-play surface and the cues fallback. */
  heightClassName?: string;
}) {
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; videoUrl: string }
    | { status: 'error' }
  >({ status: 'idle' });

  async function handlePlay() {
    setState({ status: 'loading' });
    try {
      const response = await fetch(`/api/exercises/${encodeURIComponent(externalId)}/video-url`);
      const json = await response.json();
      if (!response.ok || !json.videoUrl) {
        setState({ status: 'error' });
        return;
      }
      setState({ status: 'ready', videoUrl: json.videoUrl });
    } catch {
      setState({ status: 'error' });
    }
  }

  if (state.status === 'ready') {
    return (
      <video
        key={state.videoUrl}
        src={state.videoUrl}
        controls
        autoPlay
        playsInline
        preload="metadata"
        className="max-h-96 w-full bg-black object-contain"
      />
    );
  }

  // Graceful, no-broken-player fallback — the video genuinely isn't
  // available right now, so show the same coaching cues a no-video
  // exercise would show, instead of a dead play button or an error banner.
  if (state.status === 'error') {
    return (
      <div className={heightClassName}>
        <CuesPlaceholder cues={cues} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handlePlay}
      disabled={state.status === 'loading'}
      aria-label="Play exercise video"
      className={`relative block w-full ${heightClassName}`}
    >
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own extracted-frame poster, stored in the exercise-media Supabase bucket
        <img src={posterUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <VideoPosterPlaceholder exercise={{ name, primaryMuscle, category }} />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/20">
        <PlayCircle className="h-14 w-14 text-white drop-shadow" strokeWidth={1.25} />
        {state.status === 'loading' && (
          <p className="text-xs font-medium text-white">Cueing up your video…</p>
        )}
      </div>
    </button>
  );
}
