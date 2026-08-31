import Image from 'next/image';

/**
 * The Rooted Reset brand lockup: the mark, the name in the display face,
 * and "by MEF Wellness" underneath it.
 *
 * WHY IT IS A COMPONENT NOW. This exact markup already existed hand rolled
 * in app/(auth)/layout.tsx, and the public entry experience needed the same
 * thing. Two copies is a coincidence, three is a divergence waiting to
 * happen, and this one is the first impression a stranger gets of the
 * brand. The auth layout now renders this and is byte for byte unchanged.
 *
 * A separate, deliberately different stacked variant lives in
 * app/onboarding/OnboardingIntro.tsx (mark above a small "by MEF Wellness",
 * with no wordmark) and is left alone: it is a different composition for a
 * different screen, not a copy of this one.
 */
export function RootedResetLockup({
  /** Larger for a standalone first impression, default for a form header. */
  size = 'default',
  className = '',
}: {
  size?: 'default' | 'large';
  className?: string;
}) {
  const markSize = size === 'large' ? 44 : 36;

  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <Image
        src="/images/rooted-reset-logo.png"
        alt="Rooted Reset"
        width={markSize}
        height={markSize}
        priority={size === 'large'}
        style={{ objectFit: 'contain', borderRadius: size === 'large' ? '10px' : '8px' }}
      />
      <div className="leading-tight">
        <span
          className={`block font-[family-name:var(--font-cormorant-garamond)] tracking-wide text-[#1B3A2D] ${
            size === 'large' ? 'text-xl' : 'text-lg'
          }`}
        >
          Rooted Reset
        </span>
        <span className="block text-[11px] font-medium uppercase tracking-wider text-[#6B7A72]">
          by MEF Wellness
        </span>
      </div>
    </div>
  );
}
