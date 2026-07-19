/**
 * Hand Portion Guide — Palm / Thumb / Cupped Hand / Two Fists, using
 * custom line-art illustrations (illustrations/HandPortionIllustrations.tsx),
 * never emoji, per the brief.
 */

import { HAND_PORTION_GUIDE } from '@/lib/primal-pattern/premium/content';
import { HAND_PORTION_ILLUSTRATION } from '../illustrations/HandPortionIllustrations';

export function HandPortionGuide() {
  return (
    <section className="rounded-[32px] bg-white p-7 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Hand Portion Guide
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[#6B7A72]">
        A simple, no-scale-needed way to estimate portions using your own hand.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {HAND_PORTION_GUIDE.map((entry) => {
          const Illustration = HAND_PORTION_ILLUSTRATION[entry.shape];
          return (
            <div key={entry.shape} className="rounded-2xl border border-[#EDEBE3] p-4 text-center">
              <Illustration className="mx-auto h-12 w-12 text-[#1B3A2D]" />
              <p className="mt-3 text-sm font-semibold text-[#1B3A2D]">{entry.title}</p>
              <p className="mt-0.5 text-xs font-medium text-[#8A6B0F]">{entry.represents}</p>
              <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">{entry.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
