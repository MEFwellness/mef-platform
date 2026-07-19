/**
 * Custom line-art illustrations for the Hand Portion Guide — deliberately
 * not emoji (the prompt is explicit about this). Consistent style across
 * all four: 48x48 viewBox, currentColor stroke, 1.5 weight, rounded caps/
 * joins, matching this app's existing lucide-react icon weight (1.75) and
 * the brand's Deep Forest line-art language rather than a photographic or
 * emoji treatment. Each renders standalone so HandPortionGuide.tsx can
 * size/color them per its own layout.
 */

type IllustrationProps = {
  className?: string;
};

const SHARED = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function PalmIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-hidden="true">
      <path
        {...SHARED}
        d="M14 26V13a2.5 2.5 0 0 1 5 0v9M19 22v-11a2.5 2.5 0 0 1 5 0v11M24 22v-9a2.5 2.5 0 0 1 5 0v9M29 24v-6a2.5 2.5 0 0 1 5 0v10c0 6.6-5.4 12-12 12h-2c-4 0-6.2-1.6-8.4-4.6L9.2 28.4a2.3 2.3 0 0 1 3.6-2.8l3.2 3.6"
      />
    </svg>
  );
}

export function ThumbIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-hidden="true">
      <path {...SHARED} d="M19 22V12a3 3 0 0 1 6 0v10.5" />
      <path
        {...SHARED}
        d="M19 23c-2.2-1-4.6-.2-5.6 1.8s-.2 4.3 2 5.6L22 34c1.6 1 3.4 1.5 5.3 1.5h2.2c3.6 0 6.5-2.9 6.5-6.5V23a3 3 0 0 0-6 0"
      />
    </svg>
  );
}

export function CuppedHandIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-hidden="true">
      <path {...SHARED} d="M8 27c1-8 6.5-14 16-14s15 6 16 14" />
      <path {...SHARED} d="M8 27c0 6.6 7.2 10 16 10s16-3.4 16-10" />
      <circle cx="24" cy="24" r="4.5" {...SHARED} />
    </svg>
  );
}

export function TwoFistsIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-hidden="true">
      <rect x="6" y="16" width="14" height="16" rx="6" {...SHARED} />
      <path {...SHARED} d="M9 20h8M9 24h8M9 28h8" />
      <rect x="28" y="16" width="14" height="16" rx="6" {...SHARED} />
      <path {...SHARED} d="M31 20h8M31 24h8M31 28h8" />
    </svg>
  );
}

export const HAND_PORTION_ILLUSTRATION: Record<
  'palm' | 'thumb' | 'cupped-hand' | 'two-fists',
  (props: IllustrationProps) => JSX.Element
> = {
  palm: PalmIllustration,
  thumb: ThumbIllustration,
  'cupped-hand': CuppedHandIllustration,
  'two-fists': TwoFistsIllustration,
};
